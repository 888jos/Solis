import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";

// Revenue model: aggregates over appleSales (Apple SALES daily reports, amounts in EUR on the sale day).
// All amounts include refunds (negative units), so they match what Apple pays out.
// Reused by overview, geo, acquisition and profitability: keep these generic.

type Sale = Doc<"appleSales">;

/** Rows of [from, to] (inclusive), optionally for one app. */
export async function loadSales(ctx: QueryCtx, from: string, to: string, app?: string | null): Promise<Sale[]> {
  if (app) return ctx.db.query("appleSales").withIndex("by_app_date", (q) => q.eq("appSlug", app).gte("date", from).lte("date", to)).collect();
  return ctx.db.query("appleSales").withIndex("by_date", (q) => q.gte("date", from).lte("date", to)).collect();
}

/**
 * End of the previous window to compare with [from, to] on the same number of reported days.
 * Apple publishes a report day ~1 day late: when the latest published day of `reportType`
 * (status ok or empty) is before `to`, the previous window loses the same number of trailing days.
 * Returns `prevTo` unchanged when the current window is fully published (or nothing was ever synced).
 */
export async function comparablePrevTo(ctx: QueryCtx, reportType: string, to: string, prevTo: string): Promise<string> {
  const rows = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", reportType).lte("date", to))
    .order("desc")
    .take(30);
  const latest = rows.find((r) => r.status === "ok" || r.status === "empty")?.date ?? null;
  if (!latest || latest >= to) return prevTo;
  const missing = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86400000);
  return addDays(prevTo, -missing);
}

export type RevenueTotals = {
  grossEur: number; // Brut TTC
  exVatEur: number; // HT
  vatEur: number; // grossEur − exVatEur
  proceedsEur: number; // Net (Apple developer proceeds)
  commissionEur: number; // exVatEur − proceedsEur (Apple commission + any local withholding)
  paidUnits: number; // paid transactions (price > 0, units > 0)
  newSubscriptions: number; // paid units with Subscription = "New"
  renewals: number; // paid units with Subscription = "Renewal"
  refundUnits: number; // refunded units (positive count)
  refundGrossEur: number; // refunded amount, positive
  refundProceedsEur: number; // proceeds clawed back, positive
  downloads: number; // first-time downloads (product types 1, 1F, 1T, F1)
};

export function emptyTotals(): RevenueTotals {
  return { grossEur: 0, exVatEur: 0, vatEur: 0, proceedsEur: 0, commissionEur: 0, paidUnits: 0, newSubscriptions: 0, renewals: 0, refundUnits: 0, refundGrossEur: 0, refundProceedsEur: 0, downloads: 0 };
}

/** Add one sale line to running totals. */
export function addSale(t: RevenueTotals, s: Sale) {
  t.grossEur += s.grossEur;
  t.exVatEur += s.exVatEur;
  t.proceedsEur += s.proceedsEur;
  if (s.customerPrice !== 0 && s.units > 0) {
    t.paidUnits += s.units;
    if (s.subscriptionKind === "New") t.newSubscriptions += s.units;
    if (s.subscriptionKind === "Renewal") t.renewals += s.units;
  }
  if (s.units < 0) {
    t.refundUnits -= s.units;
    t.refundGrossEur -= s.grossEur;
    t.refundProceedsEur -= s.proceedsEur;
  }
  if (s.isDownload) t.downloads += s.units;
}

function finish(t: RevenueTotals): RevenueTotals {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    ...t,
    grossEur: r(t.grossEur),
    exVatEur: r(t.exVatEur),
    proceedsEur: r(t.proceedsEur),
    vatEur: r(t.grossEur - t.exVatEur),
    commissionEur: r(t.exVatEur - t.proceedsEur),
    refundGrossEur: r(t.refundGrossEur),
    refundProceedsEur: r(t.refundProceedsEur),
  };
}

export function totalsOf(rows: Sale[]): RevenueTotals {
  const t = emptyTotals();
  for (const row of rows) addSale(t, row);
  return finish(t);
}

/** Bucket key of a day: day → "YYYY-MM-DD", week → Monday "YYYY-MM-DD", month → "YYYY-MM". */
export function bucketOf(day: string, bucket: "day" | "week" | "month"): string {
  if (bucket === "day") return day;
  if (bucket === "month") return day.slice(0, 7);
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(day, -weekday);
}

/** Every bucket key covering [from, to], in order. */
export function bucketsBetween(from: string, to: string, bucket: "day" | "week" | "month"): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const key = bucketOf(d, bucket);
    if (out[out.length - 1] !== key) out.push(key);
  }
  return out;
}

const bucketArg = v.union(v.literal("day"), v.literal("week"), v.literal("month"));
const appArg = v.optional(v.union(v.string(), v.null()));

/**
 * Headline totals for a period and the previous period of the same length.
 * Returns { current, previous } as RevenueTotals (EUR, refunds included).
 */
export const summary = authQuery({
  args: { from: v.string(), to: v.string(), prevFrom: v.string(), prevTo: v.string(), app: appArg },
  handler: async (ctx, { from, to, prevFrom, prevTo, app }) => {
    // Deltas compare equal numbers of reported days (see comparablePrevTo).
    const prevCmpTo = await comparablePrevTo(ctx, "SALES", to, prevTo);
    const [current, previous] = await Promise.all([loadSales(ctx, from, to, app), loadSales(ctx, prevFrom, prevCmpTo, app)]);
    return { current: totalsOf(current), previous: totalsOf(previous), prevComparedTo: prevCmpTo };
  },
});

/**
 * Time series per app. x = bucket keys covering [from, to]; for each app present in the data (or the
 * requested app): gross / exVat / proceeds / paidUnits / downloads per bucket (0 when nothing sold).
 */
export const series = authQuery({
  args: { from: v.string(), to: v.string(), bucket: bucketArg, app: appArg },
  handler: async (ctx, { from, to, bucket, app }) => {
    const rows = await loadSales(ctx, from, to, app);
    const x = bucketsBetween(from, to, bucket);
    const index = new Map(x.map((key, i) => [key, i]));
    const zeros = () => x.map(() => 0);
    const byApp = new Map<string, { grossEur: number[]; exVatEur: number[]; proceedsEur: number[]; paidUnits: number[]; downloads: number[] }>();
    if (app) byApp.set(app, { grossEur: zeros(), exVatEur: zeros(), proceedsEur: zeros(), paidUnits: zeros(), downloads: zeros() });
    for (const s of rows) {
      const i = index.get(bucketOf(s.date, bucket));
      if (i == null) continue;
      let a = byApp.get(s.appSlug);
      if (!a) byApp.set(s.appSlug, (a = { grossEur: zeros(), exVatEur: zeros(), proceedsEur: zeros(), paidUnits: zeros(), downloads: zeros() }));
      a.grossEur[i] += s.grossEur;
      a.exVatEur[i] += s.exVatEur;
      a.proceedsEur[i] += s.proceedsEur;
      if (s.customerPrice !== 0 && s.units > 0) a.paidUnits[i] += s.units;
      if (s.isDownload) a.downloads[i] += s.units;
    }
    const round = (arr: number[]) => arr.map((n) => Math.round(n * 100) / 100);
    return {
      x,
      bucket,
      apps: [...byApp.entries()].map(([slug, a]) => ({ slug, grossEur: round(a.grossEur), exVatEur: round(a.exVatEur), proceedsEur: round(a.proceedsEur), paidUnits: a.paidUnits, downloads: a.downloads })),
    };
  },
});

const TYPE_LABELS: Record<string, string> = {
  IAY: "Abonnement auto-renouvelable",
  IA1: "Achat intégré",
  IA9: "Achat intégré non consommable",
  IAC: "Abonnement non renouvelable",
  "1": "Téléchargement",
  "1F": "Téléchargement",
  "1T": "Téléchargement",
  F1: "Téléchargement",
  "3": "Re-téléchargement",
  "3F": "Re-téléchargement",
  "7": "Mise à jour",
  "7F": "Mise à jour",
};

/**
 * Breakdown by product (SKU, latest title) and by Apple product type, for [from, to].
 * products: only lines with money or paid units (free downloads/updates excluded), sorted by net desc.
 */
export const breakdown = authQuery({
  args: { from: v.string(), to: v.string(), app: appArg },
  handler: async (ctx, { from, to, app }) => {
    const rows = await loadSales(ctx, from, to, app);
    const products = new Map<string, { sku: string; title: string; titleDate: string; appSlug: string; productTypeId: string; isSubscription: boolean; t: RevenueTotals }>();
    const types = new Map<string, { t: RevenueTotals; units: number }>();
    for (const s of rows) {
      let tt = types.get(s.productTypeId);
      if (!tt) types.set(s.productTypeId, (tt = { t: emptyTotals(), units: 0 }));
      addSale(tt.t, s);
      tt.units += s.units;
      const paid = s.customerPrice !== 0 || s.proceeds !== 0;
      if (!paid) continue;
      const key = `${s.appSlug}|${s.sku}`;
      let p = products.get(key);
      if (!p) products.set(key, (p = { sku: s.sku, title: s.title, titleDate: s.date, appSlug: s.appSlug, productTypeId: s.productTypeId, isSubscription: s.isSubscription, t: emptyTotals() }));
      if (s.date >= p.titleDate) {
        p.title = s.title;
        p.titleDate = s.date;
      }
      addSale(p.t, s);
    }
    return {
      products: [...products.values()]
        .map((p) => ({ sku: p.sku, title: p.title, appSlug: p.appSlug, productTypeId: p.productTypeId, isSubscription: p.isSubscription, ...finish(p.t) }))
        .sort((a, b) => b.proceedsEur - a.proceedsEur || b.grossEur - a.grossEur),
      productTypes: [...types.entries()]
        .map(([productTypeId, { t, units }]) => ({ productTypeId, label: TYPE_LABELS[productTypeId] ?? productTypeId, units, ...finish(t) }))
        .sort((a, b) => b.proceedsEur - a.proceedsEur || b.units - a.units),
    };
  },
});

/** Refund lines (negative units) of [from, to], grouped by day × product × country, newest first. */
export const refunds = authQuery({
  args: { from: v.string(), to: v.string(), app: appArg },
  handler: async (ctx, { from, to, app }) => {
    const rows = (await loadSales(ctx, from, to, app)).filter((s) => s.units < 0);
    const grouped = new Map<string, { date: string; appSlug: string; sku: string; title: string; country: string; units: number; grossEur: number; proceedsEur: number }>();
    for (const s of rows) {
      const key = `${s.date}|${s.sku}|${s.country}`;
      const g = grouped.get(key) ?? { date: s.date, appSlug: s.appSlug, sku: s.sku, title: s.title, country: s.country, units: 0, grossEur: 0, proceedsEur: 0 };
      g.units -= s.units;
      g.grossEur -= s.grossEur;
      g.proceedsEur -= s.proceedsEur;
      grouped.set(key, g);
    }
    return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  },
});

/**
 * Freshness of the Apple SALES pipeline: latest day with data, first day, days ok/empty/error and
 * the last fetch time. latestDay is null when nothing was synced yet.
 */
export const latestDataDay = authQuery({
  args: {},
  handler: async (ctx) => {
    const days = await ctx.db.query("appleReportDays").withIndex("by_type_date", (q) => q.eq("reportType", "SALES")).collect();
    let latestDay: string | null = null;
    let firstDay: string | null = null;
    let lastFetchedAt: number | null = null;
    const counts = { ok: 0, empty: 0, error: 0 };
    const errors: { date: string; message: string | null }[] = [];
    for (const d of days) {
      counts[d.status]++;
      if (d.status === "ok") {
        if (!latestDay || d.date > latestDay) latestDay = d.date;
        if (!firstDay || d.date < firstDay) firstDay = d.date;
      }
      if (d.status === "error") errors.push({ date: d.date, message: d.message ?? null });
      if (!lastFetchedAt || d.fetchedAt > lastFetchedAt) lastFetchedAt = d.fetchedAt;
    }
    return { latestDay, firstDay, lastFetchedAt, counts, errors: errors.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20) };
  },
});
