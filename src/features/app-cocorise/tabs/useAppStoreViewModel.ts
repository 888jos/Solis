import { api } from "@convex/_generated/api";
import { useSolisQuery } from "@/lib/convex";
import { usePeriod } from "@/lib/filters";
import { change, formatDay, formatDayLong, formatEur, formatInt, formatMonth, formatMonthLong } from "@/lib/format";
import type { BarListItem, Series } from "@/ui";

export type VersionRow = { key: string; version: string; state: string; date: string; build: string };
export type ReviewItem = { key: string; stars: string; title: string; body: string; meta: string };

const EVENT_LABELS: Record<string, string> = {
  trialStart: "Essais démarrés",
  conversion: "Essais convertis",
  newPaid: "Nouveaux abonnements",
  renewal: "Renouvellements",
  trialCancel: "Essais annulés",
  cancel: "Annulations",
  refund: "Remboursements",
  billingIssue: "Problèmes de paiement",
  other: "Autres",
};

const STATE_LABELS: Record<string, string> = {
  READY_FOR_SALE: "En ligne",
  READY_FOR_DISTRIBUTION: "Publiée",
  PREPARE_FOR_SUBMISSION: "En préparation",
  WAITING_FOR_REVIEW: "En attente de review",
  IN_REVIEW: "En review",
  REJECTED: "Rejetée",
  REPLACED_WITH_NEW_VERSION: "Remplacée",
  PENDING_DEVELOPER_RELEASE: "Validée, à publier",
};

/** "App Store": Cocorise in the Solis tables synced from App Store Connect (sales, subscriptions, ratings, reviews, versions). */
export function useAppStoreViewModel() {
  const period = usePeriod();
  const d = useSolisQuery(api.cocoriseAnalytics.appStore, { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, bucket: period.bucket });
  const bucket = period.bucket;
  const formatX = (x: string) => (bucket === "month" ? formatMonth(x) : formatDay(x));
  const formatXLong = (x: string) => (bucket === "month" ? formatMonthLong(x) : bucket === "week" ? `Semaine du ${formatDay(x)}` : formatDayLong(x));
  const bucketLabel = bucket === "day" ? "Par jour" : bucket === "week" ? "Par semaine" : "Par mois";
  if (!d) return { loading: true as const, bucketLabel, formatX, formatXLong };

  const c = d.current;
  const p = d.previous;
  const kpis = [
    { key: "dl", label: "Téléchargements", value: formatInt(c.downloads), delta: change(c.downloads, p.downloads), foot: `préc. ${formatInt(p.downloads)}` },
    { key: "gross", label: "Brut TTC", value: formatEur(c.grossEur), delta: change(c.grossEur, p.grossEur), foot: `HT ${formatEur(c.exVatEur)}` },
    { key: "net", label: "Net versé par Apple", value: formatEur(c.proceedsEur), delta: change(c.proceedsEur, p.proceedsEur), foot: `préc. ${formatEur(p.proceedsEur)}` },
    { key: "sales", label: "Ventes payantes", value: formatInt(c.paidUnits), delta: change(c.paidUnits, p.paidUnits), foot: `${formatInt(c.newSubscriptions)} nouv. · ${formatInt(c.renewals)} renouv.` },
  ];
  const subsKpis = [
    { key: "paid", label: "Abonnés payants", value: d.active ? formatInt(d.active.paid) : "—", foot: d.active ? `au ${formatDay(d.active.day)}` : "aucun rapport" },
    { key: "trials", label: "Essais en cours", value: d.active ? formatInt(d.active.trials) : "—", foot: "essais gratuits actifs" },
    { key: "billing", label: "En défaut de paiement", value: d.active ? formatInt(d.active.billing) : "—", foot: "billing retry + grâce" },
    { key: "refunds", label: "Remboursements", value: formatInt(c.refundUnits), foot: c.refundUnits ? `${formatEur(c.refundProceedsEur)} net repris` : "aucun" },
  ];
  const downloads: Series[] = [{ key: "dl", label: "Téléchargements", color: "var(--series-2)", values: d.series.downloads }];
  const proceeds: Series[] = [{ key: "net", label: "Net versé", color: "var(--series-2)", values: d.series.proceeds }];
  const events: BarListItem[] = Object.entries(d.eventTotals)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, n]) => ({ key: k, label: EVENT_LABELS[k] ?? k, value: n ?? 0, color: "var(--series-2)" }));

  const ratingValue = d.ratings.average != null ? d.ratings.average.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—";
  const reviews: ReviewItem[] = d.reviews.latest.map((r) => ({
    key: r.id,
    stars: `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}`,
    title: r.title ?? "Sans titre",
    body: r.body,
    meta: [r.nickname, r.territory, formatDay(r.createdAt)].filter(Boolean).join(" · "),
  }));
  const versions: VersionRow[] = d.versions.map((v) => ({
    key: v.id,
    version: v.version,
    state: STATE_LABELS[v.state] ?? v.state,
    date: v.releasedAt ? formatDayLong(v.releasedAt) : v.createdDate ? `créée le ${formatDay(v.createdDate)}` : "—",
    build: v.build ?? "—",
  }));

  return {
    loading: false as const,
    hasSales: d.hasSales,
    latestSaleLabel: d.latestSaleDay ? formatDayLong(d.latestSaleDay) : null,
    kpis,
    subsKpis,
    x: d.series.x,
    downloads,
    proceeds,
    hasDownloads: d.series.downloads.some((v) => v !== 0),
    hasProceeds: d.series.proceeds.some((v) => v !== 0),
    events,
    rating: { value: ratingValue, foot: `${formatInt(d.ratings.count)} notes sur ${formatInt(d.ratings.storefronts)} vitrines` },
    periodReviews: d.reviews.periodCount ? `${formatInt(d.reviews.periodCount)} avis sur la période, moyenne ${d.reviews.periodAverage?.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}` : "Aucun avis écrit sur la période",
    reviews,
    versions,
    bucketLabel,
    formatX,
    formatXLong,
  };
}
