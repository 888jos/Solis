import { api } from "@convex/_generated/api";
import { useState } from "react";
import { APPS, appColor, appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatDayLong, formatEur, formatInt, formatPct } from "@/lib/format";
import type { BarListItem } from "@/ui";

export type GeoKpi = { key: string; label: string; value: string; delta?: number | null; foot: string; hint: string };
export type CountryRow = {
  key: string;
  flag: string;
  name: string;
  code: string;
  net: string;
  gross: string;
  exVat: string;
  vat: string;
  vatHint: string;
  transactions: string;
  downloads: string;
  conversion: string;
  conversionHint: string;
  active: string;
  refunds: string | null;
};
export type AppMultiple = { slug: string; name: string; total: string; items: BarListItem[] };

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" });
  } catch {
    return null;
  }
})();

/** "FR" → "France" (falls back to the code for storefronts Intl does not know). */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/i.test(code)) return code || "Inconnu";
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "FR" → regional-indicator flag emoji. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const label = (code: string) => `${countryFlag(code)} ${countryName(code)}`.trim();

/** Pays page ViewModel: Apple SALES lines per storefront for the global period/app filters. */
export function useGeoViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const [showAll, setShowAll] = useState(false);

  const freshness = useSolisQuery(api.revenue.latestDataDay, {});
  const data = useSolisQuery(api.geo.byCountry, { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, app });

  const notConnected = freshness !== undefined && freshness.latestDay == null;
  const latestDay = freshness?.latestDay ?? null;
  const subtitle = [period.label, app ? appName(app) : "Toutes les apps", latestDay ? `données Apple jusqu'au ${formatDay(latestDay)}` : null].filter(Boolean).join(" · ");

  /* ---------- KPIs ---------- */
  let kpis: GeoKpi[] | null = null;
  if (data) {
    const c = data.current;
    const p = data.previous;
    const top = c.topCountry ? data.countries.find((r) => r.country === c.topCountry) : undefined;
    const withDownloads = data.countries.filter((r) => r.downloads > 0).length;
    kpis = [
      {
        key: "countries",
        label: "Pays avec ventes",
        value: formatInt(c.countriesWithSales),
        delta: change(c.countriesWithSales, p.countriesWithSales),
        foot: `${formatInt(withDownloads)} avec téléchargements`,
        hint: "Pays où le net Apple de la période est positif (remboursements déduits)",
      },
      {
        key: "top",
        label: "Part du 1er pays",
        value: formatPct(c.topShare, 0),
        foot: top ? `${label(top.country)} · ${formatEur(top.proceedsEur)}` : "Aucune vente",
        hint: `Part du net total réalisée dans le premier pays${p.topShare != null ? ` (période précédente : ${formatPct(p.topShare, 0)})` : ""}`,
      },
      {
        key: "nonus",
        label: "Part hors États-Unis",
        value: formatPct(c.nonUsShare, 0),
        foot: p.nonUsShare != null ? `préc. ${formatPct(p.nonUsShare, 0)}` : "Net réalisé hors US",
        hint: "Part du net réalisée hors du storefront américain",
      },
      {
        key: "avg",
        label: "Net moyen par transaction",
        value: formatEur(c.netPerTransaction, { decimals: true }),
        delta: c.netPerTransaction != null && p.netPerTransaction != null ? change(c.netPerTransaction, p.netPerTransaction) : null,
        foot: `${formatInt(c.paidUnits)} transaction${c.paidUnits > 1 ? "s" : ""} payante${c.paidUnits > 1 ? "s" : ""}`,
        hint: "Net Apple (remboursements déduits) divisé par le nombre de transactions payantes",
      },
    ];
  }

  /* ---------- Bars ---------- */
  const netBars: BarListItem[] | null = data
    ? data.countries
        .filter((r) => r.proceedsEur > 0.005)
        .map((r) => ({ key: r.country, label: label(r.country), value: r.proceedsEur, hint: `${countryName(r.country)} : ${formatEur(r.proceedsEur)} net, ${formatEur(r.grossEur)} brut` }))
    : null;
  const totalNet = data ? formatEur(data.totals.proceedsEur) : null;
  const NET_LIMIT = 12;
  const netSubtitle = netBars && netBars.length > NET_LIMIT ? `${NET_LIMIT} premiers sur ${netBars.length} pays · remboursements déduits` : "Remboursements déduits";

  const activeBars: BarListItem[] | null = data
    ? data.countries
        .filter((r) => r.activePaid > 0)
        .sort((a, b) => b.activePaid - a.activePaid || a.country.localeCompare(b.country))
        .map((r) => ({ key: r.country, label: label(r.country), value: r.activePaid, color: "var(--glow-violet)", hint: `${countryName(r.country)} : ${formatInt(r.activePaid)} abonnés payants` }))
    : null;
  const activeSubtitle = data?.activeDay ? `Rapport Subscription du ${formatDayLong(data.activeDay)} · ${formatInt(data.activeTotal)} au total, hors essais gratuits` : null;

  /* ---------- Small multiples by app ---------- */
  let multiples: AppMultiple[] | null = null;
  if (data && !app) {
    multiples = APPS.map((a) => {
      const items = data.countries
        .map((r) => ({ country: r.country, net: r.byApp.find((b) => b.slug === a.slug)?.proceedsEur ?? 0 }))
        .filter((r) => r.net > 0.005)
        .sort((x, y) => y.net - x.net);
      const total = items.reduce((sum, r) => sum + r.net, 0);
      return {
        slug: a.slug,
        name: a.name,
        total: formatEur(total),
        items: items.slice(0, 5).map((r) => ({ key: r.country, label: label(r.country), value: r.net, color: appColor(a.slug), hint: `${formatPct(total > 0 ? r.net / total : null, 0)} du net ${a.name}` })),
      };
    });
  }

  /* ---------- Table ---------- */
  let rows: CountryRow[] | null = null;
  let hiddenCount = 0;
  if (data) {
    const all = data.countries.map((r) => {
      const conv = r.downloads > 0 && r.newSubscriptions > 0 ? r.newSubscriptions / r.downloads : null;
      return {
        key: r.country,
        flag: countryFlag(r.country),
        name: countryName(r.country),
        code: r.country,
        net: formatEur(r.proceedsEur),
        gross: formatEur(r.grossEur),
        exVat: formatEur(r.exVatEur),
        vat: r.effectiveVat != null ? formatPct(r.effectiveVat) : "—",
        vatHint: `Taux légal appliqué : ${formatPct(r.vatRate)}`,
        transactions: r.paidUnits ? formatInt(r.paidUnits) : "—",
        downloads: r.downloads ? formatInt(r.downloads) : "—",
        conversion: conv != null ? formatPct(conv) : "—",
        conversionHint: `${formatInt(r.newSubscriptions)} nouveaux abonnements payants pour ${formatInt(r.downloads)} premiers téléchargements`,
        active: r.activePaid ? formatInt(r.activePaid) : "—",
        refunds: r.refundUnits ? `${formatInt(r.refundUnits)} remb.` : null,
        money: r.grossEur !== 0 || r.proceedsEur !== 0 || r.paidUnits > 0 || r.activePaid > 0,
      };
    });
    const money = all.filter((r) => r.money);
    hiddenCount = all.length - money.length;
    rows = (showAll ? all : money).map(({ money: _money, ...row }) => row);
  }
  const tableSubtitle = data
    ? `${formatInt(data.countries.length)} pays · net ${formatEur(data.totals.proceedsEur)}, brut ${formatEur(data.totals.grossEur)}, TVA ${formatEur(data.totals.vatEur)}`
    : undefined;

  return {
    subtitle,
    notConnected,
    loading: !data,
    lastFetchedAt: freshness?.lastFetchedAt ?? null,
    latestDayLabel: latestDay ? formatDayLong(latestDay) : null,
    kpis,
    netBars,
    globePoints: (netBars ?? []).map((b) => ({ code: b.key, value: b.value, label: label(b.key), valueLabel: `${formatEur(b.value)} net` })),
    totalNet,
    netSubtitle,
    netLimit: NET_LIMIT,
    activeBars,
    activeSubtitle,
    hasActiveReport: !!data?.activeDay,
    multiples,
    rows,
    tableSubtitle,
    hiddenCount,
    showAll,
    toggleShowAll: () => setShowAll((v) => !v),
    formatEur: (v: number) => formatEur(v),
    formatInt: (v: number) => formatInt(v),
  };
}

export type GeoViewModel = ReturnType<typeof useGeoViewModel>;
