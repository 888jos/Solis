import { api } from "@convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { usePeriod } from "@/lib/filters";
import { formatDateTime } from "./format";
import type { QuestirlSummary } from "./types";

export const TABS = [
  { value: "overview", label: "Vue d'ensemble" },
  { value: "onboarding", label: "Onboarding" },
  { value: "conversion", label: "Paywall & segments" },
  { value: "creators", label: "Codes créateurs" },
  { value: "notifications", label: "Notifications" },
  { value: "answers", label: "Réponses" },
  { value: "activity", label: "Activité produit" },
] as const;
export type TabKey = (typeof TABS)[number]["value"];

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Page-level ViewModel for Apps > Quest IRL: tab in the URL (?tab=), PostHog summary for the global
 * period (from the period start up to now: PostHog is live, no Apple-style one-day lag), and the
 * cache refresh (the summary is computed by a Convex action and cached ~15 min).
 */
export function useQuestirlViewModel() {
  const period = usePeriod();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.value === tabParam) ? (tabParam as TabKey) : "overview";
  const setTab = (next: TabKey) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "overview") p.delete("tab");
      else p.set("tab", next);
      return p;
    });

  const from = period.from;
  const to = todayUtc();
  const result = useSolisQuery(api.questirlAnalytics.summary, { from, to });
  const refreshAction = useSolisAction(api.sources.questirlAnalytics.refresh);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const attempted = useRef(new Set<string>());

  const runRefresh = async (force: boolean) => {
    setRefreshing(true);
    setActionError(null);
    try {
      const res = await refreshAction({ from, to, force });
      if (!res.ok) setActionError("error" in res && res.error ? res.error : "Échec du calcul PostHog");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch from PostHog when the cache entry is missing or older than its TTL (once per window per visit).
  const stale = result && !result.missingEnv.length && (result.fetchedAt == null || Date.now() - result.fetchedAt > result.ttlMs);
  const windowKey = `${from}|${to}`;
  useEffect(() => {
    if (!stale || attempted.current.has(windowKey)) return;
    attempted.current.add(windowKey);
    void runRefresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, windowKey]);

  const data = (result?.payload ?? null) as QuestirlSummary | null;
  const missingEnv = result?.missingEnv ?? [];
  const error = data ? null : (actionError ?? result?.error ?? null);

  const subtitle = [
    `${period.label} jusqu'à maintenant`,
    data ? `${data.ingestion.eventCount.toLocaleString("fr-FR")} events PostHog` : null,
    data ? `schéma ${data.analyticsSchema === "v2" ? "v2" : "ancien (fallback)"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const sourceNote = data
    ? `PostHog projet ${data.projectID} · dernier event ${formatDateTime(data.ingestion.latestEventAt)}`
    : "PostHog";

  return {
    tab,
    setTab,
    tabs: TABS.map((t) => ({ value: t.value, label: t.label })),
    data,
    loading: result === undefined || (!data && !error && !missingEnv.length),
    computing: refreshing,
    missingEnv,
    error,
    refresh: () => void runRefresh(true),
    subtitle,
    sourceNote,
    fetchedAt: result?.fetchedAt ?? null,
    periodDays: { from, to },
  };
}
