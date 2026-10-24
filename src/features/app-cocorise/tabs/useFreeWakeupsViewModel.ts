import { formatAgo, formatInt } from "@/lib/format";
import { buildFunnel } from "../data/funnel";
import { gateOf } from "../data/gate";
import type { FirestoreData } from "../data/useFirestoreReport";
import { FREE_FUNNEL_LABELS, PROVIDER_LABELS } from "../labels";

export type FreeUserRow = { key: string; user: string; limit: string; done: string; left: string; premium: boolean; reconnected: boolean; provider: string; lastSeen: string; lastSeenTitle: string };

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** "Réveils gratuits": old "Free Wakeups Funnel" + "User Free Wakeups". */
export function useFreeWakeupsViewModel(fs: FirestoreData) {
  const r = fs.report;
  const gate = gateOf(fs);
  if (!r) return { gate, kpis: null, funnel: null, users: null, usersNote: null };
  const f = r.freeWakeups;
  const t = f.totals;
  const kpis = [
    { key: "users", label: "Utilisateurs dans le quota", value: formatInt(t.users), foot: `${formatInt(t.assigned)} avec un quota attribué` },
    { key: "remaining", label: "Ont encore des réveils", value: formatInt(t.withRemaining), foot: `${formatInt(t.exhausted)} ont tout utilisé` },
    { key: "done", label: "Réveils gratuits terminés", value: formatInt(t.totalCompleted), foot: `${formatInt(t.completedAtLeastOne)} utilisateurs au moins 1` },
    { key: "reconnected", label: "Se sont reconnectés", value: formatInt(t.reconnected), foot: `${formatInt(t.premiumUnlocked)} passés premium` },
  ];
  const funnel = buildFunnel(f.funnel.map((s) => ({ key: s.id, label: FREE_FUNNEL_LABELS[s.id] ?? s.id, users: s.users })));
  const users: FreeUserRow[] = f.users.map((u) => ({
    key: u.userId,
    user: u.userId.length > 12 ? `${u.userId.slice(0, 6)}…${u.userId.slice(-4)}` : u.userId,
    limit: formatInt(u.limit),
    done: formatInt(u.completed),
    left: formatInt(u.remaining),
    premium: u.premium,
    reconnected: u.reconnected,
    provider: PROVIDER_LABELS[u.provider] ?? u.provider,
    lastSeen: formatAgo(u.lastSeenAt),
    lastSeenTitle: dateTime.format(new Date(u.lastSeenAt)),
  }));
  const usersNote = f.userCount > f.users.length ? `${formatInt(f.users.length)} affichés sur ${formatInt(f.userCount)} (les plus avancés d'abord)` : `${formatInt(f.userCount)} utilisateurs, les plus avancés d'abord`;
  return { gate, kpis, funnel, users, usersNote };
}
