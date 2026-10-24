import { api } from "@convex/_generated/api";
import { useEffect, useRef } from "react";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { formatDay, formatInt, formatPct } from "@/lib/format";
import type { BarListItem } from "@/ui";
import { ratio } from "../data/funnel";
import { gateOf } from "../data/gate";
import type { FirestoreData } from "../data/useFirestoreReport";

export type TypeRow = { key: string; type: string; scheduled: string; opened: string; openRate: string; foreground: string; toCompleted: string; toFree: string; toPremium: string; toAuth: string };
export type PushRow = { key: string; name: string; sent: string; delivered: string; clicked: string; ctr: string };

const pct = (a: number, b: number) => {
  const v = ratio(a, b);
  return v == null ? "—" : formatPct(v);
};

/** "Notifications": old "Notifications" (in-app tracked) + OneSignal push stats (read-only API). */
export function useNotificationsViewModel(fs: FirestoreData) {
  const r = fs.report;
  const gate = gateOf(fs);

  let kpis = null;
  let types: TypeRow[] | null = null;
  let campaigns: BarListItem[] | null = null;
  if (r) {
    const n = r.notifications;
    kpis = [
      { key: "types", label: "Types suivis", value: formatInt(n.totals.typesTracked), foot: "familles de notifications" },
      { key: "scheduled", label: "Utilisateurs exposés", value: formatInt(n.totals.scheduledUsers), foot: "au moins une notif programmée" },
      { key: "opened", label: "Utilisateurs qui ont ouvert", value: formatInt(n.totals.openedUsers), foot: pct(n.totals.openedUsers, n.totals.scheduledUsers) + " des exposés" },
      { key: "fg", label: "Vues app ouverte", value: formatInt(n.totals.foregroundUsers), foot: "notif reçue au premier plan" },
    ];
    types = n.byType.map((t) => ({
      key: t.type,
      type: t.type,
      scheduled: formatInt(t.scheduled),
      opened: formatInt(t.opened),
      openRate: pct(t.opened, t.scheduled),
      foreground: formatInt(t.foreground),
      toCompleted: pct(t.openedThenCompleted, t.opened),
      toFree: pct(t.openedThenFreeWakeup, t.opened),
      toPremium: pct(t.openedThenPremium, t.opened),
      toAuth: pct(t.openedThenAuth, t.opened),
    }));
    campaigns = n.byCampaign.map((c) => ({
      key: `${c.type}:${c.id}`,
      label: `${c.type} · ${c.id}`,
      value: c.opened,
      color: "var(--series-1)",
      hint: `${formatInt(c.scheduled)} programmées · ${pct(c.opened, c.scheduled)} d'ouverture · ${formatInt(c.openedThenPremium)} premium ensuite`,
    }));
  }

  /* OneSignal (independent of the period: the API gives the current state and the sent messages). */
  const os = useSolisQuery(api.cocoriseAnalytics.oneSignal, {});
  const refreshOs = useSolisAction(api.sources.cocoriseAnalytics.refreshOneSignal);
  const asked = useRef(false);
  useEffect(() => {
    if (os?.needsRefresh && !asked.current) {
      asked.current = true;
      refreshOs({}).catch(() => undefined);
    }
  }, [os?.needsRefresh, refreshOs]);
  const p = os?.payload ?? null;
  const missingOs = os?.error?.includes("manquante") ? os.error.replace(" manquante sur Convex", "") : null;
  const push = p
    ? {
        kpis: [
          { key: "players", label: "Abonnés push", value: formatInt(p.players), foot: "appareils enregistrés" },
          { key: "msg", label: "Joignables", value: formatInt(p.messageablePlayers), foot: pct(p.messageablePlayers, p.players) + " des abonnés" },
          { key: "sent", label: "Messages envoyés", value: formatInt(p.notificationsTotal), foot: p.createdAt ? `depuis le ${formatDay(p.createdAt)}` : "" },
          { key: "clicks", label: "Clics sur 30 jours", value: p.clicks30d == null ? "—" : formatInt(p.clicks30d), foot: "outcome os__click" },
        ],
        rows: p.notifications.map<PushRow>((m) => ({
          key: m.id,
          name: m.name,
          sent: m.sentAt ? formatDay(new Date(m.sentAt).toISOString()) : "—",
          delivered: formatInt(m.received ?? m.successful),
          clicked: formatInt(m.converted),
          ctr: pct(m.converted, m.received ?? m.successful),
        })),
      }
    : null;

  return { gate, kpis, types, campaigns, push, pushLoading: !os, pushError: !p ? (os?.error ?? null) : null, missingOs, pushFetchedAt: os?.fetchedAt ?? null };
}
