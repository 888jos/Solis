import { formatDecimal } from "@/lib/format";
import type {
  BreakdownsP,
  KpisP,
  LifecycleP,
  LinesP,
  PaywallsP,
  ProductMixP,
  RcChart,
  RcChartsP,
  RcOverviewP,
  RevenueAmpP,
} from "../../data/payloads";
import { useUrlParam } from "../../data/url";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  breakdownBars,
  color,
  data,
  dayAxis,
  fmtMoney,
  fmtNum,
  kpiVM,
  linesChart,
  pct0,
  waiting,
  waitingFor,
  type BarsVM,
  type ChartVM,
  type Content,
  type KpiVM,
  type TableVM,
} from "../../data/vm";

const TX: [string, string][] = [
  ["Démarrées", "transaction_start"],
  ["Complétées", "transaction_complete"],
  ["Échouées", "transaction_fail"],
  ["Abandonnées", "transaction_abandon"],
  ["Timeout", "transaction_timeout"],
  ["Restaurées", "transaction_restore"],
];
export const PAYWALL_DIMS = [
  "placement",
  "paywall_identifier",
  "paywall_name",
  "variant_id",
  "experiment_id",
];
const RC_CHARTS: {
  chart: string;
  title: string;
  subtitle: string;
  kind: ChartVM["kind"];
  measures?: string[];
  colorStart: number;
}[] = [
  {
    chart: "revenue",
    title: "Revenu",
    subtitle: "RevenueCat, par jour",
    kind: "bar",
    colorStart: 2,
  },
  {
    chart: "mrr",
    title: "MRR",
    subtitle: "RevenueCat, fin de journée",
    kind: "area",
    colorStart: 0,
  },
  {
    chart: "actives",
    title: "Abonnements actifs",
    subtitle: "RevenueCat",
    kind: "area",
    colorStart: 6,
  },
  {
    chart: "trials",
    title: "Essais actifs",
    subtitle: "RevenueCat",
    kind: "area",
    colorStart: 4,
  },
  {
    chart: "trial_conversion_rate",
    title: "Conversion des essais",
    subtitle: "RevenueCat · essais démarrés et convertis",
    kind: "bar-grouped",
    measures: ["Trial Starts", "Conversions"],
    colorStart: 3,
  },
  {
    chart: "churn",
    title: "Churn",
    subtitle: "RevenueCat · taux de churn",
    kind: "line",
    colorStart: 7,
  },
];
const APP_KPIS = [
  {
    key: "paywalls",
    label: "Paywalls ouverts",
    events: ["paywall_open", "onboarding_paywall_viewed"],
    mode: "first",
  },
  {
    key: "trials",
    label: "Essais démarrés",
    events: ["trial_started", "rc_trial_started_event"],
    mode: "sum",
  },
  {
    key: "subs",
    label: "Abonnements démarrés",
    events: [
      "subscription_started",
      "subscription_purchased",
      "rc_initial_purchase_event",
    ],
    mode: "first",
  },
  {
    key: "once",
    label: "Achats uniques",
    events: ["non_recurring_purchase"],
    mode: "first",
  },
  {
    key: "converted",
    label: "Essais convertis",
    events: ["trial_converted", "rc_trial_converted_event"],
    mode: "sum",
  },
  {
    key: "expired",
    label: "Abonnements expirés",
    events: ["subscription_expired", "rc_expiration_event"],
    mode: "sum",
  },
];
const STATUS_PROPS = [
  "subscription_period_type",
  "is_premium",
  "subscription_product",
  "subscription_will_renew",
];

export type RcChartVM = {
  key: string;
  title: string;
  subtitle: string;
  chart: ChartVM | null;
  summary: string | null;
  notConnected: boolean;
};

function rcChartVM(
  def: (typeof RC_CHARTS)[number],
  c: RcChart | undefined,
): RcChartVM {
  const base = { key: def.chart, title: def.title, subtitle: def.subtitle };
  if (!c || !c.configured)
    return { ...base, chart: null, summary: null, notConnected: true };
  const measures = c.measures
    .map((m, i) => ({ ...m, i }))
    .filter((m) =>
      def.measures ? def.measures.includes(m.name) : m.chartable,
    );
  if (!c.x.length || !measures.length)
    return { ...base, chart: null, summary: null, notConnected: false };
  const fmtFor = (unit: string | null) =>
    unit === "$"
      ? (v: number) => fmtMoney(v, c.currency ?? "USD")
      : unit === "%"
        ? (v: number) => `${formatDecimal(v)} %`
        : fmtNum;
  const summary = c.summary?.total ?? c.summary?.average;
  return {
    ...base,
    notConnected: false,
    chart: {
      x: c.x,
      series: measures.map((m, k) => ({
        key: m.name,
        label: m.name,
        color: color(def.colorStart + k),
        values: c.series[m.i],
      })),
      kind: def.kind,
      formatValue: fmtFor(measures[0].unit),
      ...dayAxis,
    },
    summary: summary
      ? `${Object.entries(summary)
          .map(
            ([k, v]) =>
              `${k} : ${fmtFor(c.measures.find((m) => m.name === k)?.unit ?? null)(v)}`,
          )
          .join(" · ")} (${c.summary?.total ? "total" : "moyenne"})`
      : null,
  };
}

/** Monétisation: RevenueCat (source of truth for money) + the app's purchase events in Amplitude. */
export function useMonetizationViewModel() {
  const [dim, setDim] = useUrlParam("dim", "placement");
  const { cell } = useWidgets({
    rc: { w: "rcOverview", periodless: true },
    rcCharts: { w: "rcCharts", p: { charts: RC_CHARTS.map((c) => c.chart) } },
    kpis: {
      w: "kpis",
      p: {
        items: APP_KPIS.map((k) => ({
          key: k.key,
          t: "metric",
          events: k.events,
          m: "totals",
          mode: k.mode,
        })),
      },
    },
    tx: {
      w: "lines",
      p: { m: "totals", items: TX.map(([, e]) => ({ key: e, events: [e] })) },
    },
    mix: { w: "productMix" },
    paywalls: { w: "paywalls", p: { dim } },
    revenue: { w: "revenueAmp" },
    lifecycle: { w: "lifecycle" },
    status: {
      w: "breakdowns",
      p: {
        items: STATUS_PROPS.map((p) => ({
          id: p,
          event: "_active",
          prop: p,
          ptype: "user",
          m: "uniques",
          limit: 10,
        })),
      },
    },
  });

  const rc = mapCell(
    cell<RcOverviewP>("rc"),
    (p): { configured: false } | { configured: true; tiles: KpiVM[] } =>
      p.configured
        ? {
            configured: true,
            tiles: p.metrics.map((m, i) => ({
              key: m.id,
              label: m.name,
              value:
                m.unit === "$"
                  ? fmtMoney(m.value, p.currency)
                  : fmtNum(m.value),
              foot: m.description ?? m.period ?? undefined,
              color: color(i),
            })),
          }
        : { configured: false },
  );

  const rcCharts = mapCell(cell<RcChartsP>("rcCharts"), (p) =>
    RC_CHARTS.map((def, i) => rcChartVM(def, p.charts[i])),
  );

  const kpis = mapCell(cell<KpisP>("kpis"), (p) =>
    APP_KPIS.map((k, i) =>
      kpiVM(
        p.items.find((x) => x.key === k.key),
        k.label,
        i,
        { invert: k.key === "expired" },
      ),
    ),
  );

  const tx = mapCell(cell<LinesP>("tx"), (p) => {
    const content = linesChart(
      p,
      Object.fromEntries(TX.map(([label, e]) => [e, label])),
    );
    if (content.kind === "data") {
      const start =
        p.lines.find((l) => l.key === "transaction_start")?.total ?? 0;
      content.data.tags = p.lines
        .filter((l) => !l.missing)
        .map(
          (l) =>
            `${TX.find(([, e]) => e === l.key)?.[0]} ${fmtNum(l.total)}${start && l.key !== "transaction_start" ? ` · ${pct0(l.total / start)}` : ""}`,
        );
      content.data.waiting = p.lines.filter((l) => l.missing).map((l) => l.key);
    }
    return content;
  });

  const mix = mapCell(cell<ProductMixP>("mix"), (p) =>
    !p.sources.length
      ? waiting(
          waitingFor(
            ["transaction_complete", "revenue_amount"],
            "Pas encore d'achats",
          ),
        )
      : !p.rows.length
        ? waiting({ title: "Aucun achat sur la période" })
        : data<TableVM>({
            columns: [
              { key: "product", header: "Produit" },
              ...p.sources.map((s) => ({
                key: s,
                header: s,
                align: "right" as const,
              })),
            ],
            rows: p.rows.map((r) => ({
              product: r.product,
              ...Object.fromEntries(
                p.sources.map((s) => [s, fmtNum(r.counts[s] ?? 0)]),
              ),
            })),
          }),
  );

  const paywalls = mapCell(cell<PaywallsP>("paywalls"), (p) => {
    if (!p.events.length)
      return waiting(
        waitingFor(
          ["paywall_open"],
          "Pas encore d'événements paywall Superwall",
        ),
      );
    if (!p.rows.some((r) => Object.values(r.counts).some((v) => v > 0)))
      return waiting({
        title: "Aucun paywall sur la période",
        note: p.missing.length
          ? `En attente : ${p.missing.join(", ")}`
          : undefined,
      });
    const opens = p.rows.map((r) => ({
      key: r.value,
      label: r.value,
      value: r.counts.paywall_open ?? 0,
      color: color(0),
    }));
    return data({
      bars: { items: opens, formatValue: fmtNum } satisfies BarsVM,
      table: {
        columns: [
          { key: "v", header: dim },
          ...p.events.map((e) => ({
            key: e,
            header: e.replace("paywall_", ""),
            align: "right" as const,
          })),
          { key: "decline", header: "Taux de refus", align: "right" as const },
        ],
        rows: p.rows.map((r) => ({
          v: r.value,
          ...Object.fromEntries(
            p.events.map((e) => [e, fmtNum(r.counts[e] ?? 0)]),
          ),
          decline: r.counts.paywall_open
            ? pct0((r.counts.paywall_decline ?? 0) / r.counts.paywall_open)
            : "—",
        })),
        note: p.missing.length
          ? `En attente : ${p.missing.join(", ")}`
          : undefined,
      } satisfies TableVM,
    });
  });

  const revenue = mapCell(
    cell<RevenueAmpP>("revenue"),
    (
      p,
    ): Content<{
      tags: string[];
      chart: ChartVM | null;
      note: string | null;
    }> => {
      const l = p.ltv;
      const tags = l
        ? [
            `Payeurs (cohorte) ${fmtNum(l.totalRevenue.paid)} / ${fmtNum(l.totalRevenue.count)}`,
            `Revenu J7 ${fmtMoney(l.totalRevenue.r7d)}`,
            `Revenu J30 ${fmtMoney(l.totalRevenue.r30d)}`,
            `ARPU J30 ${fmtMoney(l.arpu.r30d)}`,
          ]
        : [];
      if (!p.candidates.length)
        return waiting(
          waitingFor(
            ["revenue_amount", "rc_*"],
            "Pas encore d'événement de revenu",
            "Les événements rc_* apparaissent quand l'intégration RevenueCat → Amplitude est active.",
          ),
        );
      if (!p.series.length)
        return data({
          tags,
          chart: null,
          note: `Aucun revenu sur la période · événements surveillés : ${p.candidates.join(", ")}`,
        });
      return data({
        tags,
        chart: {
          x: p.series[0].x,
          series: p.series.map((s, i) => ({
            key: s.event,
            label: s.prop && s.prop !== "$revenue" ? `${s.event} (${s.prop})` : s.event,
            color: color(i),
            values: s.values,
          })),
          kind: "bar",
          formatValue: (v: number) => fmtMoney(v),
          ...dayAxis,
          showTotal: true,
        },
        note: null,
      });
    },
  );

  const lifecycle = mapCell(cell<LifecycleP>("lifecycle"), (p) =>
    p.rows.length
      ? data<TableVM>({
          columns: [
            { key: "e", header: "Événement" },
            { key: "c", header: "Période", align: "right" },
            { key: "p", header: "Préc.", align: "right", muted: true },
          ],
          rows: p.rows.map((r) => ({
            e: r.event,
            c: fmtNum(r.current),
            p: fmtNum(r.previous),
          })),
          note: p.missing.length
            ? `Pas encore reçus : ${p.missing.join(", ")}`
            : undefined,
        })
      : waiting(
          waitingFor(
            ["trial_started", "rc_*"],
            "Pas encore d'événement d'abonnement",
          ),
        ),
  );

  const status = mapCell(cell<BreakdownsP>("status"), (p) =>
    data(
      STATUS_PROPS.map((prop, i) => ({
        prop,
        bars: breakdownBars(
          p.items.find((x) => x.id === prop),
          { colorIndex: i },
        ),
      })),
    ),
  );

  return {
    rc,
    rcCharts,
    kpis,
    tx,
    mix,
    paywalls,
    dim,
    setDim: (v: string) => setDim(v),
    dimOptions: PAYWALL_DIMS.map((d) => ({ value: d, label: d })),
    revenue,
    lifecycle,
    status,
  };
}
