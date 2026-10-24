import { useMemo } from "react";
import { formatDayLong } from "@/lib/format";
import type { Series } from "@/ui";
import { daysBetween, formatDateTime, formatDay, formatInt, pct100, toBars } from "../format";
import type { KpiItem, QuestirlSummary } from "../types";

export type CategoryRow = { key: string; name: string; scheduled: string; opened: string; openRate: string; foreground: string; cancelled: string; failures: string; usersOpened: string; latest: string };

const LIFECYCLE_LABELS: Record<string, string> = { non_converted_onboarding: "Onboarding non converti", converted_retention: "Rétention (abonnés)" };

/** Notifications: scheduling, opens, permission opt-in and conversions after an open. */
export function useNotificationsViewModel(data: QuestirlSummary | null, window: { from: string; to: string }) {
  return useMemo(() => {
    if (!data) return null;
    const nf = data.notifications;
    const kpis: KpiItem[] = [
      { key: "scheduled", label: "Notifications programmées", value: formatInt(nf.scheduled), foot: `${formatInt(nf.foreground)} reçues app ouverte`, hint: "notification_scheduled, dédupliquées par notification_id" },
      { key: "opened", label: "Ouvertes", value: formatInt(nf.opened), foot: `${pct100(nf.openRate)} des programmées`, hint: "notification_opened ou notification_action_received, dédupliquées" },
      { key: "optin", label: "Autorisation acceptée", value: pct100(nf.permissionOptInRate), foot: `${formatInt(nf.permissionGranted)} oui · ${formatInt(nf.permissionDenied)} non sur ${formatInt(nf.permissionResults)}`, hint: `notification_permission_result (${formatInt(nf.permissionRequests)} demandes)` },
      { key: "purchases", label: "Achats après une notif", value: formatInt(nf.assistedPaywallPurchased), foot: "dans les 7 j suivant l'ouverture", hint: "Utilisateurs distincts avec un achat ≤ 7 jours après avoir ouvert une notification" },
    ];
    const kpis2: KpiItem[] = [
      { key: "onb", label: "Onboardings terminés après notif", value: formatInt(nf.assistedOnboardingCompleted), foot: "dans les 7 j" },
      { key: "quest", label: "Quête validée après notif", value: formatInt(nf.questCompletedWithin2h), foot: "dans les 2 h suivant l'ouverture" },
      { key: "streak", label: "Série protégée", value: formatInt(nf.streakProtectedWithin2h), foot: "quête < 2 h après un rappel de série", hint: "Ouverture d'une notification streak_reminder puis quête validée dans les 2 h" },
      { key: "permission", label: "Demandes d'autorisation", value: formatInt(nf.permissionRequests), foot: `${pct100(nf.permissionDeniedRate)} de refus` },
    ];

    const x = daysBetween(window.from, window.to);
    const byDay = new Map(data.daily.map((d) => [d.date, d]));
    const col = (k: "notificationScheduled" | "notificationOpened" | "notificationAssistedPurchases" | "notificationAssistedQuestCompletions") => x.map((d) => byDay.get(d)?.[k] ?? 0);
    const volumeSeries: Series[] = [
      { key: "scheduled", label: "Programmées", color: "var(--series-1)", values: col("notificationScheduled") },
      { key: "opened", label: "Ouvertes", color: "var(--series-4)", values: col("notificationOpened") },
    ];
    const assistSeries: Series[] = [
      { key: "purchases", label: "Achats après ouverture", color: "var(--series-6)", values: col("notificationAssistedPurchases") },
      { key: "quests", label: "Quêtes après ouverture", color: "var(--series-7)", values: col("notificationAssistedQuestCompletions") },
    ];

    const categories: CategoryRow[] = nf.categories.map((r) => ({
      key: r.name,
      name: r.name,
      scheduled: formatInt(r.scheduled),
      opened: formatInt(r.opened),
      openRate: pct100(r.openRate),
      foreground: formatInt(r.foreground),
      cancelled: formatInt(r.cancelled),
      failures: formatInt(r.scheduleFailures),
      usersOpened: formatInt(r.usersOpened),
      latest: formatDateTime(r.latestOpenedAt),
    }));

    return {
      kpis,
      kpis2,
      x,
      volumeSeries,
      assistSeries,
      hasVolume: volumeSeries.some((s) => s.values.some((v) => (v ?? 0) > 0)),
      hasAssist: assistSeries.some((s) => s.values.some((v) => (v ?? 0) > 0)),
      categories,
      lifecycle: toBars(nf.lifecycleBreakdown.map((r) => ({ ...r, name: LIFECYCLE_LABELS[r.name] ?? r.name }))),
      rescueByStep: toBars(nf.onboardingByStep),
      retentionByDay: toBars(nf.retentionByProgramDay.map((r) => ({ ...r, name: `Jour ${r.name}` }))),
      copyVariants: toBars(nf.copyVariants),
      formatX: formatDay,
      formatXLong: formatDayLong,
    };
  }, [data, window.from, window.to]);
}
