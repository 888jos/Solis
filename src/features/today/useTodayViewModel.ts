import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useState } from "react";
import { appColor, appName } from "@/lib/apps";
import { useSolisAction, useSolisMutation, useSolisQuery } from "@/lib/convex";
import { change, formatDay, formatDayLong, formatDecimal, formatEur, formatInt, formatMonthLong, formatPct } from "@/lib/format";
import type { Status } from "@/ui";

type Unit = "eur" | "int" | "pct" | "decimal";

export function formatUnit(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  if (unit === "eur") return formatEur(value);
  if (unit === "pct") return formatPct(value);
  if (unit === "decimal") return formatDecimal(value);
  return formatInt(Math.round(value));
}

export const projectName = (p: string) => (p === "studio" ? "Studio" : appName(p));
export const projectColor = (p: string) => (p === "studio" ? "var(--text-2)" : appColor(p));

const SEVERITY: Record<string, { status: Status; label: string }> = {
  critical: { status: "critical", label: "Urgent" },
  warning: { status: "warning", label: "À faire" },
  neutral: { status: "neutral", label: "Ensuite" },
};

const KIND_LABEL: Record<string, string> = { release: "Version", price: "Prix / offre", campaign: "Campagne", content: "Contenu", product: "Produit", other: "Autre" };
const DECISION: Record<string, string> = { keep: "Gardée", drop: "Abandonnée", inconclusive: "Pas concluant" };

const METRIC_SHORT: Record<string, string> = { net: "Net", downloads: "Téléch.", reports: "Rapports", payments: "Paiements" };

function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function useTodayViewModel() {
  const month = parisToday().slice(0, 7);
  const from = (() => {
    const d = new Date(`${parisToday()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 60);
    return d.toISOString().slice(0, 10);
  })();
  const today = useSolisQuery(api.pilot.today, {});
  const catalog = useSolisQuery(api.pilot.catalog, {});
  const goals = useSolisQuery(api.pilot.goals, { month });
  const experiments = useSolisQuery(api.pilot.experiments, {});
  const annotations = useSolisQuery(api.pilot.annotations, { from, to: parisToday() });

  const setGoal = useSolisMutation(api.pilot.setGoal);
  const removeGoal = useSolisMutation(api.pilot.removeGoal);
  const addExperiment = useSolisMutation(api.pilot.addExperiment);
  const decideExperiment = useSolisMutation(api.pilot.decideExperiment);
  const removeExperiment = useSolisMutation(api.pilot.removeExperiment);
  const addAnnotation = useSolisMutation(api.pilot.addAnnotation);
  const removeAnnotation = useSolisMutation(api.pilot.removeAnnotation);
  const review = useSolisQuery(api.pilot.latestReview, {});
  const writeReview = useSolisAction(api.review.writeNow);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/^.*Uncaught Error: /s, "").split("\n")[0]);
      return false;
    }
  };

  const loading = !today || !catalog || !goals || !experiments || !annotations || review === undefined;
  if (loading) return { loading: true as const, monthLabel: formatMonthLong(month) };

  const metricsFor = (project: string) => catalog.metrics.filter((m) => m.projects.includes(project));
  const unitOf = (metric: string) => (catalog.metrics.find((m) => m.key === metric)?.unit ?? "int") as Unit;

  const actions = today.actions.map((a) => ({ ...a, badge: SEVERITY[a.severity] }));

  const pulse = today.pulse.map((p) => ({
    key: `${p.project}:${p.metric}`,
    project: p.project,
    name: projectName(p.project),
    color: projectColor(p.project),
    label: METRIC_SHORT[p.metric] ?? p.metric,
    value: formatUnit(p.value, unitOf(p.metric)),
    delta: p.value == null || p.prev == null ? null : change(p.value, p.prev),
    foot: p.prev == null ? formatDay(p.day) : `${formatDay(p.day)} · sem. préc. ${formatUnit(p.prev, unitOf(p.metric))}`,
  }));

  const goalRows = goals.map((g) => {
    const pct = g.ratio == null ? null : Math.max(0, Math.min(1.5, g.ratio));
    const status: Status = g.ratio == null ? "neutral" : g.ratio >= 1 ? "good" : g.ratio >= 0.9 ? "warning" : "critical";
    return {
      id: g._id as Id<"goals">,
      project: g.project,
      name: projectName(g.project),
      color: projectColor(g.project),
      metric: g.metricLabel,
      value: formatUnit(g.value, g.unit),
      target: formatUnit(g.target, g.unit),
      projection: formatUnit(g.projection, g.unit),
      pct,
      status,
      statusLabel: g.ratio == null ? "Pas de données" : g.ratio >= 1 ? "En avance" : g.ratio >= 0.9 ? "Juste" : "En retard",
      foot: g.dataTo ? `au ${formatDay(g.dataTo)} · jour ${g.elapsed}/${g.total}` : "mois pas commencé",
    };
  });

  const expRows = experiments.map((e) => {
    const r = e.result;
    return {
      id: e._id as Id<"experiments">,
      project: e.project,
      name: projectName(e.project),
      color: projectColor(e.project),
      title: e.title,
      hypothesis: e.hypothesis,
      metric: e.metricLabel,
      period: `${formatDay(e.startDay)} → ${formatDay(e.endDay)}`,
      running: e.status === "running",
      overdue: e.status === "running" && e.endDay < today.today,
      before: formatUnit(r.before, e.unit),
      after: formatUnit(r.after, e.unit),
      delta: r.change,
      measured: r.days ? `${r.days} j mesurés vs ${r.days} j avant` : "Pas encore de données",
      decision: e.decision ? DECISION[e.decision] : null,
      note: e.note ?? null,
    };
  });

  const timeline = annotations.map((a, i) => ({
    key: a._id ?? `release-${i}`,
    id: a._id as Id<"annotations"> | null,
    day: formatDayLong(a.day),
    name: projectName(a.project),
    color: projectColor(a.project),
    kind: KIND_LABEL[a.kind] ?? a.kind,
    label: a.label,
  }));

  return {
    loading: false as const,
    monthLabel: formatMonthLong(month),
    month,
    todayIso: today.today,
    subtitle: `${formatDayLong(today.today)} · ${actions.length ? `${actions.length} action${actions.length > 1 ? "s" : ""}` : "rien d'urgent"}`,
    actions,
    pulse,
    goals: goalRows,
    experiments: expRows,
    timeline,
    projects: catalog.projects.map((p) => ({ value: p, label: projectName(p) })),
    metricsFor,
    kinds: Object.entries(KIND_LABEL).filter(([k]) => k !== "release").map(([value, label]) => ({ value, label })),
    review: review ? { title: `Semaine du ${formatDay(review.weekStart)} au ${formatDay(review.weekEnd)}`, text: review.text } : null,
    reviewBusy,
    onWriteReview: async () => {
      setReviewBusy(true);
      setError(null);
      try {
        const res = await writeReview({});
        if (res.status === "skipped") setError("Ajoute ANTHROPIC_API_KEY dans les variables Convex pour que Claude écrive la revue.");
        else if (res.status === "error") setError(`Revue impossible : ${res.text}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setReviewBusy(false);
      }
    },
    error,
    clearError: () => setError(null),
    onSetGoal: (project: string, metric: string, target: number) => run(() => setGoal({ project, metric, month, target: unitOf(metric) === "pct" ? target / 100 : target })),
    onRemoveGoal: (id: Id<"goals">) => run(() => removeGoal({ id })),
    onAddExperiment: (x: { project: string; title: string; hypothesis: string; metric: string; startDay: string; endDay: string }) => run(() => addExperiment(x)),
    onDecide: (id: Id<"experiments">, decision: "keep" | "drop" | "inconclusive", note?: string) => run(() => decideExperiment({ id, decision, note })),
    onRemoveExperiment: (id: Id<"experiments">) => run(() => removeExperiment({ id })),
    onAddAnnotation: (x: { day: string; project: string; kind: "price" | "campaign" | "content" | "product" | "other"; label: string }) => run(() => addAnnotation(x)),
    onRemoveAnnotation: (id: Id<"annotations">) => run(() => removeAnnotation({ id })),
  };
}

export type TodayViewModel = Extract<ReturnType<typeof useTodayViewModel>, { loading: false }>;
