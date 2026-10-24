import { api } from "@convex/_generated/api";
import { APPS, appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatEur, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import { categoryLabel } from "@/features/expenses/categories";
import type { Series } from "@/ui";

export type ProfitKpi = { key: string; label: string; value: string; delta?: number | null; foot: string; hint: string };

export type PnlCell = { text: string; title?: string; muted?: boolean; strong?: boolean };
export type PnlColumn = { key: string; header: string; group: "revenue" | "expense" | "result"; hideSm?: boolean };
export type PnlRow = { key: string; label: string; note?: string; cells: Record<string, PnlCell> };

export type ContributionRow = { key: string; slug: string | null; label: string; net: string; expenses: string; contribution: string; negative: boolean; kind: "app" | "studio" | "total" };

const OTHER = "__other";
const MAX_CATEGORIES = 3;
const NOT_COVERED = "Aucun relevé de dépenses importé pour ce mois";

const minus = (n: number, decimals?: boolean) => (n === 0 ? formatEur(0, { decimals }) : `− ${formatEur(n, { decimals })}`);
const signed = (n: number, decimals?: boolean) => (n < 0 ? `− ${formatEur(-n, { decimals })}` : formatEur(n, { decimals }));
// The P&L table always shows cents so columns line up.
const eur = (n: number) => formatEur(n, { decimals: true });

/** Rentabilité ViewModel: monthly P&L (Net − Dépenses) for the months touched by the global period. */
export function useProfitabilityViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const data = useSolisQuery(api.profitability.overview, { from: period.from, to: period.to, app });

  const loading = data === undefined;
  const notConnected = !!data && data.coverage.salesTo == null;
  const expensesMissing = !!data && data.coverage.expensesFrom == null;

  const months = data?.months ?? [];
  const monthsLabel = months.length ? (months.length === 1 ? formatMonthLong(months[0].month) : `${formatMonth(months[0].month)} → ${formatMonth(months[months.length - 1].month)}`) : "";
  const subtitle = [
    months.length ? `${monthsLabel}, par mois civil` : period.label,
    app ? `${appName(app)} (hors coûts studio)` : "Toutes les apps",
    data?.coverage.salesTo ? `données Apple jusqu'au ${formatDay(data.coverage.salesTo)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* ---------- KPIs ---------- */
  let kpis: ProfitKpi[] | null = null;
  if (data) {
    const p = data.period;
    const prev = data.previous;
    const marginPct = p.marginEur != null && p.proceedsEur > 0 ? p.marginEur / p.proceedsEur : null;
    const prevPct = prev.marginEur != null && prev.proceedsEur > 0 ? prev.marginEur / prev.proceedsEur : null;
    const partial = p.coveredMonths > 0 && p.marginEur == null;
    const partialMargin = round2(p.coveredProceedsEur - p.coveredExpensesEur);
    const at = data.allTime;
    kpis = [
      {
        key: "margin",
        label: app ? "Contribution de la période" : "Marge de la période",
        value: p.marginEur != null ? signed(p.marginEur) : "—",
        delta: p.marginEur != null && prev.marginEur != null ? change(p.marginEur, prev.marginEur) : undefined,
        foot: p.marginEur != null ? `net ${formatEur(p.proceedsEur)} − dépenses ${formatEur(p.expensesEur)}` : partial ? `${signed(partialMargin)} sur ${p.coveredMonths} mois couverts` : "dépenses non importées",
        hint: "Net versé par Apple moins toutes les dépenses (UGC inclus) sur les mois affichés",
      },
      {
        key: "pct",
        label: "Marge en % du net",
        value: marginPct != null ? formatPct(marginPct, 0) : "—",
        foot: marginPct != null ? (prevPct != null ? `préc. ${formatPct(prevPct, 0)}` : "par euro versé par Apple") : p.proceedsEur > 0 ? "dépenses non importées" : "aucun net sur la période",
        hint: "Part du net Apple qui reste après les dépenses",
      },
      {
        key: "cumul",
        label: "Net cumulé depuis le début",
        value: formatEur(at.proceedsEur),
        foot: at.marginEur != null ? `marge cumulée ${signed(at.marginEur)}` : at.from ? `depuis le ${formatDay(at.from)} ${at.from.slice(0, 4)}` : "aucune vente",
        hint: app ? `Net Apple de ${appName(app)} depuis la première vente` : "Net Apple de toutes les apps depuis la première vente",
      },
      {
        key: "months",
        label: "Mois rentables",
        value: p.coveredMonths ? `${p.profitableMonths} / ${p.coveredMonths}` : "—",
        foot: p.coveredMonths ? (p.coveredMonths < months.length ? `sur ${p.coveredMonths} mois couverts (sur ${months.length})` : "marge positive") : "dépenses non importées",
        hint: "Mois dont la marge est positive, parmi les mois couverts par des dépenses importées",
      },
    ];
  }

  /* ---------- Charts ---------- */
  const x = months.map((m) => m.month);
  const netVsSpend: Series[] = [
    { key: "net", label: "Net Apple", color: "var(--series-7)", values: months.map((m) => m.proceedsEur) },
    { key: "spend", label: "Dépenses", color: "var(--series-4)", values: months.map((m) => m.expensesEur) },
  ].filter((serie) => serie.key === "net" || !expensesMissing);
  const marginSeries: Series[] = [{ key: "margin", label: app ? "Contribution" : "Marge", color: "var(--series-6)", values: months.map((m) => m.marginEur) }];
  const hasNet = months.some((m) => m.proceedsEur !== 0);
  const hasMargin = months.some((m) => m.marginEur != null);
  const formatXLong = (key: string) => {
    const row = months.find((m) => m.month === key);
    return `${formatMonthLong(key)}${row?.partial ? " (en cours)" : ""}`;
  };

  /* ---------- P&L table ---------- */
  const cats = data?.categories ?? [];
  const namedCats = cats.length > MAX_CATEGORIES + 1 ? cats.slice(0, MAX_CATEGORIES) : cats;
  const hasOther = cats.length > namedCats.length;
  const columns: PnlColumn[] = [
    { key: "gross", header: "Brut TTC", group: "revenue" },
    { key: "vat", header: "TVA", group: "revenue", hideSm: true },
    { key: "fee", header: "Commission Apple", group: "revenue", hideSm: true },
    { key: "net", header: "Net", group: "revenue" },
    ...namedCats.map((c) => ({ key: `cat:${c.key}`, header: categoryLabel(c.key), group: "expense" as const, hideSm: true })),
    ...(hasOther ? [{ key: `cat:${OTHER}`, header: "Autres dépenses", group: "expense" as const, hideSm: true }] : []),
    { key: "spend", header: "Dépenses", group: "expense" },
    { key: "margin", header: app ? "Contribution" : "Marge", group: "result" },
    { key: "pct", header: "Marge %", group: "result" },
  ];

  type Line = { grossEur: number; vatEur: number; commissionEur: number; proceedsEur: number; expensesEur: number | null; marginEur: number | null; byCategory: Record<string, number> | null };
  const cellsOf = (l: Line): Record<string, PnlCell> => {
    const missing: PnlCell = { text: "—", title: NOT_COVERED, muted: true };
    const cells: Record<string, PnlCell> = {
      gross: { text: eur(l.grossEur) },
      vat: { text: minus(l.vatEur, true), muted: true },
      fee: { text: minus(l.commissionEur, true), muted: true },
      net: { text: eur(l.proceedsEur), strong: true },
      spend: l.expensesEur == null ? missing : { text: minus(l.expensesEur, true) },
      margin: l.marginEur == null ? missing : { text: signed(l.marginEur, true), strong: true },
      pct: l.marginEur == null ? missing : { text: l.proceedsEur > 0 ? formatPct(l.marginEur / l.proceedsEur, 0) : "—", muted: l.proceedsEur <= 0 },
    };
    const named = new Set(namedCats.map((c) => c.key));
    for (const c of namedCats) cells[`cat:${c.key}`] = l.byCategory == null ? missing : { text: l.byCategory[c.key] ? minus(l.byCategory[c.key], true) : "—", muted: !l.byCategory[c.key] };
    if (hasOther) {
      const rest = l.byCategory == null ? null : Object.entries(l.byCategory).reduce((s, [k, val]) => (named.has(k) ? s : s + val), 0);
      cells[`cat:${OTHER}`] = rest == null ? missing : { text: rest ? minus(rest, true) : "—", muted: !rest };
    }
    return cells;
  };

  const pnlRows: PnlRow[] = [...months].reverse().map((m) => ({ key: m.month, label: formatMonthLong(m.month), note: m.partial ? "en cours" : undefined, cells: cellsOf(m) }));
  let pnlTotal: PnlRow | null = null;
  if (data && months.length > 1) {
    const p = data.period;
    const byCategory = p.expensesEur == null ? null : Object.fromEntries(cats.map((c) => [c.key, c.total]));
    pnlTotal = { key: "total", label: "Total", cells: cellsOf({ ...p, byCategory }) };
  }

  /* ---------- Per-app contribution ---------- */
  let contribution: { rows: ContributionRow[]; covered: boolean; note: string | null } | null = null;
  if (data) {
    const covered = data.studioExpensesEur != null;
    const order = new Map(APPS.map((a, i) => [a.slug as string, i]));
    const apps = data.apps
      .filter((a) => (app ? a.slug === app : a.proceedsEur !== 0 || (a.expensesEur ?? 0) !== 0))
      .sort((a, b) => b.proceedsEur - a.proceedsEur || (order.get(a.slug) ?? 9) - (order.get(b.slug) ?? 9));
    const rows: ContributionRow[] = apps.map((a) => ({
      key: a.slug,
      slug: a.slug,
      label: appName(a.slug),
      net: eur(a.proceedsEur),
      expenses: a.expensesEur == null ? "—" : a.expensesEur ? minus(a.expensesEur, true) : "—",
      contribution: a.contributionEur == null ? "—" : signed(a.contributionEur, true),
      negative: (a.contributionEur ?? 0) < 0,
      kind: "app",
    }));
    if (!app) {
      const studio = data.studioExpensesEur;
      rows.push({ key: "studio", slug: null, label: "Coûts studio (non répartis)", net: "—", expenses: studio == null ? "—" : studio ? minus(studio, true) : "—", contribution: studio == null ? "—" : signed(-studio, true), negative: (studio ?? 0) > 0, kind: "studio" });
      const { proceedsEur: net, expensesEur: spend, marginEur: margin } = data.contributionTotal;
      rows.push({ key: "total", slug: null, label: "Marge du studio", net: eur(net), expenses: spend == null ? "—" : minus(spend, true), contribution: margin == null ? "—" : signed(margin, true), negative: (margin ?? 0) < 0, kind: "total" });
    }
    const partialMonths = covered && data.contributionMonths < months.length ? data.contributionMonths : null;
    contribution = { rows, covered, note: partialMonths ? `Sur les ${partialMonths} mois couverts par les dépenses` : null };
  }

  const coverageNote = data?.coverage.expensesFrom ? `Dépenses importées à partir du ${formatDay(data.coverage.expensesFrom)} ${data.coverage.expensesFrom.slice(0, 4)}` : null;
  const uncoveredMonths = months.filter((m) => !m.covered).length;

  return {
    loading,
    notConnected,
    expensesMissing,
    subtitle,
    kpis,
    chart: { x, netVsSpend, marginSeries, hasNet, hasMargin, formatX: formatMonth, formatXLong },
    pnl: { columns, rows: pnlRows, total: pnlTotal },
    contribution,
    coverageNote,
    partialCoverage: !!data && !expensesMissing && uncoveredMonths > 0 ? `${uncoveredMonths} mois sans dépenses importées : leur marge n'est pas calculée.` : null,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type ProfitabilityViewModel = ReturnType<typeof useProfitabilityViewModel>;
