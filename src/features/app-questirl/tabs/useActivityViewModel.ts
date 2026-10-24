import { useMemo } from "react";
import { formatDateTime, formatInt, toBars } from "../format";
import type { KpiItem, QuestirlSummary } from "../types";

export type RecentRow = { key: string; time: string; user: string; event: string; page: string; props: string };

/** Activité produit: quests, page views, event mix, latest raw events. */
export function useActivityViewModel(data: QuestirlSummary | null) {
  return useMemo(() => {
    if (!data) return null;
    const c = data.cards;
    const kpis: KpiItem[] = [
      { key: "kept", label: "Quêtes validées", value: formatInt(c.questKept), foot: "quest_kept / quest_completed" },
      { key: "passed", label: "Quêtes passées", value: formatInt(c.questPassed), foot: "quest_passed" },
      { key: "manual", label: "Tâches manuelles", value: formatInt(c.manualTasks), foot: "créées ou feuille ouverte" },
      { key: "pv", label: "Pages vues", value: formatInt(c.pageViews), foot: `${formatInt(c.events)} events au total` },
    ];
    const recent: RecentRow[] = data.recentEvents.map((e, i) => ({ key: `${e.timestamp}-${i}`, time: formatDateTime(e.timestamp), user: e.user, event: e.event, page: e.page, props: e.props === "{}" ? "" : e.props }));
    return { kpis, pages: toBars(data.pages), events: toBars(data.eventCounts, "var(--series-7)"), recent };
  }, [data]);
}
