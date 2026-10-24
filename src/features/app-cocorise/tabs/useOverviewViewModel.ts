import { api } from "@convex/_generated/api";
import { useSolisQuery } from "@/lib/convex";
import { usePeriod } from "@/lib/filters";
import { addDays } from "@convex/lib/dates";
import { change, formatDay, formatDayLong, formatEur, formatInt, formatPct } from "@/lib/format";
import type { Series } from "@/ui";
import { buildFunnel, ratio } from "../data/funnel";
import { gateOf } from "../data/gate";
import type { FirestoreData } from "../data/useFirestoreReport";
import { stepLabel, SUMMARY_STEPS } from "../labels";

export type OverviewKpi = { key: string; label: string; value: string; foot: string; hint: string; delta?: number | null };

/** "Vue d'ensemble": the old dashboard's Overview KPIs, summary funnel and daily trend, plus App Store headline. */
export function useOverviewViewModel(fs: FirestoreData) {
  const period = usePeriod();
  const r = fs.report;
  const gate = gateOf(fs);

  let kpis: OverviewKpi[] | null = null;
  let funnel = null;
  let trend: { x: string[]; series: Series[]; hasData: boolean } | null = null;
  if (r) {
    const t = r.totals;
    const pct = (v: number | null) => (v == null ? "—" : formatPct(v));
    kpis = [
      { key: "installs", label: "Installations", value: formatInt(t.installs), foot: "premier lancement", hint: "Utilisateurs avec l'événement app_first_opened" },
      { key: "started", label: "Onboarding démarré", value: formatInt(t.started), foot: `${pct(ratio(t.installsStartedOnboarding, t.installs))} des installs`, hint: "onboarding_started ; % = installs qui ont démarré l'onboarding" },
      { key: "completed", label: "Onboarding terminé", value: formatInt(t.completed), foot: `${pct(ratio(t.completed, t.started))} des démarrés`, hint: "onboarding_completed" },
      { key: "auth", label: "Connexion atteinte", value: formatInt(t.authReached), foot: `${pct(ratio(t.authReached, t.started))} des démarrés`, hint: "Étape auth de l'onboarding" },
      { key: "pwViewed", label: "Paywall vu", value: formatInt(t.paywallViewed), foot: `${pct(ratio(t.paywallViewed, t.started))} des démarrés`, hint: "Événement paywall_viewed" },
      { key: "pwReached", label: "Étape paywall", value: formatInt(t.paywallReached), foot: `${pct(ratio(t.paywallReached, t.started))} des démarrés`, hint: "Étape paywall trackée dans l'onboarding" },
      { key: "purchased", label: "Achats trackés", value: formatInt(t.purchased), foot: `${pct(ratio(t.purchased, t.paywallViewed))} des paywalls vus`, hint: "Événement subscription_purchased" },
      { key: "revenue", label: "Revenu tracké", value: formatEur(t.trackedRevenue), foot: "somme des prix d'achat", hint: "Somme de subscription_purchased.price (côté app, pas Apple)" },
      { key: "rpi", label: "Revenu par install", value: t.installs > 0 ? formatEur(t.trackedRevenue / t.installs, { decimals: true }) : "—", foot: "revenu tracké / installs", hint: "Revenu tracké divisé par les installations" },
      { key: "events", label: "Événements", value: formatInt(t.totalEvents), foot: `${formatInt(t.onboardingUsers)} utilisateurs en onboarding`, hint: `Documents analytics_events lus (${formatInt(t.totalUsers)} utilisateurs distincts)` },
    ];
    const byStep = new Map(r.steps.map((s) => [s.id, s.users]));
    funnel = buildFunnel(SUMMARY_STEPS.map((id) => ({ key: id, label: stepLabel(id), users: id === "completed" ? t.completed : (byStep.get(id) ?? 0) })));

    // Daily started / completed, every day of the covered range (0 on days without events).
    const daily = new Map(r.daily.map((d) => [d.date, d]));
    const x: string[] = [];
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) x.push(d);
    trend = {
      x,
      series: [
        { key: "started", label: "Démarrés", color: "var(--series-1)", values: x.map((d) => daily.get(d)?.started ?? 0) },
        { key: "completed", label: "Terminés", color: "var(--series-4)", values: x.map((d) => daily.get(d)?.completed ?? 0) },
      ],
      hasData: r.daily.length > 0,
    };
  }

  /* App Store headline (always available, independent of Firestore). */
  const store = useSolisQuery(api.cocoriseAnalytics.appStore, { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, bucket: period.bucket });
  const storeKpis: OverviewKpi[] | null = store
    ? [
        { key: "dl", label: "Téléchargements", value: formatInt(store.current.downloads), delta: change(store.current.downloads, store.previous.downloads), foot: `préc. ${formatInt(store.previous.downloads)}`, hint: "Premiers téléchargements, rapports Sales Apple" },
        { key: "net", label: "Net versé par Apple", value: formatEur(store.current.proceedsEur), delta: change(store.current.proceedsEur, store.previous.proceedsEur), foot: `préc. ${formatEur(store.previous.proceedsEur)}`, hint: "Developer proceeds, remboursements déduits" },
        { key: "paid", label: "Abonnés payants", value: store.active ? formatInt(store.active.paid) : "—", foot: store.active ? `au ${formatDay(store.active.day)}` : "pas de rapport", hint: "Rapport SUBSCRIPTION Apple, fin de journée" },
        { key: "rating", label: "Note App Store", value: store.ratings.average != null ? store.ratings.average.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—", foot: `${formatInt(store.ratings.count)} notes`, hint: "Moyenne pondérée des vitrines suivies" },
      ]
    : null;

  // Tracking silence: the app keeps being downloaded after the last Firestore event.
  const silenceFrom = fs.lastDay ? addDays(fs.lastDay, 1) : null;
  const since = useSolisQuery(api.cocoriseAnalytics.downloadsBetween, silenceFrom && silenceFrom <= period.to ? { from: silenceFrom, to: period.to } : "skip");
  const silence =
    fs.lastDay && since && since.downloads > 0
      ? `Aucun événement Firestore depuis le ${formatDayLong(fs.lastDay)}, alors que l'App Store a compté ${formatInt(since.downloads)} téléchargements ensuite : le tracking de l'app semble coupé (versions publiées depuis).`
      : null;

  return {
    gate,
    kpis,
    funnel,
    trend,
    storeKpis,
    silence,
    rangeLabel: r ? `${formatDay(r.from)} → ${formatDay(r.to)}` : null,
    formatX: formatDay,
    formatXLong: formatDayLong,
  };
}
