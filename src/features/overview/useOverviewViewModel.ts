import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useLocation } from "react-router-dom";
import { APPS, appColor, appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatAgo, formatDay, formatDayLong, formatDecimal, formatEur, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { Series, Status } from "@/ui";

type Summary = FunctionReturnType<typeof api.overview.summary>;
type Watch = Summary["watch"][number];

export type OverviewKpi = {
  key: string;
  label: string;
  value: string;
  delta?: number | null;
  invertDelta?: boolean;
  foot: string;
  hint: string;
  spark: (number | null)[] | null;
  /** Missing source: the tile links to where it gets fixed. */
  missing?: { label: string; to: { pathname: string; search: string } };
};

export type AppCardStat = { key: string; label: string; value: string; foot?: string };
export type AppCardVm = {
  slug: string;
  name: string;
  color: string;
  net: string;
  netDelta: number | null;
  netFoot: string;
  spark: (number | null)[];
  version: string | null;
  versionFoot: string | null;
  pending: string | null;
  stats: AppCardStat[];
  to: { pathname: string; search: string };
};

export type WatchRow = { key: string; status: Status; badge: string; title: string; detail: string | null; appSlug: string | null; to: { pathname: string; search: string } };

const VERSION_STATES: Record<string, string> = {
  WAITING_FOR_REVIEW: "en attente de review",
  IN_REVIEW: "en review",
  PENDING_DEVELOPER_RELEASE: "validée, à publier",
  PENDING_APPLE_RELEASE: "validée",
  READY_FOR_REVIEW: "prête pour review",
  ACCEPTED: "acceptée",
  PROCESSING_FOR_APP_STORE: "en traitement",
  REJECTED: "rejetée",
  METADATA_REJECTED: "métadonnées rejetées",
  INVALID_BINARY: "binaire invalide",
};

const BADGE: Record<Watch["severity"], { status: Status; label: string }> = {
  critical: { status: "critical", label: "Urgent" },
  warning: { status: "warning", label: "À voir" },
  neutral: { status: "neutral", label: "Info" },
};

const OTTO_COLOR = appColor("otto");

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n > 1 ? many : one}`;
const shortDay = (iso: string) => formatDay(iso.slice(0, 10));

function watchText(w: Watch): { title: string; detail: string | null } {
  const name = w.appSlug ? appName(w.appSlug) : "";
  switch (w.kind) {
    case "syncError":
      return { title: `Synchro en erreur · ${w.name}`, detail: w.message || null };
    case "syncLate":
      return { title: `Synchro en retard · ${w.name}`, detail: `Dernière réussite ${formatAgo(w.lastOkAt)}` };
    case "salesLag":
      return { title: "Rapports de ventes Apple en retard", detail: `Dernier jour reçu : ${formatDayLong(w.day)}` };
    case "versionRejected":
      return { title: `${name} ${w.version} rejetée par Apple`, detail: VERSION_STATES[w.state] ?? w.state };
    case "versionReady":
      return { title: `${name} ${w.version} validée par Apple`, detail: "Prête à publier" };
    case "versionWaiting":
      return {
        title: `${name} ${w.version} ${w.inReview ? "en review" : "en attente de review"}`,
        detail: w.submittedAt ? `Soumise le ${shortDay(w.submittedAt)}${w.days != null ? `, il y a ${w.days < 1 ? "moins d'un jour" : plural(Math.floor(w.days), "jour", "jours")}` : ""}` : null,
      };
    case "lowReview":
      return { title: `Avis ${w.rating}★ sur ${name}`, detail: [w.title ? `« ${w.title} »` : null, shortDay(w.createdAt), w.hasResponse ? "répondu" : "sans réponse"].filter(Boolean).join(" · ") };
    case "moreLowReviews":
      return { title: `${plural(w.count, "autre avis", "autres avis")} à 1-2★ sur la période`, detail: null };
    case "conversionDrop": {
      const rate = (c: { converted: number; matured: number }) => formatPct(c.converted / c.matured, 0);
      return { title: `Conversion essai → payant en baisse : ${rate(w.current)}`, detail: `${w.current.converted} sur ${w.current.matured} essais terminés, contre ${rate(w.previous)} (${w.previous.converted}/${w.previous.matured}) avant` };
    }
    case "netDrop":
      return { title: `Net en baisse de ${formatPct(Math.abs(change(w.net, w.prevNet) ?? 0), 0)}`, detail: `${formatEur(w.net)} contre ${formatEur(w.prevNet)} sur la période précédente` };
    case "spendSpike":
      return { title: `Dépenses en hausse de ${formatPct(change(w.spend, w.prevSpend) ?? 0, 0)}`, detail: `${formatEur(w.spend)} contre ${formatEur(w.prevSpend)}${w.vendor && w.vendorDelta ? ` · surtout ${w.vendor} (+${formatEur(w.vendorDelta)})` : ""}` };
    case "ratingDrop":
      return { title: `Note de ${name} en baisse : ${formatDecimal(w.current)}★`, detail: `${formatDecimal(w.start)}★ le ${formatDay(w.startDay)}` };
    case "billing":
      return { title: `${plural(w.count, "abonné", "abonnés")} en échec de paiement`, detail: "Apple retente le prélèvement (billing retry ou délai de grâce)" };
    case "refunds":
      return { title: `${plural(w.units, "remboursement", "remboursements")} sur la période`, detail: `${formatEur(w.grossEur)} brut rendus aux clients` };
    case "unplugged":
      return { title: `${plural(w.names.length, "source pas encore branchée", "sources pas encore branchées")}`, detail: w.names.join(", ") };
  }
}

/** Overview ViewModel: one query (convex/overview.ts) shaped for the morning glance. */
export function useOverviewViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const { search } = useLocation();
  const data = useSolisQuery(api.overview.summary, { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, bucket: period.bucket, app });
  const to = (pathname: string) => ({ pathname, search });
  const withApp = (pathname: string, slug: string) => {
    const params = new URLSearchParams(search);
    params.set("app", slug);
    return { pathname, search: `?${params.toString()}` };
  };

  const subtitle = `${period.label} · ${app ? appName(app) : "Toutes les apps"}`;
  const bucket = period.bucket;
  const formatX = (x: string) => (bucket === "month" ? formatMonth(x) : formatDay(x));
  const formatXLong = (x: string) => (bucket === "month" ? formatMonthLong(x) : bucket === "week" ? `Semaine du ${formatDay(x)}` : formatDayLong(x));
  const bucketLabel = bucket === "day" ? "Par jour" : bucket === "week" ? "Par semaine" : "Par mois";
  const sparkColor = app ? appColor(app) : "var(--chart-muted)";

  if (!data) return { loading: true as const, subtitle };

  /* ---------- KPIs ---------- */
  const prevFoot = (value: string | null) => (value == null ? "pas de période préc." : `préc. ${value}`);
  const cmpNote = data.comparedDays.missing > 0 ? ` · Comparé à la période précédente arrêtée au ${formatDay(data.comparedDays.prevTo)}, pour le même nombre de jours publiés par Apple` : "";
  const subsAt = data.subscriptions.day ? `au ${formatDay(data.subscriptions.day)}` : "";
  const e = data.expenses;
  const expensesMissing = { label: "Aucune dépense importée", to: to("/depenses") };
  // Otto (Stripe) joins the studio net on the all-projects view.
  const otto = data.otto;
  const netTotal = data.net.total + (otto?.revenue ?? 0);
  const netPrev = data.net.prev == null ? null : data.net.prev + (otto?.prev.revenue ?? 0);
  const netSpark = otto ? data.net.series.map((v, i) => (v == null ? null : v + (otto.series[i] ?? 0))) : data.net.series;
  const kpis: OverviewKpi[] = [
    {
      key: "net",
      label: "Net versé",
      value: formatEur(netTotal),
      delta: netPrev == null ? null : change(netTotal, netPrev),
      foot: prevFoot(netPrev == null ? null : formatEur(netPrev)),
      hint: `Ce qu'Apple verse : après TVA et commission, remboursements déduits${otto ? " · plus Otto : encaissé Stripe, frais Stripe non déduits" : ""}${cmpNote}`,
      spark: netSpark,
    },
    e
      ? {
          key: "spend",
          label: "Dépenses",
          value: formatEur(e.total),
          delta: e.prev == null ? null : change(e.total, e.prev),
          invertDelta: true,
          foot: e.partial ? `depuis le ${formatDay(e.coveredFrom)}` : prevFoot(e.prev == null ? null : formatEur(e.prev)),
          hint: app ? `Dépenses attribuées à ${appName(app)} (UGC inclus)` : "Relevés bancaires, saisies manuelles et paiements UGC",
          spark: e.series,
        }
      : { key: "spend", label: "Dépenses", value: "—", foot: "", hint: "Aucun relevé bancaire importé ni dépense saisie", spark: null, missing: expensesMissing },
    e
      ? {
          key: "margin",
          label: "Marge",
          value: formatEur(e.margin + (otto?.revenue ?? 0)),
          delta: e.prevMargin == null ? null : change(e.margin + (otto?.revenue ?? 0), e.prevMargin + (otto?.prev.revenue ?? 0)),
          foot: e.partial ? `dépenses depuis le ${formatDay(e.coveredFrom)}` : prevFoot(e.prevMargin == null ? null : formatEur(e.prevMargin + (otto?.prev.revenue ?? 0))),
          hint: "Net versé moins dépenses (le coût IA d'Otto arrive par la banque ou la clé admin OpenAI, pas compté deux fois)",
          spark: otto ? e.marginSeries.map((v, i) => (v == null ? null : v + (otto.series[i] ?? 0))) : e.marginSeries,
        }
      : { key: "margin", label: "Marge", value: "—", foot: "", hint: "Net versé moins dépenses : il manque les dépenses", spark: null, missing: { label: "Il manque les dépenses", to: to("/depenses") } },
    {
      key: "paid",
      label: "Abonnés actifs",
      value: formatInt(data.subscriptions.paid),
      delta: data.subscriptions.prevPaid == null || data.subscriptions.paid == null ? null : change(data.subscriptions.paid, data.subscriptions.prevPaid),
      foot: data.subscriptions.prevPaid == null ? subsAt : `${subsAt} · préc. ${formatInt(data.subscriptions.prevPaid)}`,
      hint: "Abonnements payants actifs en fin de période (rapport Apple), hors échecs de paiement",
      spark: data.subscriptions.paidSeries,
    },
    {
      key: "trials",
      label: "Essais en cours",
      value: formatInt(data.subscriptions.trials),
      delta: data.subscriptions.prevTrials == null || data.subscriptions.trials == null ? null : change(data.subscriptions.trials, data.subscriptions.prevTrials),
      foot: data.subscriptions.prevTrials == null ? subsAt : `${subsAt} · préc. ${formatInt(data.subscriptions.prevTrials)}`,
      hint: "Essais gratuits actifs en fin de période (rapport Apple)",
      spark: data.subscriptions.trialSeries,
    },
    {
      key: "downloads",
      label: "Téléchargements",
      value: formatInt(data.downloads.total),
      delta: data.downloads.prev == null ? null : change(data.downloads.total, data.downloads.prev),
      foot: prevFoot(data.downloads.prev == null ? null : formatInt(data.downloads.prev)),
      hint: `Premiers téléchargements (rapports Sales Apple), hors mises à jour et re-téléchargements${cmpNote}`,
      spark: data.downloads.series,
    },
  ];

  /* ---------- Net by app chart ---------- */
  const chartSeries: Series[] = APPS.map((a) => data.perApp.find((p) => p.slug === a.slug))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ key: p.slug, label: appName(p.slug), color: appColor(p.slug), values: p.netSeries }));
  if (otto) chartSeries.push({ key: "otto", label: "Otto", color: OTTO_COLOR, values: otto.series });
  const chart = {
    x: data.x,
    series: chartSeries,
    total: formatEur(netTotal),
    hasData: chartSeries.some((s) => s.values.some((val) => val !== 0)),
  };

  /* ---------- App cards ---------- */
  const apps: AppCardVm[] = data.perApp.map((p) => ({
    slug: p.slug,
    name: appName(p.slug),
    color: appColor(p.slug),
    net: formatEur(p.net),
    netDelta: data.net.prev == null ? null : change(p.net, p.prevNet),
    netFoot: data.net.prev == null ? "net versé" : `net versé · préc. ${formatEur(p.prevNet)}`,
    spark: p.netSeries,
    version: p.liveVersion ? `v${p.liveVersion.version}` : null,
    versionFoot: p.liveVersion?.releasedAt ? `en ligne depuis le ${formatDay(p.liveVersion.releasedAt)}` : null,
    pending: p.pendingVersion ? `${p.pendingVersion.version} ${VERSION_STATES[p.pendingVersion.state] ?? p.pendingVersion.state}` : null,
    stats: [
      { key: "paid", label: "Abonnés", value: formatInt(p.paid), foot: p.prevPaid != null && p.paid != null && p.paid !== p.prevPaid ? `${p.paid > p.prevPaid ? "+" : "−"}${formatInt(Math.abs(p.paid - p.prevPaid))}` : undefined },
      { key: "trials", label: "Essais", value: formatInt(p.trials) },
      { key: "downloads", label: "Téléch.", value: formatInt(p.downloads) },
      { key: "rating", label: "Note", value: p.rating == null ? "—" : `${formatDecimal(p.rating)}★`, foot: p.ratingCount ? plural(p.ratingCount, "note", "notes") : undefined },
    ],
    to: withApp("/revenus", p.slug),
  }));

  if (otto) {
    const conv = otto.reports ? otto.paid / otto.reports : null;
    apps.push({
      slug: "otto",
      name: "Otto",
      color: OTTO_COLOR,
      net: formatEur(otto.revenue),
      netDelta: change(otto.revenue, otto.prev.revenue),
      netFoot: `encaissé Stripe · préc. ${formatEur(otto.prev.revenue)}`,
      spark: otto.series,
      version: null,
      versionFoot: `Marge après IA : ${formatEur(otto.margin)}`,
      pending: null,
      stats: [
        { key: "reports", label: "Rapports", value: formatInt(otto.reports) },
        { key: "paid", label: "Paiements", value: formatInt(otto.paid) },
        { key: "conv", label: "Conversion", value: conv == null ? "—" : formatPct(conv) },
        { key: "ai", label: "Coût IA", value: formatEur(otto.aiCost) },
      ],
      to: { pathname: "/projets/otto", search: "" },
    });
  }

  /* ---------- Watch list ---------- */
  const watch: WatchRow[] = data.watch.map((w) => ({ key: w.key, status: BADGE[w.severity].status, badge: BADGE[w.severity].label, ...watchText(w), appSlug: w.appSlug, to: to(w.href) }));
  const watchCount = data.watch.filter((w) => w.severity !== "neutral").length;

  /* ---------- Freshness ---------- */
  const f = data.freshness;
  const freshness = [
    f.salesLatestDay ? `Ventes Apple au ${formatDay(f.salesLatestDay)}` : "Aucune vente Apple synchronisée",
    f.subsDay ? `abonnements au ${formatDay(f.subsDay)}` : null,
    f.ratingsDay ? `notes au ${formatDay(f.ratingsDay)}` : null,
    `dernière synchro ${formatAgo(f.lastSyncAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const syncIssue = f.syncErrors ? plural(f.syncErrors, "source en erreur", "sources en erreur") : f.syncLate ? plural(f.syncLate, "source en retard", "sources en retard") : null;

  return {
    loading: false as const,
    subtitle,
    hasSales: data.hasSales,
    kpis,
    sparkColor,
    chart,
    bucketLabel,
    formatX,
    formatXLong,
    apps,
    singleApp: data.perApp.length === 1,
    watch,
    watchSubtitle: watchCount ? `${plural(watchCount, "point", "points")} à regarder` : "Rien d'anormal sur la période",
    freshness,
    syncIssue,
    syncTo: to("/sources"),
  };
}

export type OverviewViewModel = ReturnType<typeof useOverviewViewModel>;
