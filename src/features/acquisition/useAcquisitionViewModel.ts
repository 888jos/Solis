import { api } from "@convex/_generated/api";
import { APPS, appColor, appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatCompact, formatDay, formatDayLong, formatDecimal, formatEur, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { BarListItem, Series } from "@/ui";

export type AcquisitionKpi = { key: string; label: string; value: string; delta?: number | null; invertDelta?: boolean; foot: string; hint: string };
export type FunnelRow = {
  key: string;
  appSlug: string | null;
  label: string;
  downloads: string;
  redownloads: string;
  newUsers: string;
  newUsersHint: string;
  trialStarts: string;
  newPaid: string;
  ratio: string;
  isTotal: boolean;
};

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["fr"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const SOURCE_LABEL: Record<string, string> = { amplitude: "Amplitude", posthog: "PostHog" };
const plural = (n: number, one: string, many: string) => (Math.abs(n) > 1 ? many : one);

/** Acquisition page ViewModel: Apple downloads, UGC views, spend and the download → paid ratio, ready to render. */
export function useAcquisitionViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const data = useSolisQuery(api.acquisition.overview, { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, bucket: period.bucket, app });

  const loading = data === undefined;
  const notConnected = data !== undefined && data.latestDay == null;
  const latestDay = data?.latestDay ?? null;
  const subtitle = [period.label, app ? appName(app) : "Toutes les apps", latestDay ? `données Apple jusqu'au ${formatDay(latestDay)}` : null].filter(Boolean).join(" · ");

  const bucket = period.bucket;
  const formatX = (x: string) => (bucket === "month" ? formatMonth(x) : formatDay(x));
  const formatXLong = (x: string) => (bucket === "month" ? formatMonthLong(x) : bucket === "week" ? `Semaine du ${formatDay(x)}` : formatDayLong(x));
  const bucketLabel = bucket === "day" ? "Par jour" : bucket === "week" ? "Par semaine" : "Par mois";

  /* ---------- KPIs ---------- */
  let kpis: AcquisitionKpi[] | null = null;
  if (data) {
    const c = data.current;
    const p = data.previous;
    const perDay = c.dataDays > 0 ? c.downloads / c.dataDays : null;
    const prevPerDay = p.dataDays > 0 ? p.downloads / p.dataDays : null;
    const spend = c.ugcEur + c.adsEur;
    const prevSpend = p.ugcEur + p.adsEur;
    const cpd = spend > 0 && c.downloads > 0 ? spend / c.downloads : null;
    const prevCpd = prevSpend > 0 && p.downloads > 0 ? prevSpend / p.downloads : null;
    kpis = [
      {
        key: "downloads",
        label: "Téléchargements",
        value: formatInt(c.downloads),
        delta: change(c.downloads, p.downloads),
        foot: `préc. ${formatInt(p.downloads)}`,
        hint: "Premiers téléchargements Apple (types 1, 1F, 1T, F1), hors re-téléchargements et mises à jour",
      },
      {
        key: "redownloads",
        label: "Re-téléchargements",
        value: formatInt(c.redownloads),
        delta: change(c.redownloads, p.redownloads),
        foot: `préc. ${formatInt(p.redownloads)}`,
        hint: `Réinstallations par un compte qui avait déjà l'app (types 3, 3F). À part : ${formatInt(c.updates)} ${plural(c.updates, "mise à jour", "mises à jour")} (7, 7F).`,
      },
      {
        key: "perDay",
        label: "Téléchargements / jour",
        value: perDay == null ? "—" : formatDecimal(perDay),
        delta: perDay == null ? null : change(perDay, prevPerDay),
        foot: `sur ${formatInt(c.dataDays)} j`,
        hint: "Téléchargements ÷ jours couverts par les rapports Apple (le dernier jour arrive avec un jour de retard)",
      },
      {
        key: "cpd",
        label: "Coût par téléchargement",
        value: cpd == null ? "—" : formatEur(cpd, { decimals: true }),
        delta: cpd == null ? undefined : change(cpd, prevCpd),
        invertDelta: true,
        foot: spend > 0 ? `${formatEur(spend)} (UGC + pub) ÷ téléch.` : "aucune dépense UGC/pub",
        hint: "(Dépenses UGC + publicité de la période) ÷ téléchargements de la période. Source : page Dépenses.",
      },
    ];
  }

  /* ---------- Downloads by app over time ---------- */
  let downloadsChart: { x: string[]; series: Series[]; total: string; hasData: boolean } | null = null;
  let downloadsTotalSeries: Series[] = [];
  if (data) {
    const known = new Map(data.series.map((s) => [s.slug, s.values]));
    const series: Series[] = APPS.map((a) => a.slug)
      .filter((slug) => known.has(slug) && (slug === app || known.get(slug)!.some((v) => v !== 0)))
      .map((slug) => ({ key: slug, label: appName(slug), color: appColor(slug), values: known.get(slug)! }));
    downloadsChart = { x: data.x, series, total: formatInt(data.current.downloads), hasData: series.some((s) => s.values.some((v) => v !== 0)) };
    // UGC only runs for CortiFree: compare its views with CortiFree downloads, never the studio total.
    const cortifree = known.get("cortifree");
    downloadsTotalSeries = cortifree ? [{ key: "cortifree", label: "Téléchargements CortiFree", color: appColor("cortifree"), values: cortifree }] : [];
  }

  /* ---------- Countries ---------- */
  let countries: { items: BarListItem[]; footer: string | null; hasData: boolean } | null = null;
  if (data) {
    const total = data.current.downloads;
    countries = {
      hasData: data.countries.length > 0,
      items: data.countries.map((c) => ({
        key: c.country,
        label: countryName(c.country),
        value: c.downloads,
        color: "var(--series-7)",
        hint: total > 0 ? `${countryName(c.country)} : ${formatInt(c.downloads)} (${formatPct(c.downloads / total)})` : undefined,
      })),
      footer:
        data.countryCount > data.countries.length
          ? `+ ${formatInt(data.otherCountryDownloads)} ${plural(data.otherCountryDownloads, "téléchargement", "téléchargements")} dans ${formatInt(data.countryCount - data.countries.length)} ${plural(data.countryCount - data.countries.length, "autre pays", "autres pays")}`
          : null,
    };
  }

  /* ---------- UGC views aligned with downloads ---------- */
  type UgcState =
    | { kind: "loading" }
    | { kind: "otherApp" }
    | { kind: "notConnected"; missing: string }
    | { kind: "ok"; x: string[]; downloads: Series[]; views: Series[]; totalViews: string; totalVideos: string; hasViews: boolean };
  let ugc: UgcState = { kind: "loading" };
  if (data) {
    if (app && app !== "cortifree") ugc = { kind: "otherApp" };
    else if (!data.ugc.connected)
      ugc = { kind: "notConnected", missing: data.ugc.lastRunMessage === "AIRTABLE_TOKEN manquant" ? "AIRTABLE_TOKEN sur Convex (base UGC Airtable)" : "un import de la base UGC Airtable" };
    else {
      const views = data.ugc.views;
      const videos = data.ugc.videos.reduce((s, n) => s + n, 0);
      ugc = {
        kind: "ok",
        x: data.x,
        downloads: downloadsTotalSeries,
        views: [{ key: "views", label: "Vues UGC (vidéos publiées)", color: "var(--series-5)", values: views }],
        totalViews: formatCompact(views.reduce((s, n) => s + n, 0)),
        totalVideos: `${formatInt(videos)} ${plural(videos, "vidéo", "vidéos")}`,
        hasViews: views.some((n) => n > 0),
      };
    }
  }

  /* ---------- Funnel per app ---------- */
  let funnel: FunnelRow[] | null = null;
  if (data) {
    const row = (key: string, appSlug: string | null, label: string, f: { downloads: number; redownloads: number; trialStarts: number; newPaid: number; newUsers: number | null; analyticsSource: string | null }, isTotal: boolean): FunnelRow => ({
      key,
      appSlug,
      label,
      downloads: formatInt(f.downloads),
      redownloads: formatInt(f.redownloads),
      newUsers: f.newUsers == null ? "—" : formatInt(f.newUsers),
      newUsersHint: f.newUsers == null ? "Pas d'analytics branché pour cette app" : f.analyticsSource ? `Source : ${SOURCE_LABEL[f.analyticsSource] ?? f.analyticsSource}` : "",
      trialStarts: formatInt(f.trialStarts),
      newPaid: formatInt(f.newPaid),
      ratio: f.downloads > 0 ? formatPct(f.newPaid / f.downloads) : "—",
      isTotal,
    });
    funnel = data.funnel.map((f) => row(f.slug, f.slug, appName(f.slug), f, false));
    if (data.funnel.length > 1) {
      const sum = (k: "downloads" | "redownloads" | "trialStarts" | "newPaid") => data.funnel.reduce((s, f) => s + f[k], 0);
      const withUsers = data.funnel.filter((f) => f.newUsers != null);
      funnel.push(
        row(
          "total",
          null,
          "Total",
          { downloads: sum("downloads"), redownloads: sum("redownloads"), trialStarts: sum("trialStarts"), newPaid: sum("newPaid"), newUsers: withUsers.length === data.funnel.length ? withUsers.reduce((s, f) => s + (f.newUsers ?? 0), 0) : null, analyticsSource: null },
          true,
        ),
      );
      const total = funnel[funnel.length - 1];
      total.newUsersHint = withUsers.length < data.funnel.length ? "Pas de total : toutes les apps n'ont pas d'analytics branché" : "";
    }
  }
  const funnelSubtitle = data
    ? `Taux = nouveaux payants ÷ téléchargements de la même période (pas une cohorte)${data.eventsLatestDay ? ` · événements Apple jusqu'au ${formatDay(data.eventsLatestDay)}` : ""}`
    : undefined;

  return {
    loading,
    notConnected,
    subtitle,
    lastFetchedAt: data?.lastFetchedAt ?? null,
    latestDayLabel: latestDay ? formatDayLong(latestDay) : null,
    bucketLabel,
    formatX,
    formatXLong,
    kpis,
    downloadsChart,
    countries,
    ugc,
    funnel,
    funnelSubtitle,
  };
}

export type AcquisitionViewModel = ReturnType<typeof useAcquisitionViewModel>;
