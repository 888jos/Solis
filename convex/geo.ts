import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { vatRate } from "./lib/vat";
import { comparablePrevTo, loadSales, totalsOf, type RevenueTotals } from "./revenue";

// Geography model: Apple SALES lines grouped by storefront country, plus the paid subscriptions
// active per country from the latest SUBSCRIPTION report of the period. Refunds are included
// (negative units), so country nets add up to the revenue page total.

type Sale = Doc<"appleSales">;

const appArg = v.optional(v.union(v.string(), v.null()));

/** Headline shares over a set of sale lines (used for the current and the previous period). */
function statsOf(rows: Sale[]) {
  const byCountry = new Map<string, number>();
  for (const s of rows) byCountry.set(s.country, (byCountry.get(s.country) ?? 0) + s.proceedsEur);
  const totals = totalsOf(rows);
  const nets = [...byCountry.entries()].filter(([, net]) => net > 0.005).sort((a, b) => b[1] - a[1]);
  const net = totals.proceedsEur;
  const us = byCountry.get("US") ?? 0;
  return {
    countriesWithSales: nets.length,
    topCountry: nets[0]?.[0] ?? null,
    topShare: net > 0 && nets.length ? nets[0][1] / net : null,
    nonUsShare: net > 0 ? Math.min(1, Math.max(0, Math.round(((net - us) / net) * 10000) / 10000)) : null,
    netPerTransaction: totals.paidUnits > 0 ? net / totals.paidUnits : null,
    proceedsEur: net,
    paidUnits: totals.paidUnits,
  };
}

/** Latest SUBSCRIPTION report day with data in [from, to] (null if none). */
async function latestSubscriptionDay(ctx: QueryCtx, from: string, to: string): Promise<string | null> {
  const row = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION").gte("date", from).lte("date", to))
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "ok"))
    .first();
  return row?.date ?? null;
}

/**
 * Everything the Pays page needs for [from, to] (and the previous window for KPI deltas).
 * countries: every storefront with money or downloads, sorted by net desc, with RevenueTotals,
 * the effective VAT share of the gross, net per app, and paid subscriptions active on `activeDay`.
 */
export const byCountry = authQuery({
  args: { from: v.string(), to: v.string(), prevFrom: v.string(), prevTo: v.string(), app: appArg },
  handler: async (ctx, { from, to, prevFrom, prevTo, app }) => {
    const prevCmpTo = await comparablePrevTo(ctx, "SALES", to, prevTo);
    const [rows, prevRows] = await Promise.all([loadSales(ctx, from, to, app), loadSales(ctx, prevFrom, prevCmpTo, app)]);

    const groups = new Map<string, Sale[]>();
    for (const s of rows) {
      let list = groups.get(s.country);
      if (!list) groups.set(s.country, (list = []));
      list.push(s);
    }

    const activeDay = await latestSubscriptionDay(ctx, from, to);
    const active = new Map<string, number>();
    if (activeDay) {
      const subs = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.eq("date", activeDay)).collect();
      for (const r of subs) {
        if (app && r.appSlug !== app) continue;
        const paid = r.activeStandard + r.activeIntroPaid + r.activePromo;
        if (paid) active.set(r.country, (active.get(r.country) ?? 0) + paid);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const countries: (RevenueTotals & { country: string; vatRate: number; effectiveVat: number | null; activePaid: number; byApp: { slug: string; proceedsEur: number }[] })[] = [];
    const keys = new Set([...groups.keys(), ...active.keys()]);
    for (const country of keys) {
      const list = groups.get(country) ?? [];
      const t = totalsOf(list);
      const activePaid = active.get(country) ?? 0;
      if (!t.grossEur && !t.proceedsEur && !t.downloads && !t.paidUnits && !t.refundUnits && !activePaid) continue;
      const perApp = new Map<string, number>();
      for (const s of list) perApp.set(s.appSlug, (perApp.get(s.appSlug) ?? 0) + s.proceedsEur);
      countries.push({
        country,
        ...t,
        vatRate: vatRate(country),
        effectiveVat: t.grossEur > 0 ? round(t.vatEur) / t.grossEur : null,
        activePaid,
        byApp: [...perApp.entries()].map(([slug, net]) => ({ slug, proceedsEur: round(net) })).filter((a) => a.proceedsEur !== 0),
      });
    }
    countries.sort((a, b) => b.proceedsEur - a.proceedsEur || b.grossEur - a.grossEur || b.downloads - a.downloads || a.country.localeCompare(b.country));

    return {
      totals: totalsOf(rows),
      current: statsOf(rows),
      previous: statsOf(prevRows),
      activeDay,
      activeTotal: [...active.values()].reduce((sum, n) => sum + n, 0),
      countries,
    };
  },
});
