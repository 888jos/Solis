import { formatDay, formatInt, formatPct } from "@/lib/format";
import type { BarListItem } from "@/ui";
import { ratio } from "../data/funnel";
import { gateOf } from "../data/gate";
import type { FirestoreData } from "../data/useFirestoreReport";
import { ALL_STEPS, SOURCE_LABELS, stepLabel, SUMMARY_STEPS } from "../labels";

export type StepRow = { key: string; label: string; id: string; users: string; fromPrev: string; share: string; shareValue: number; key2: boolean };
export type DayRow = { key: string; day: string; started: string; completed: string; rate: string };

/** "Onboarding": full step breakdown, acquisition sources, daily table (old "Full Step Breakdown", "Acquisition Sources", "Daily Trend"). */
export function useOnboardingViewModel(fs: FirestoreData) {
  const r = fs.report;
  const gate = gateOf(fs);
  if (!r) return { gate, kpis: null, steps: null, sources: null, sourcesTotal: 0, days: null };
  const t = r.totals;

  const byStep = new Map(r.steps.map((s) => [s.id, s.users]));
  const usersOf = (id: string) => (id === "completed" ? t.completed : (byStep.get(id) ?? 0));
  // Same rule as the old dashboard: steps with users, plus the key steps even at 0.
  const ids = ALL_STEPS.filter((id) => usersOf(id) > 0 || SUMMARY_STEPS.includes(id));
  // Steps seen in the data but not in the known order (new screens): appended at the end.
  const extra = r.steps.map((s) => s.id).filter((id) => !ALL_STEPS.includes(id) && id !== "completed");
  const ordered = [...ids, ...extra];
  const steps: StepRow[] = ordered.map((id, i) => {
    const users = usersOf(id);
    const prevUsers = i > 0 ? usersOf(ordered[i - 1]) : null;
    const share = ratio(users, t.started);
    return {
      key: id,
      id,
      label: stepLabel(id),
      users: formatInt(users),
      fromPrev: prevUsers == null ? "—" : prevUsers > 0 ? formatPct(users / prevUsers) : "—",
      share: share == null ? "—" : formatPct(share),
      shareValue: Math.min(1, share ?? 0),
      key2: SUMMARY_STEPS.includes(id),
    };
  });

  const sourcesTotal = r.sources.reduce((s, x) => s + x.users, 0);
  const sources: BarListItem[] = [...r.sources]
    .sort((a, b) => b.users - a.users)
    .map((s) => ({ key: s.id, label: SOURCE_LABELS[s.id] ?? s.id, value: s.users, color: "var(--series-2)", hint: sourcesTotal > 0 ? formatPct(s.users / sourcesTotal) : undefined }));

  const days: DayRow[] = [...r.daily]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({ key: d.date, day: formatDay(d.date), started: formatInt(d.started), completed: formatInt(d.completed), rate: d.started > 0 ? formatPct(d.completed / d.started) : "—" }));

  const kpis = [
    { key: "onb", label: "Utilisateurs en onboarding", value: formatInt(t.onboardingUsers), foot: "au moins un écran vu" },
    { key: "started", label: "Démarrés", value: formatInt(t.started), foot: "onboarding_started" },
    { key: "completed", label: "Terminés", value: formatInt(t.completed), foot: "onboarding_completed" },
    { key: "rate", label: "Taux de complétion", value: t.started > 0 ? formatPct(t.completed / t.started) : "—", foot: "terminés / démarrés" },
  ];

  return { gate, kpis, steps, sources, sourcesTotal, days };
}
