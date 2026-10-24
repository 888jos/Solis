import { api } from "@convex/_generated/api";
import { APPS, appColor, appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatDayLong, formatEur, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { Series } from "@/ui";

export type RevenueKpi = { key: string; label: string; value: string; delta: number | null; foot: string; hint: string };
export type WaterfallStep = { key: string; label: string; amount: string; kind: "total" | "minus"; start: number; end: number; note?: string };
export type ProductRow = { key: string; title: string; sku: string; appSlug: string; appName: string; kind: string; units: string; refunds: string; gross: string; net: string };
export type RefundRow = { key: string; date: string; title: string; appSlug: string; country: string; units: string; gross: string; net: string };

const TYPE_KIND: Record<string, string> = { IAY: "Abonnement", IA1: "Achat intégré", IA9: "Achat intégré", IAC: "Abonnement" };

/** Revenue page ViewModel: Apple SALES reports for the global period/app filters, ready to render. */
export function useRevenueViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const range = { from: period.from, to: period.to, app };

  const freshness = useSolisQuery(api.revenue.latestDataDay, {});
  const summary = useSolisQuery(api.revenue.summary, { ...range, prevFrom: period.prevFrom, prevTo: period.prevTo });
  const series = useSolisQuery(api.revenue.series, { ...range, bucket: period.bucket });
  const breakdown = useSolisQuery(api.revenue.breakdown, range);
  const refundLines = useSolisQuery(api.revenue.refunds, range);

  const notConnected = freshness !== undefined && freshness.latestDay == null;
  const latestDay = freshness?.latestDay ?? null;
  const lagging = latestDay != null && latestDay < period.to;

  const subtitle = [period.label, app ? appName(app) : "Toutes les apps", latestDay ? `données Apple jusqu'au ${formatDay(latestDay)}` : null].filter(Boolean).join(" · ");

  /* ---------- KPIs ---------- */
  let kpis: RevenueKpi[] | null = null;
  if (summary) {
    const c = summary.current;
    // No previous window when it ends before the first Apple sales day ("Tout", or a young app).
    const hasPrev = freshness?.firstDay != null && freshness.firstDay <= period.prevTo;
    const p = hasPrev ? summary.previous : { grossEur: 0, exVatEur: 0, proceedsEur: 0, paidUnits: 0 };
    const prevFoot = (amount: number) => (hasPrev ? `préc. ${formatEur(amount)}` : "pas de période préc.");
    const delta = (cur: number, prev: number) => (hasPrev ? change(cur, prev) : null);
    kpis = [
      { key: "gross", label: "Brut TTC", value: formatEur(c.grossEur), delta: delta(c.grossEur, p.grossEur), foot: prevFoot(p.grossEur), hint: "Prix payé par les clients, taxes comprises, remboursements déduits" },
      { key: "exvat", label: "Hors taxes", value: formatEur(c.exVatEur), delta: delta(c.exVatEur, p.exVatEur), foot: `TVA ${formatEur(c.vatEur)}`, hint: "Brut sans la TVA du pays d'achat (USA et Canada : prix déjà hors taxe)" },
      { key: "net", label: "Net versé par Apple", value: formatEur(c.proceedsEur), delta: delta(c.proceedsEur, p.proceedsEur), foot: c.grossEur > 0 ? `${formatPct(c.proceedsEur / c.grossEur, 0)} du brut` : prevFoot(p.proceedsEur), hint: "Developer proceeds : après TVA et commission Apple" },
      { key: "sales", label: "Ventes payantes", value: formatInt(c.paidUnits), delta: delta(c.paidUnits, p.paidUnits), foot: `dont ${formatInt(c.renewals)} renouv.`, hint: "Transactions payantes (essais gratuits exclus)" },
    ];
  }

  /* ---------- Net by app over time ---------- */
  let chart: { x: string[]; series: Series[]; total: string; hasData: boolean } | null = null;
  if (series) {
    const known = new Map(series.apps.map((a) => [a.slug, a]));
    const order = [...APPS.map((a) => a.slug), ...series.apps.map((a) => a.slug).filter((s) => !APPS.some((a) => a.slug === s))];
    const chartSeries: Series[] = order
      .map((slug) => known.get(slug))
      .filter((a): a is NonNullable<typeof a> => !!a && (a.slug === app || a.proceedsEur.some((v) => v !== 0)))
      .map((a) => ({ key: a.slug, label: appName(a.slug === "other" ? "Autre" : a.slug), color: appColor(a.slug), values: a.proceedsEur }));
    const total = series.apps.reduce((sum, a) => sum + a.proceedsEur.reduce((s, v) => s + v, 0), 0);
    chart = { x: series.x, series: chartSeries, total: formatEur(total), hasData: chartSeries.some((s) => s.values.some((v) => v !== 0)) };
  }
  const bucket = period.bucket;
  const formatX = (x: string) => (bucket === "month" ? formatMonth(x) : formatDay(x));
  const formatXLong = (x: string) => (bucket === "month" ? formatMonthLong(x) : bucket === "week" ? `Semaine du ${formatDay(x)}` : formatDayLong(x));
  const bucketLabel = bucket === "day" ? "Par jour" : bucket === "week" ? "Par semaine" : "Par mois";

  /* ---------- Waterfall Brut → TVA → commission → Net ---------- */
  let waterfall: { steps: WaterfallStep[]; hasData: boolean } | null = null;
  if (summary) {
    const c = summary.current;
    const g = c.grossEur;
    const pct = (v: number) => (g > 0 ? Math.max(0, Math.min(100, (v / g) * 100)) : 0);
    waterfall = {
      hasData: g > 0,
      steps: [
        { key: "gross", label: "Brut TTC", amount: formatEur(c.grossEur), kind: "total", start: 0, end: 100 },
        { key: "vat", label: "TVA", amount: `− ${formatEur(c.vatEur)}`, kind: "minus", start: pct(c.exVatEur), end: 100, note: g > 0 ? `${formatPct(c.vatEur / g)} du brut` : undefined },
        { key: "exvat", label: "Hors taxes", amount: formatEur(c.exVatEur), kind: "total", start: 0, end: pct(c.exVatEur) },
        { key: "fee", label: "Commission Apple", amount: `− ${formatEur(c.commissionEur)}`, kind: "minus", start: pct(c.proceedsEur), end: pct(c.exVatEur), note: c.exVatEur > 0 ? `${formatPct(c.commissionEur / c.exVatEur)} du HT` : undefined },
        { key: "net", label: "Net versé", amount: formatEur(c.proceedsEur), kind: "total", start: 0, end: pct(c.proceedsEur), note: g > 0 ? `${formatPct(c.proceedsEur / g)} du brut` : undefined },
      ],
    };
  }

  /* ---------- Products ---------- */
  const products: ProductRow[] | null = breakdown
    ? breakdown.products.map((p) => ({
        key: `${p.appSlug}|${p.sku}`,
        title: p.title,
        sku: p.sku,
        appSlug: p.appSlug,
        appName: appName(p.appSlug),
        kind: TYPE_KIND[p.productTypeId] ?? (p.isSubscription ? "Abonnement" : "App payante"),
        units: formatInt(p.paidUnits),
        refunds: p.refundUnits ? formatInt(p.refundUnits) : "—",
        gross: formatEur(p.grossEur),
        net: formatEur(p.proceedsEur),
      }))
    : null;

  /* ---------- Refunds ---------- */
  const refunds: RefundRow[] | null = refundLines
    ? refundLines.map((r) => ({
        key: `${r.date}|${r.sku}|${r.country}`,
        date: formatDay(r.date),
        title: r.title,
        appSlug: r.appSlug,
        country: r.country,
        units: formatInt(r.units),
        gross: formatEur(r.grossEur),
        net: formatEur(r.proceedsEur),
      }))
    : null;
  const refundTotal = summary && summary.current.refundUnits ? `${formatInt(summary.current.refundUnits)} remboursement${summary.current.refundUnits > 1 ? "s" : ""} · ${formatEur(summary.current.refundGrossEur)} brut, ${formatEur(summary.current.refundProceedsEur)} net repris` : null;

  return {
    subtitle,
    notConnected,
    lagging,
    latestDayLabel: latestDay ? formatDayLong(latestDay) : null,
    lastFetchedAt: freshness?.lastFetchedAt ?? null,
    kpis,
    chart,
    bucketLabel,
    formatX,
    formatXLong,
    waterfall,
    products,
    refunds,
    refundTotal,
  };
}

export type RevenueViewModel = ReturnType<typeof useRevenueViewModel>;
