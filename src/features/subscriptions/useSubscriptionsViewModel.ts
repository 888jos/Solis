import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import { APPS, appColor, appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatEur, formatInt, formatMonth, formatPct } from "@/lib/format";
import type { Series } from "@/ui";

type Overview = NonNullable<ReturnType<typeof useSolisQuery<typeof api.subscriptions.overview>>>;
type EventKind = keyof Overview["events"]["prev"];

export type ActiveMetric = "paid" | "trials";

// Table rows. The chart merges refunds into "Résiliations payantes" (one red series for paid losses).
const EVENT_META: { kind: EventKind; label: string; color: string; sign: 1 | -1 }[] = [
  { kind: "trialStart", label: "Essais démarrés", color: "var(--series-4)", sign: 1 },
  { kind: "conversion", label: "Essais convertis", color: "var(--series-6)", sign: 1 },
  { kind: "newPaid", label: "Abonnements directs", color: "var(--series-7)", sign: 1 },
  { kind: "renewal", label: "Renouvellements", color: "var(--series-5)", sign: 1 },
  { kind: "trialCancel", label: "Essais résiliés", color: "var(--series-other)", sign: -1 },
  { kind: "cancel", label: "Résiliations payantes", color: "var(--series-8)", sign: -1 },
  { kind: "refund", label: "Remboursements", color: "var(--series-8)", sign: -1 },
];

const PLAN_SHORT: Record<string, string> = { weekly: "hebdo", monthly: "mensuel", quarterly: "trim.", semiannual: "sem.", yearly: "annuel", other: "autre" };

const PLAN_LABELS: Record<string, string> = {
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  semiannual: "Semestriel",
  yearly: "Annuel",
  other: "Autre",
};

export const CONVERSION_HINT =
  "Essais gratuits démarrés sur la période et déjà terminés, passés payants (même après la période) ÷ ces mêmes essais. Les essais encore en cours sont exclus.";

const rate = (c: { matured: number; converted: number }) => (c.matured > 0 ? c.converted / c.matured : null);

export function useSubscriptionsViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const [metric, setMetric] = useState<ActiveMetric>("paid");
  const data = useSolisQuery(api.subscriptions.overview, {
    from: period.from,
    to: period.to,
    prevFrom: period.prevFrom,
    prevTo: period.prevTo,
    bucket: period.bucket,
    app,
  });

  const view = useMemo(() => {
    if (!data) return null;
    const sum = (pick: (a: Overview["perApp"][number]) => number) => data.perApp.reduce((s, a) => s + pick(a), 0);
    const paid = sum((a) => a.paid);
    const trials = sum((a) => a.trials);
    const billing = sum((a) => a.billing);
    const hasPrev = data.perApp.some((a) => a.prev);
    const prevPaid = hasPrev ? sum((a) => a.prev?.paid ?? 0) : null;
    const prevTrials = hasPrev ? sum((a) => a.prev?.trials ?? 0) : null;
    const conv = rate(data.conversion.total);
    const prevConv = rate(data.conversion.prev);
    const pending = data.conversion.total.started - data.conversion.total.matured;
    const rc = data.revenuecat;
    const rcScope = !app || app === "cortifree";
    const asOf = data.latestDay ? `au ${formatDay(data.latestDay)}` : "aucun rapport";

    const sumSeries = (pick: (s: Overview["activeSeries"][number]) => (number | null)[]) =>
      data.x.map((_, i) => (data.activeSeries.some((s) => pick(s)[i] != null) ? data.activeSeries.reduce((t, s) => t + (pick(s)[i] ?? 0), 0) : null));

    const kpis = [
      {
        key: "paid",
        label: "Abonnés actifs",
        value: data.latestDay ? formatInt(paid) : "—",
        delta: prevPaid != null ? change(paid, prevPaid) : null,
        foot: asOf,
        spark: sumSeries((s) => s.paid),
        hint: `Abonnements payants actifs en fin de journée (prix standard + offres payantes), rapport Apple SUBSCRIPTION. Hors échec de paiement${billing ? ` (${formatInt(billing)} en ce moment)` : ""}.`,
      },
      {
        key: "trials",
        label: "Essais en cours",
        value: data.latestDay ? formatInt(trials) : "—",
        delta: prevTrials != null ? change(trials, prevTrials) : null,
        foot: asOf,
        spark: sumSeries((s) => s.trials),
        hint: "Essais gratuits actifs en fin de journée, rapport Apple SUBSCRIPTION.",
      },
      {
        key: "conversion",
        label: "Conversion essai → payant",
        value: formatPct(conv, 0),
        delta: undefined,
        spark: null,
        foot:
          data.conversion.total.matured > 0
            ? `${formatInt(data.conversion.total.converted)} / ${formatInt(data.conversion.total.matured)} essais terminés${prevConv != null ? ` · ${formatPct(prevConv, 0)} avant` : ""}`
            : pending > 0
              ? `${formatInt(pending)} essai${pending > 1 ? "s" : ""} encore en cours`
              : "aucun essai démarré",
        hint: CONVERSION_HINT,
      },
      {
        key: "mrr",
        label: "MRR · RevenueCat",
        value: rcScope && rc ? formatEur(rc.mrrEur) : "—",
        // Change measured in USD (RevenueCat's currency) so exchange-rate moves do not show up as growth.
        delta: rcScope && rc && rc.prevMrrUsd != null ? change(rc.mrrUsd, rc.prevMrrUsd) : null,
        spark: rcScope && rc ? rc.seriesUsd : null,
        foot: !rcScope ? "CortiFree uniquement" : rc ? `CortiFree · ${rc.mrrUsd.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $` : "aucun relevé RevenueCat",
        hint: rc
          ? `MRR RevenueCat (abonnements normalisés au mois), CortiFree seulement. Converti du dollar au taux du ${rc.fxDate ? formatDay(rc.fxDate) : "jour"} ; évolution calculée en dollars (hors effet de change).`
          : "MRR RevenueCat, CortiFree seulement.",
      },
    ];

    /* Active series */
    const singleApp = data.perApp.length === 1;
    const activeSeries: Series[] = singleApp
      ? [
          { key: "paid", label: "Abonnés payants", color: appColor(data.perApp[0].appSlug), values: data.activeSeries[0].paid },
          { key: "trials", label: "Essais en cours", color: "var(--series-4)", values: data.activeSeries[0].trials },
        ]
      : data.activeSeries.map((s) => ({ key: s.appSlug, label: appName(s.appSlug), color: appColor(s.appSlug), values: metric === "paid" ? s.paid : s.trials }));
    const activePoints = data.activeSeries[0]?.paid.filter((v) => v != null).length ?? 0;

    /* Events */
    const totalOf = (kind: EventKind) => data.perApp.reduce((s, a) => s + (data.events.perApp[a.appSlug]?.[kind] ?? 0), 0);
    const eventRows = EVENT_META.map((m) => ({
      key: m.kind,
      label: m.label,
      color: m.color,
      perApp: Object.fromEntries(data.perApp.map((a) => [a.appSlug, data.events.perApp[a.appSlug]?.[m.kind] ?? 0])) as Record<string, number>,
      total: totalOf(m.kind),
      prev: data.events.prev[m.kind],
      delta: change(totalOf(m.kind), data.events.prev[m.kind]),
    }));
    const billingEvents = totalOf("billingIssue");
    const chartKinds = EVENT_META.filter((m) => m.kind !== "refund");
    const eventSeries: Series[] = chartKinds
      .filter((m) => totalOf(m.kind) + (m.kind === "cancel" ? totalOf("refund") : 0) > 0)
      .map((m) => ({
        key: m.kind,
        label: m.kind === "cancel" ? "Résiliations et remboursements" : m.label,
        color: m.color,
        values: data.events.series[m.kind].map((v, i) => {
          const n = v + (m.kind === "cancel" ? data.events.series.refund[i] : 0);
          return n ? n * m.sign : 0;
        }),
      }));
    const anyEvents = eventRows.some((r) => r.total > 0) || billingEvents > 0;

    /* Per-app table */
    const appRows = data.perApp.map((a) => {
      const ev = data.events.perApp[a.appSlug];
      const c = data.conversion.perApp[a.appSlug];
      return {
        appSlug: a.appSlug,
        paid: a.paid,
        trials: a.trials,
        billing: a.billing,
        trialStarts: ev?.trialStart ?? 0,
        conversion: formatPct(rate(c), 0),
        conversionDetail: c.matured ? `${c.converted}/${c.matured}` : null,
        cancels: ev?.cancel ?? 0,
        refunds: ev?.refund ?? 0,
        mrr: a.appSlug === "cortifree" && rc ? formatEur(rc.mrrEur) : "—",
        rcActives: a.appSlug === "cortifree" && rc ? rc.activeSubscriptions : null,
      };
    });

    /* Plan mix (paid subscribers, latest day) */
    const planTotals = new Map<string, number>();
    for (const a of data.perApp) for (const [plan, n] of Object.entries(a.plans)) planTotals.set(plan, (planTotals.get(plan) ?? 0) + n);
    const planItems = Object.keys(PLAN_LABELS)
      .map((plan) => ({ key: plan, label: PLAN_LABELS[plan], value: planTotals.get(plan) ?? 0 }))
      .filter((p) => p.value > 0);
    const planByApp = data.perApp
      .filter((a) => a.paid > 0)
      .map((a) => ({
        appSlug: a.appSlug,
        parts: Object.keys(PLAN_LABELS)
          .filter((p) => a.plans[p as keyof typeof a.plans] > 0)
          .map((p) => ({ key: p, label: PLAN_SHORT[p], value: a.plans[p as keyof typeof a.plans], share: a.plans[p as keyof typeof a.plans] / a.paid })),
      }));

    const formatX = period.bucket === "month" ? formatMonth : formatDay;
    const formatXLong = period.bucket === "week" ? (x: string) => `Semaine du ${formatDay(x)}` : period.bucket === "month" ? formatMonth : formatDay;

    return {
      anyAppleData: data.anyAppleData,
      singleApp,
      kpis,
      active: { x: data.x, series: activeSeries, points: activePoints },
      events: { x: data.x, series: eventSeries, rows: eventRows, billingEvents, any: anyEvents, others: data.events.otherLabels },
      appRows,
      showRcColumn: data.perApp.some((a) => a.appSlug === "cortifree"),
      plans: { items: planItems, total: paid, byApp: planByApp },
      formatX,
      formatXLong,
      latestDay: data.latestDay,
      lastEventDay: data.lastEventDay,
      appleSyncedAt: data.appleSyncedAt,
      rcFetchedAt: rc?.fetchedAt ?? null,
      rcScope,
      perAppNames: data.perApp.map((a) => a.appSlug),
      // No previous-period columns when that window holds no event at all (e.g. before the first launch).
      showPrev: period.key !== "all" && Object.values(data.events.prev).some((n) => n > 0),
    };
  }, [data, metric, app, period.bucket, period.key]);

  return {
    loading: data === undefined,
    view,
    periodLabel: period.label.toLowerCase(),
    metric,
    setMetric,
    apps: APPS,
  };
}

export type SubscriptionsViewModel = ReturnType<typeof useSubscriptionsViewModel>;
