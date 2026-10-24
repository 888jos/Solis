import { api } from "@convex/_generated/api";
import type { WidgetRequest } from "@convex/cortifreeAnalytics";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { usePeriod } from "@/lib/filters";

// Model access for the CortiFree page. Each tab ViewModel declares the widgets it needs; this hook reads
// their cached payloads (reactive Convex query) and asks the Node action to compute the missing or expired
// ones. Results land in the cache one widget at a time, so cards fill in progressively.

export type Cell<T> = { state: "loading" } | { state: "error"; message: string; retry: () => void } | { state: "ready"; data: T; fetchedAt: number };

/** "Actualiser" in the page header bumps this tick: every mounted tab then recomputes its widgets. */
export const RefreshContext = createContext<{ tick: number; setBusy: (key: string, busy: boolean) => void }>({ tick: 0, setBusy: () => {} });

const RETRY_MS = 90_000;

type Spec = Omit<WidgetRequest, "from" | "to"> & { periodless?: boolean };

/** Widgets keyed by a local name → cells with the parsed payloads. */
export function useWidgets<K extends string>(specs: Record<K, Spec | null>): { cell: <T>(name: K) => Cell<T>; updatedAt: number | null } {
  const period = usePeriod();
  const { tick, setBusy } = useContext(RefreshContext);
  const names = Object.keys(specs) as K[];
  const signature = JSON.stringify(names.map((n) => specs[n]));
  // Stable list of requests (only the active ones), rebuilt when the specs or the period change.
  const { requests, index } = useMemo(() => {
    const requests: WidgetRequest[] = [];
    const index = new Map<K, number>();
    for (const name of names) {
      const s = specs[name];
      if (!s) continue;
      index.set(name, requests.length);
      requests.push(s.periodless ? { w: s.w, p: s.p } : { w: s.w, p: s.p, from: period.from, to: period.to });
    }
    return { requests, index };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, period.from, period.to]);

  const rows = useSolisQuery(api.cortifreeAnalytics.read, requests.length ? { requests } : "skip");
  const refresh = useSolisAction(api.sources.cortifreeAnalytics.refresh);
  const attempted = useRef(new Map<string, number>());
  const busyId = useRef(`w${Math.random().toString(36).slice(2)}`);
  const [inflight, setInflight] = useState(0);

  const run = useCallback(
    (reqs: WidgetRequest[], force?: boolean) => {
      if (!reqs.length) return;
      setInflight((n) => n + 1);
      refresh({ requests: reqs, force })
        .catch(() => {
          /* errors are written to the cache per widget; a failed call (network) retries on the next pass */
        })
        .finally(() => setInflight((n) => n - 1));
    },
    [refresh],
  );

  useEffect(() => {
    setBusy(busyId.current, inflight > 0);
  }, [inflight, setBusy]);
  useEffect(() => () => setBusy(busyId.current, false), [setBusy]);

  // Ask for whatever is missing or expired (each key at most once per RETRY_MS).
  useEffect(() => {
    if (!rows || rows.length !== requests.length) return;
    const now = Date.now();
    const todo = requests.filter((_, i) => {
      const row = rows[i];
      const stale = (row.payload == null && row.error == null) || row.expiresAt < now;
      if (!stale || now - (attempted.current.get(row.key) ?? 0) < RETRY_MS) return false;
      attempted.current.set(row.key, now);
      return true;
    });
    run(todo);
  }, [rows, requests, run]);

  // Header "Actualiser": recompute everything this tab shows.
  const firstTick = useRef(tick);
  useEffect(() => {
    if (tick === firstTick.current) return;
    run(requests, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const parsed = useMemo(() => {
    const out = new Map<number, unknown>();
    rows?.forEach((row, i) => {
      if (row.payload == null) return;
      try {
        out.set(i, JSON.parse(row.payload));
      } catch {
        /* ignore malformed cache entry: it will be recomputed */
      }
    });
    return out;
  }, [rows]);

  const cell = useCallback(
    <T,>(name: K): Cell<T> => {
      const i = index.get(name);
      if (i == null || !rows || rows.length !== requests.length) return { state: "loading" };
      const row = rows[i];
      if (parsed.has(i)) return { state: "ready", data: parsed.get(i) as T, fetchedAt: row.fetchedAt ?? 0 };
      if (row.error) return { state: "error", message: row.error, retry: () => run([requests[i]], true) };
      return { state: "loading" };
    },
    [index, rows, requests, parsed, run],
  );

  const updatedAt = rows?.length ? Math.min(...rows.map((r) => r.fetchedAt ?? Date.now())) : null;
  return { cell, updatedAt };
}

/** Map a ready cell's data, keep loading / error as they are. */
export function mapCell<T, U>(c: Cell<T>, fn: (data: T) => U): Cell<U> {
  return c.state === "ready" ? { state: "ready", data: fn(c.data), fetchedAt: c.fetchedAt } : c;
}

/** Combine two cells (both must be ready). */
export function mapCells<A, B, U>(a: Cell<A>, b: Cell<B>, fn: (a: A, b: B) => U): Cell<U> {
  if (a.state !== "ready") return a;
  if (b.state !== "ready") return b;
  return { state: "ready", data: fn(a.data, b.data), fetchedAt: Math.min(a.fetchedAt, b.fetchedAt) };
}
