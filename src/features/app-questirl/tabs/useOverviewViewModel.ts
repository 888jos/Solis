import { useMemo } from "react";
import { formatDayLong } from "@/lib/format";
import type { Series } from "@/ui";
import { daysBetween, formatDay, formatInt, formatSeconds, pct100 } from "../format";
import type { DailyRow, KpiItem, QuestirlSummary } from "../types";

export type DailyTableRow = { key: string; date: string; activeUsers: string; started: string; completed: string; paywall: string; purchases: string; notifOpens: string; notifPurchases: string; notifQuests: string; quests: string };
export type HealthItem = { key: string; label: string; value: string; foot: string };

/** Vue d'ensemble: audience KPIs, funnel health, daily activity. */
export function useOverviewViewModel(data: QuestirlSummary | null, window: { from: string; to: string }) {
  return useMemo(() => {
    if (!data) return null;
    const c = data.cards;
    const kpis: KpiItem[] = [
      { key: "dau", label: "Actifs aujourd'hui", value: formatInt(c.dau), foot: "DAU", hint: "Utilisateurs distincts avec au moins un event aujourd'hui (UTC)" },
      { key: "wau", label: "Actifs 7 jours", value: formatInt(c.wau), foot: "WAU", hint: "Utilisateurs distincts des 7 derniers jours (dans la période choisie)" },
      { key: "mau", label: "Actifs 30 jours", value: formatInt(c.mau), foot: "MAU", hint: "Utilisateurs distincts des 30 derniers jours (dans la période choisie)" },
      { key: "users", label: "Utilisateurs sur la période", value: formatInt(c.users), foot: `${formatInt(c.events)} events` },
    ];
    const kpis2: KpiItem[] = [
      { key: "d1", label: "Rétention J1", value: pct100(c.d1Retention), foot: data.ingestion.retentionDay ? `actifs du ${formatDay(data.ingestion.retentionDay)}` : undefined, hint: "Part des actifs du dernier jour de la période qui étaient aussi actifs la veille (mesure simplifiée)" },
      { key: "d7", label: "Rétention J7", value: pct100(c.d7Retention), foot: "même jour, 7 j avant", hint: "Part des actifs du dernier jour de la période qui étaient aussi actifs 7 jours avant (mesure simplifiée)" },
      { key: "onb", label: "Onboarding terminé", value: pct100(c.onboardingCompletionRate), foot: `${formatInt(c.onboardingCompleted)} / ${formatInt(c.onboardingStarted)} tentatives` },
      { key: "quests", label: "Quêtes validées", value: formatInt(c.questKept), foot: `${formatInt(c.questPassed)} passées` },
    ];

    const w = data.funnelHealth.worstDropoff;
    const s = data.funnelHealth.slowestStep;
    const health: HealthItem[] = [
      { key: "drop", label: "Plus gros décrochage", value: w ? w.stepID : "En attente de données", foot: w ? `${formatInt(w.dropoff)} tentatives perdues avant ${w.nextStepID ?? "la suite"}` : "" },
      { key: "slow", label: "Écran le plus lent", value: s ? s.stepID : "En attente de données", foot: s ? `médiane ${formatSeconds(s.medianDuration)} · P90 ${formatSeconds(s.p90Duration)}` : "" },
      { key: "pw", label: "Conversion paywall", value: `${pct100(c.paywallConversionRate)} · ${formatInt(c.paywallBuyers)} achats`, foot: `${formatInt(c.paywallViewers)} personnes ont vu le paywall` },
    ];

    const x = daysBetween(window.from, window.to);
    const byDay = new Map(data.daily.map((d) => [d.date, d]));
    const col = (k: keyof DailyRow) => x.map((d) => Number(byDay.get(d)?.[k] ?? 0));
    const activeSeries: Series[] = [{ key: "au", label: "Utilisateurs actifs", color: "var(--series-1)", values: col("activeUsers") }];
    const conversionSeries: Series[] = [
      { key: "started", label: "Démarrages onboarding", color: "var(--series-4)", values: col("onboardingStarted") },
      { key: "completed", label: "Onboardings terminés", color: "var(--series-5)", values: col("onboardingCompleted") },
      { key: "purchases", label: "Essais / achats", color: "var(--series-6)", values: col("paywallPurchased") },
    ];

    const dailyRows: DailyTableRow[] = [...data.daily].reverse().map((d) => ({
      key: d.date,
      date: formatDay(d.date),
      activeUsers: formatInt(d.activeUsers),
      started: formatInt(d.onboardingStarted),
      completed: formatInt(d.onboardingCompleted),
      paywall: formatInt(d.paywallViewed),
      purchases: formatInt(d.paywallPurchased),
      notifOpens: formatInt(d.notificationOpened),
      notifPurchases: formatInt(d.notificationAssistedPurchases),
      notifQuests: formatInt(d.notificationAssistedQuestCompletions),
      quests: formatInt(d.questsKept),
    }));

    return {
      kpis,
      kpis2,
      health,
      chartX: x,
      activeSeries,
      conversionSeries,
      hasActivity: data.daily.length > 0,
      hasConversion: conversionSeries.some((s) => s.values.some((v) => (v ?? 0) > 0)),
      dailyRows,
      formatX: formatDay,
      formatXLong: formatDayLong,
    };
  }, [data, window.from, window.to]);
}
