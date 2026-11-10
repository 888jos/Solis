import { v } from "convex/values";
import { loadSpend, type SpendItem } from "./expenses";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";
import { addSale, emptyTotals, loadSales, type RevenueTotals } from "./revenue";

// Model of the Rentabilité page: a monthly P&L built from the revenue model (appleSales, Net = Apple
// proceeds) and the expenses model (expenses + UGC payouts, superseded bank lines skipped).
// Marge = Net − Dépenses. Months before the first expense data are "not covered": their expenses and
// margin are null, never 0, so a month without imported bank statements never looks profitable.
// Studio-wide expenses (no appSlug) are never allocated to an app.

const FIRST_DAY = "2000-01-01";
const round2 = (n: number) => Math.round(n * 100) / 100;

function monthAdd(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  for (let m = fromMonth; m <= toMonth; m = monthAdd(m, 1)) out.push(m);
  return out;
}

const lastDayOf = (month: string) => addDays(`${monthAdd(month, 1)}-01`, -1);

type MonthAgg = { sales: RevenueTotals; spend: number; byCategory: Map<string, number>; byApp: Map<string, { proceeds: number; spend: number }>; studioSpend: number };

function emptyMonth(): MonthAgg {
  return { sales: emptyTotals(), spend: 0, byCategory: new Map(), byApp: new Map(), studioSpend: 0 };
}

/** First day covered by expense data: earliest expense, UGC payout or imported bank statement. */
async function expensesCoveredFrom(ctx: Parameters<typeof loadSpend>[0]): Promise<string | null> {
  const firstExpense = await ctx.db.query("expenses").withIndex("by_date").first();
  const firstPayout = await ctx.db.query("ugcPayouts").withIndex("by_month").first();
  const batches = await ctx.db.query("importBatches").collect();
  const candidates = [firstExpense?.date, firstPayout ? `${firstPayout.month}-01` : undefined, ...batches.map((b) => b.dateFrom)].filter((d): d is string => !!d);
  return candidates.sort()[0] ?? null;
}

/**
 * Monthly P&L for every month touching [from, to] (the last month stops at `to`), the same number of
 * months just before (for deltas), all-time cumulative totals and the per-app contribution.
 * `app` restricts revenue to that app and expenses to the ones attributed to it.
 */
export const overview = authQuery({
  args: { from: v.string(), to: v.string(), app: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { from, to, app }) => {
    const months = monthsBetween(from.slice(0, 7), to.slice(0, 7));

    const [sales, spendAll, coveredFrom, latestSalesDay] = await Promise.all([
      loadSales(ctx, FIRST_DAY, to, null),
      loadSpend(ctx, FIRST_DAY, to, null),
      expensesCoveredFrom(ctx),
      ctx.db.query("appleReportDays").withIndex("by_type_date", (q) => q.eq("reportType", "SALES")).order("desc").filter((q) => q.eq(q.field("status"), "ok")).first(),
    ]);
    const spend: SpendItem[] = spendAll.filter((i) => !i.superseded);
    const coveredMonth = coveredFrom?.slice(0, 7) ?? null;
    const isCovered = (month: string) => coveredMonth != null && month >= coveredMonth;

    // Aggregate everything by month once.
    const byMonth = new Map<string, MonthAgg>();
    const get = (month: string) => {
      let m = byMonth.get(month);
      if (!m) byMonth.set(month, (m = emptyMonth()));
      return m;
    };
    let firstSale: string | null = null;
    const appEntry = (map: Map<string, { proceeds: number; spend: number }>, slug: string) => {
      let e = map.get(slug);
      if (!e) map.set(slug, (e = { proceeds: 0, spend: 0 }));
      return e;
    };
    for (const s of sales) {
      if (s.proceedsEur !== 0 && (!firstSale || s.date < firstSale)) firstSale = s.date;
      const m = get(s.date.slice(0, 7));
      appEntry(m.byApp, s.appSlug).proceeds += s.proceedsEur;
      if (!app || s.appSlug === app) addSale(m.sales, s);
    }
    // Otto (ottoknows.it, Stripe): counted as collected, Stripe fees not deducted, only on the all-projects view.
    if (!app) {
      // Stripe connected: gross = what customers paid, net = payout after Stripe fees and refunds.
      const stripeRows = await ctx.db.query("stripeDaily").withIndex("by_project_day", (q) => q.eq("project", "otto").lte("day", to)).collect();
      for (const r of stripeRows) {
        if (!r.gross && !r.net) continue;
        if (!firstSale || r.day < firstSale) firstSale = r.day;
        const m = get(r.day.slice(0, 7));
        appEntry(m.byApp, "otto").proceeds += r.net;
        m.sales.grossEur += r.gross;
        m.sales.exVatEur += r.net;
        m.sales.proceedsEur += r.net;
      }
      const ottoRows = stripeRows.length ? [] : await ctx.db.query("ottoDaily").withIndex("by_day", (q) => q.lte("day", to)).collect();
      for (const r of ottoRows) {
        if (!r.revenueCents) continue;
        const eur = r.revenueCents / 100;
        if (!firstSale || r.day < firstSale) firstSale = r.day;
        const m = get(r.day.slice(0, 7));
        appEntry(m.byApp, "otto").proceeds += eur;
        m.sales.grossEur += eur;
        m.sales.exVatEur += eur;
        m.sales.proceedsEur += eur;
      }
    }
    let studioSpendAllTime = 0;
    for (const i of spend) {
      const m = get(i.date.slice(0, 7));
      if (i.appSlug) appEntry(m.byApp, i.appSlug).spend += i.amountEur;
      else {
        m.studioSpend += i.amountEur;
        studioSpendAllTime += i.amountEur;
      }
      if (app && i.appSlug !== app) continue;
      m.spend += i.amountEur;
      m.byCategory.set(i.category, (m.byCategory.get(i.category) ?? 0) + i.amountEur);
    }

    const rowOf = (month: string) => {
      const m = byMonth.get(month) ?? emptyMonth();
      const covered = isCovered(month);
      const t = m.sales;
      const proceeds = round2(t.proceedsEur);
      const expenses = covered ? round2(m.spend) : null;
      return {
        month,
        partial: lastDayOf(month) > to,
        covered,
        grossEur: round2(t.grossEur),
        vatEur: round2(t.grossEur - t.exVatEur),
        commissionEur: round2(t.exVatEur - t.proceedsEur),
        proceedsEur: proceeds,
        expensesEur: expenses,
        byCategory: covered ? Object.fromEntries([...m.byCategory].map(([k, val]) => [k, round2(val)])) : null,
        marginEur: expenses == null ? null : round2(proceeds - expenses),
      };
    };
    // Skip leading months where nothing happened yet (before the first sale or expense).
    const firstActive = [...byMonth.keys()].sort()[0];
    const shown = firstActive ? months.filter((m, i) => m >= firstActive || i === months.length - 1) : months.slice(-1);
    const rows = shown.map(rowOf);
    const prevRows = shown.map((_, i) => monthAdd(shown[0], i - shown.length)).map(rowOf);

    // Top categories over the shown months (the P&L shows them, the rest goes into "Autres").
    const catTotals = new Map<string, number>();
    for (const r of rows) for (const [k, val] of Object.entries(r.byCategory ?? {})) catTotals.set(k, (catTotals.get(k) ?? 0) + val);
    const categories = [...catTotals].sort((a, b) => b[1] - a[1]).map(([k, total]) => ({ key: k, total: round2(total) }));

    // Totals are summed from the raw month aggregates (not the rounded rows) so they match the
    // contribution table to the cent.
    const totalsOf = (list: typeof rows) => {
      const raw = { gross: 0, exVat: 0, proceeds: 0, spend: 0, coveredProceeds: 0, coveredSpend: 0 };
      for (const r of list) {
        const m = byMonth.get(r.month);
        if (!m) continue;
        raw.gross += m.sales.grossEur;
        raw.exVat += m.sales.exVatEur;
        raw.proceeds += m.sales.proceedsEur;
        if (r.covered) {
          raw.coveredProceeds += m.sales.proceedsEur;
          raw.coveredSpend += m.spend;
        }
      }
      const coveredRows = list.filter((r) => r.covered);
      const allCovered = list.length > 0 && coveredRows.length === list.length;
      return {
        grossEur: round2(raw.gross),
        vatEur: round2(raw.gross - raw.exVat),
        commissionEur: round2(raw.exVat - raw.proceeds),
        proceedsEur: round2(raw.proceeds),
        expensesEur: allCovered ? round2(raw.coveredSpend) : null,
        marginEur: allCovered ? round2(raw.proceeds - raw.coveredSpend) : null,
        coveredMonths: coveredRows.length,
        profitableMonths: coveredRows.filter((r) => (r.marginEur ?? 0) > 0).length,
        // Partial coverage: margin over the covered months only.
        coveredProceedsEur: round2(raw.coveredProceeds),
        coveredExpensesEur: round2(raw.coveredSpend),
      };
    };

    // All time (from the first month with data up to `to`).
    const allMonths = [...byMonth.keys()].filter((m) => m <= to.slice(0, 7)).sort();
    const allRows = allMonths.map(rowOf);
    const allTime = totalsOf(allRows);

    // Per-app contribution: Net of the app − expenses attributed to it. When expenses cover only part of
    // the shown months, both sides are restricted to the covered months so the line stays comparable.
    const anyCovered = shown.some(isCovered);
    const contributionMonths = anyCovered ? shown.filter(isCovered) : shown;
    const contribution = new Map<string, { proceeds: number; spend: number }>();
    let studioSpend = 0;
    for (const month of contributionMonths) {
      const m = byMonth.get(month);
      if (!m) continue;
      for (const [slug, e] of m.byApp) {
        const c = appEntry(contribution, slug);
        c.proceeds += e.proceeds;
        c.spend += e.spend;
      }
      studioSpend += m.studioSpend;
    }
    const contribTotals = [...contribution.values()].reduce((t, c) => ({ proceeds: t.proceeds + c.proceeds, spend: t.spend + c.spend }), { proceeds: 0, spend: studioSpend });

    return {
      months: rows,
      prevMonths: prevRows,
      categories,
      period: totalsOf(rows),
      previous: totalsOf(prevRows),
      allTime: { ...allTime, from: firstSale, studioSpendEur: round2(studioSpendAllTime) },
      apps: [...contribution]
        .map(([slug, c]) => ({ slug, proceedsEur: round2(c.proceeds), expensesEur: anyCovered ? round2(c.spend) : null, contributionEur: anyCovered ? round2(c.proceeds - c.spend) : null }))
        .sort((a, b) => b.proceedsEur - a.proceedsEur),
      studioExpensesEur: anyCovered ? round2(studioSpend) : null,
      contributionTotal: { proceedsEur: round2(contribTotals.proceeds), expensesEur: anyCovered ? round2(contribTotals.spend) : null, marginEur: anyCovered ? round2(contribTotals.proceeds - contribTotals.spend) : null },
      contributionMonths: contributionMonths.length,
      coverage: { expensesFrom: coveredFrom, salesTo: latestSalesDay?.date ?? null, salesFrom: firstSale },
    };
  },
});
