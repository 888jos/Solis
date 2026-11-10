import { api } from "@convex/_generated/api";
import { useSearchParams } from "react-router-dom";
import { appColor, appName, APPS } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatDayLong, formatEur, formatInt, formatMonth, formatMonthLong } from "@/lib/format";
import type { Series } from "@/ui";

// Graphiques (like RevenueCat charts): metric, resolution, split, chart type, previous period,
// cumulative, table and CSV. Every choice lives in the URL, so a chart can be bookmarked or shared.

export type Resolution = "day" | "week" | "month";
export type ChartType = "line" | "area" | "bar" | "bar-grouped";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)", "var(--series-other)"];
const APP_KEYS = new Set<string>([...APPS.map((a) => a.slug as string), "otto"]);

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "day", label: "Jour" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
];

const TYPES: { value: ChartType; label: string }[] = [
  { value: "line", label: "Courbe" },
  { value: "area", label: "Aire" },
  { value: "bar", label: "Barres" },
  { value: "bar-grouped", label: "Groupées" },
];

function cumulate(values: (number | null)[]): (number | null)[] {
  let acc = 0;
  let seen = false;
  return values.map((v) => {
    if (v == null) return seen ? acc : null;
    seen = true;
    acc += v;
    return Math.round(acc * 100) / 100;
  });
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function useExplorerViewModel() {
  const [params, setParams] = useSearchParams();
  const period = usePeriod();
  const app = useAppFilter();
  const catalog = useSolisQuery(api.explorer.catalog, {});

  const metricKey = params.get("m") ?? "net";
  const metric = catalog?.metrics.find((m) => m.key === metricKey) ?? catalog?.metrics[0];
  const resolution = (["day", "week", "month"].includes(params.get("res") ?? "") ? params.get("res") : period.bucket) as Resolution;
  const segment = metric?.segments.some((s) => s.key === params.get("seg")) ? (params.get("seg") as string) : "none";
  const type = (TYPES.some((t) => t.value === params.get("type")) ? params.get("type") : metric?.additive === false ? "line" : "bar") as ChartType;
  const compare = params.get("cmp") !== "0";
  const cumulative = params.get("cum") === "1" && !!metric?.additive;

  const set = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const data = useSolisQuery(
    api.explorer.series,
    metric ? { metric: metric.key, from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, bucket: resolution, segment, app } : "skip",
  );

  const groups = catalog
    ? [...new Set(catalog.metrics.map((m) => m.group))].map((g) => ({
        group: g,
        items: catalog.metrics.filter((m) => m.group === g).map((m) => ({ key: m.key, label: m.label, description: m.description, active: m.key === metric?.key })),
      }))
    : [];

  const base = {
    subtitle: `${period.label} · ${app ? appName(app) : "Toutes les apps"}`,
    groups,
    onMetric: (key: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("m", key);
        next.delete("seg");
        next.delete("type");
        next.delete("cum");
        return next;
      }),
    resolution,
    resolutions: RESOLUTIONS,
    onResolution: (r: Resolution) => set("res", r),
    segment,
    segments: metric?.segments ?? [],
    onSegment: (s: string) => set("seg", s === "none" ? null : s),
    type,
    types: TYPES,
    onType: (t: ChartType) => set("type", t),
    compare,
    onCompare: () => set("cmp", compare ? "0" : null),
    cumulative,
    canCumulate: !!metric?.additive,
    onCumulative: () => set("cum", cumulative ? null : "1"),
    title: metric?.label ?? "",
    description: metric?.description ?? "",
  };

  if (!catalog || !metric || !data) return { ...base, loading: true as const };

  const fmt = data.unit === "eur" ? (v: number) => formatEur(v) : (v: number) => formatInt(v);
  const formatX = (x: string) => (resolution === "month" ? formatMonth(x) : formatDay(x));
  const formatXLong = (x: string) => (resolution === "month" ? formatMonthLong(x) : resolution === "week" ? `Semaine du ${formatDay(x)}` : formatDayLong(x));
  const shape = (values: (number | null)[]) => (cumulative ? cumulate(values) : values);

  const series: Series[] = data.series.map((s, i) => ({
    key: s.key,
    label: s.label,
    color: data.segment === "app" && APP_KEYS.has(s.key) ? appColor(s.key) : data.segment === "none" ? (app ? appColor(app) : "var(--brand)") : SERIES_COLORS[Math.min(i, SERIES_COLORS.length - 1)],
    values: shape(s.values),
  }));

  const overlay = compare
    ? {
        key: "previous",
        label: "Période précédente",
        color: "var(--chart-muted)",
        values: shape(data.previous),
        tooltipLabel: (i: number) => (data.prevX[i] ? `Préc. (${formatX(data.prevX[i])})` : "Période précédente"),
      }
    : undefined;

  const delta = data.summary.current == null || data.summary.previous == null ? null : change(data.summary.current, data.summary.previous);

  // Table: newest bucket first, one column per segment, then total and previous period.
  const multi = data.series.length > 1;
  const columns = [...data.series.map((s) => s.label), ...(multi ? ["Total"] : []), ...(compare ? ["Préc."] : [])];
  const rows = data.x
    .map((x, i) => ({
      key: x,
      label: formatXLong(x),
      cells: [
        ...series.map((s) => (s.values[i] == null ? "—" : fmt(s.values[i] as number))),
        ...(multi ? [data.total[i] == null ? "—" : fmt((cumulative ? cumulate(data.total) : data.total)[i] as number)] : []),
        ...(compare ? [overlay?.values[i] == null ? "—" : fmt(overlay.values[i] as number)] : []),
      ],
    }))
    .reverse();

  return {
    ...base,
    loading: false as const,
    hasData: data.hasData,
    unitLabel: data.additive ? (cumulative ? "cumul sur la période" : "total sur la période") : "dernière valeur",
    value: data.summary.current == null ? "—" : fmt(data.summary.current),
    delta,
    previousLabel: data.summary.previous == null ? "pas de période précédente" : `préc. ${fmt(data.summary.previous)}`,
    chart: { x: data.x, series, overlay, formatValue: fmt, formatX, formatXLong, showTotal: multi && data.additive },
    table: { columns, rows },
    onExport: () =>
      downloadCsv(`solis-${data.metric}-${period.from}-${period.to}.csv`, [
        ["Période", ...columns],
        ...data.x.map((x, i) => [
          x,
          ...series.map((s) => (s.values[i] == null ? "" : String(s.values[i]))),
          ...(multi ? [data.total[i] == null ? "" : String(data.total[i])] : []),
          ...(compare ? [overlay?.values[i] == null ? "" : String(overlay.values[i])] : []),
        ]),
      ]),
  };
}

export type ExplorerViewModel = ReturnType<typeof useExplorerViewModel>;
