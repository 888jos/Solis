import { api } from "@convex/_generated/api";
import type { FirestoreReport } from "@convex/cocoriseAnalytics";
import { useCallback, useEffect, useState } from "react";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { usePeriod } from "@/lib/filters";
import { formatDayLong } from "@/lib/format";

// Shared access to the cached Firestore report (one payload feeds every Firestore tab).
// The cache is filled by sources/cocoriseAnalytics:refreshFirestore, triggered here when the query says so.
// Module-level guards: several tabs/ViewModels mount the hook, only one refresh runs per period.

const inflight = new Set<string>();
const lastAttempt = new Map<string, number>();
const RETRY_MS = 5 * 60_000;

export type FirestoreState =
  | { kind: "loading" }
  | { kind: "notConnected"; missing: string }
  | { kind: "empty"; lastDay: string | null }
  | { kind: "error"; message: string; progress: { loaded: number; total: number } | null; resumeAt: number | null }
  | { kind: "building"; progress: { loaded: number; total: number } | null }
  | { kind: "ready"; report: FirestoreReport };

export type FirestoreData = {
  state: FirestoreState;
  report: FirestoreReport | null;
  /** Report covers only part of the period (history still loading within the Firestore daily quota). */
  partial: { loaded: number; total: number; resumeAt: number | null; error: string | null } | null;
  lastDay: string | null;
  lastDayLabel: string | null;
  fetchedAt: number | null;
  refreshing: boolean;
  refresh: () => void;
};

export function useFirestoreReport(): FirestoreData {
  const period = usePeriod();
  const res = useSolisQuery(api.cocoriseAnalytics.firestoreReport, { from: period.from, to: period.to });
  const run = useSolisAction(api.sources.cocoriseAnalytics.refreshFirestore);
  const [, setTick] = useState(0);
  const key = `${period.from}|${period.to}`;

  const trigger = useCallback(
    (force: boolean) => {
      if (inflight.has(key)) return;
      inflight.add(key);
      lastAttempt.set(key, Date.now());
      setTick((t) => t + 1);
      run({ from: period.from, to: period.to, force })
        .catch(() => undefined)
        .finally(() => {
          inflight.delete(key);
          setTick((t) => t + 1);
        });
    },
    [key, period.from, period.to, run],
  );

  const needs = res?.needsRefresh ?? false;
  const resumeAt = res?.backfill?.scheduledFor ?? null;
  const quotaWait = !!res?.error && res.error.startsWith("Quota") && resumeAt != null && resumeAt > Date.now();
  useEffect(() => {
    if (!res || !needs || quotaWait) return;
    if (Date.now() - (lastAttempt.get(key) ?? 0) < RETRY_MS) return;
    trigger(false);
  }, [res, needs, quotaWait, key, trigger]);

  const lastDay = res?.bounds?.lastDay ?? null;
  const missingEnv = res?.error?.includes("COCORISE_FIREBASE_SA_B64") ? "COCORISE_FIREBASE_SA_B64" : null;

  let state: FirestoreState;
  if (!res) state = { kind: "loading" };
  else if (missingEnv) state = { kind: "notConnected", missing: missingEnv };
  else if (res.status === "empty") state = { kind: "empty", lastDay };
  else if (res.status === "ready") state = { kind: "ready", report: res.report };
  else if (res.status === "error") state = { kind: "error", message: res.error ?? "Erreur inconnue", progress: "progress" in res ? (res.progress ?? null) : null, resumeAt };
  else state = { kind: "building", progress: "progress" in res ? (res.progress ?? null) : null };

  const report = res?.status === "ready" ? res.report : null;
  const partial =
    res?.status === "ready" && !res.complete ? { loaded: res.report.coverage.loaded, total: res.report.coverage.total, resumeAt, error: res.error ?? res.backfill?.lastError ?? null } : null;

  return {
    state,
    report,
    partial,
    lastDay,
    lastDayLabel: lastDay ? formatDayLong(lastDay) : null,
    fetchedAt: res?.status === "ready" ? res.fetchedAt : null,
    refreshing: inflight.has(key),
    refresh: () => trigger(true),
  };
}
