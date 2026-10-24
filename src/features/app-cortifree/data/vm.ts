import type { BarListItem, Series } from "@/ui";
import { change, formatDay, formatDayLong, formatDecimal, formatEur, formatInt, formatPct } from "@/lib/format";
import type { BreakdownOut, FunnelP, KpiOut, LinesP } from "./payloads";
import type { Cell } from "./useWidgets";

// View-model types shared by the CortiFree tabs, and the small builders that turn widget payloads into them.

export type Waiting = { title: string; events?: string[]; note?: string };

export type KpiVM = {
  key: string;
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  foot?: string;
  hint?: string;
  spark?: (number | null)[];
  color: string;
  waiting?: boolean;
};

export type ChartVM = {
  x: string[];
  series: Series[];
  kind?: "line" | "area" | "bar" | "bar-grouped";
  formatValue: (v: number) => string;
  formatX: (x: string) => string;
  formatXLong: (x: string) => string;
  showTotal?: boolean;
  waiting?: string[];
  tags?: string[];
};

export type BarsVM = { items: BarListItem[]; formatValue: (v: number) => string; subtitle?: string };

export type TableVM = { columns: { key: string; header: string; align?: "left" | "right"; muted?: boolean }[]; rows: Record<string, string>[]; note?: string; strongLast?: boolean };

export type FunnelStepVM = { key: string; label: string; hint?: string; count: string; share: number; ofFirst: string; conversion: string | null; worst: boolean; muted?: boolean };
export type FunnelVM = { steps: FunnelStepVM[]; tags: string[]; waiting?: string[]; note?: string };

/** Card content: either data to draw, or an explicit "waiting for…" state. */
export type Content<T> = { kind: "data"; data: T } | { kind: "waiting"; waiting: Waiting };
export type CardVM<T> = Cell<Content<T>>;

export const data = <T,>(d: T): Content<T> => ({ kind: "data", data: d });
export const waiting = (w: Waiting): Content<never> => ({ kind: "waiting", waiting: w });

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
export const color = (i: number) => SERIES[i % SERIES.length];

/* ---------- formatting (on top of src/lib/format.ts) ---------- */

/** Counts: whole numbers from 100, one decimal below. */
export const fmtNum = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : Math.abs(v) >= 100 || Number.isInteger(v) ? formatInt(v) : formatDecimal(v));

/** Amounts in the source currency (RevenueCat reports USD for this project). EUR goes through formatEur. */
export function fmtMoney(v: number | null | undefined, currency = "USD"): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (currency === "EUR") return formatEur(v);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }).format(v);
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const s = ms / 1000;
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${formatDecimal(s / 3600)} h`;
  return `${formatDecimal(s / 86400)} j`;
}

export const pct0 = (v: number | null | undefined) => formatPct(v, 0);
export const ratio = (a: number, b: number) => (b ? a / b : null);
export const dayAxis = { formatX: formatDay, formatXLong: formatDayLong };
export const waitingFor = (events: string[], title = "Pas encore de données", note?: string): Waiting => ({ title, events, note });

/* ---------- builders ---------- */

/** KPI tile from a kpis widget item. */
export function kpiVM(out: KpiOut | undefined, label: string, i: number, opts: { format?: (v: number) => string; foot?: (o: KpiOut) => string | undefined; invert?: boolean; hint?: string } = {}): KpiVM {
  const c = color(i);
  if (!out) return { key: label, label, value: "—", color: c, waiting: true, foot: "—" };
  if (out.missing || out.missingNote || out.value == null) {
    return { key: out.key, label, value: "—", color: c, waiting: true, foot: out.missingNote ?? (out.missing ? `En attente : ${out.missing.join(" / ")}` : "Pas de donnée"), hint: out.missing?.join(", ") };
  }
  const format = opts.format ?? fmtNum;
  return {
    key: out.key,
    label,
    value: format(out.value),
    delta: out.prev === undefined ? undefined : out.prev == null ? null : change(out.value, out.prev),
    invert: opts.invert,
    foot: opts.foot ? opts.foot(out) : out.prev != null ? `préc. ${format(out.prev)}` : undefined,
    hint: opts.hint ?? (out.events?.length ? out.events.join(" + ") : undefined),
    spark: out.spark,
    color: c,
  };
}

/** Line chart from a lines widget; lines without data are listed as waiting. */
export function linesChart(p: LinesP, labels: Record<string, string>, opts: { colors?: Record<string, string>; formatValue?: (v: number) => string; kind?: ChartVM["kind"] } = {}): Content<ChartVM> {
  const present = p.lines.filter((l) => !l.missing);
  if (!present.length) return waiting(waitingFor(p.lines.flatMap((l) => l.candidates)));
  return data({
    x: p.x,
    series: present.map((l, i) => ({ key: l.key, label: labels[l.key] ?? l.key, color: opts.colors?.[l.key] ?? color(i), values: l.values })),
    kind: opts.kind,
    formatValue: opts.formatValue ?? fmtNum,
    ...dayAxis,
    waiting: p.lines.filter((l) => l.missing).map((l) => `${labels[l.key] ?? l.key} (${l.candidates.join(" / ") || "—"})`),
  });
}

/** Ranked bars from one breakdown item. */
export function breakdownBars(b: BreakdownOut | undefined, opts: { sortNumeric?: boolean; labels?: Record<string, string>; colorIndex?: number; share?: boolean } = {}): Content<BarsVM> {
  if (!b) return waiting({ title: "Pas encore de données" });
  if (b.missing) return waiting(b.reason ? { title: b.reason } : waitingFor([b.event]));
  const rows = b.rows.filter((r) => r.total > 0);
  if (!rows.length) return waiting({ title: "Aucun événement sur la période" });
  if (opts.sortNumeric) rows.sort((a, c) => Number(a.value) - Number(c.value));
  const total = rows.reduce((t, r) => t + r.total, 0);
  return data({
    items: rows.map((r) => ({ key: r.value, label: opts.labels?.[r.value] ?? opts.labels?.[r.value.toLowerCase()] ?? r.value, value: r.total, color: color(opts.colorIndex ?? 0), hint: r.value })),
    formatValue: opts.share ? (v: number) => `${fmtNum(v)} · ${pct0(total ? v / total : null)}` : fmtNum,
    subtitle: b.prop ? `${b.event} · ${b.prop}` : b.event,
  });
}

/** Funnel rows from counts, with the step that loses the most people flagged. */
export function funnelSteps(steps: { key: string; label: string; count: number; hint?: string; muted?: boolean }[]): FunnelStepVM[] {
  const base = steps[0]?.count ?? 0;
  let worst = -1;
  let worstDrop = 0;
  steps.forEach((s, i) => {
    if (i === 0) return;
    const drop = steps[i - 1].count - s.count;
    if (steps[i - 1].count > 0 && drop > worstDrop) {
      worstDrop = drop;
      worst = i;
    }
  });
  return steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].count : null;
    return {
      key: s.key,
      label: s.label,
      hint: s.hint,
      muted: s.muted,
      count: fmtNum(s.count),
      share: base ? Math.min(1, s.count / base) : 0,
      ofFirst: base ? pct0(s.count / base) : "—",
      conversion: prev ? pct0(s.count / prev) : null,
      worst: i === worst,
    };
  });
}

/** Ordered Amplitude funnel widget → funnel view. */
export function amplitudeFunnel(p: FunnelP): Content<FunnelVM> {
  if (!p.computed) return waiting({ title: "Entonnoir pas encore calculable", note: `Il faut au moins deux étapes avec des données.${p.waiting.length ? ` En attente : ${p.waiting.join(", ")}.` : ""}` });
  const first = p.steps[0]?.count ?? 0;
  const last = p.steps[p.steps.length - 1];
  const tags = [`Conversion globale ${formatPct(first ? last.count / first : null)}`];
  if (p.steps.length > 1 && last.medianMs && last.medianMs > 0) tags.push(`Délai médian dernière étape ${fmtDuration(last.medianMs)}`);
  return data({
    steps: funnelSteps(p.steps.map((s, i) => ({ key: `${i}-${s.label}`, label: s.label, count: s.count, hint: `${s.event}${i > 0 && s.medianMs != null ? ` · délai médian ${fmtDuration(s.medianMs)}` : ""}` }))),
    tags,
    waiting: p.waiting,
  });
}

/** Segment × steps table (ICP-style funnel grouped by a property): first column count, then % (n). */
export function segmentTable(steps: string[], segments: { value: string; counts: number[] }[], label: (v: string) => string, firstHeader = "Utilisateurs"): TableVM {
  return {
    columns: [{ key: "seg", header: "Segment" }, { key: "s0", header: firstHeader, align: "right" }, ...steps.slice(1).map((s, i) => ({ key: `s${i + 1}`, header: s, align: "right" as const }))],
    rows: segments.map((sg) => ({
      seg: label(sg.value),
      s0: fmtNum(sg.counts[0]),
      ...Object.fromEntries(sg.counts.slice(1).map((n, i) => [`s${i + 1}`, `${pct0(sg.counts[0] ? n / sg.counts[0] : null)} (${fmtNum(n)})`])),
    })),
  };
}
