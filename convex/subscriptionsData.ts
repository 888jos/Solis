import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

// Write side of the subscriptions model (non-node). Called by convex/sources/subscriptions.ts.

const dailyRow = v.object({
  appSlug: v.string(),
  subscriptionName: v.string(),
  subscriptionAppleId: v.string(),
  durationLabel: v.string(),
  country: v.string(),
  activeStandard: v.number(),
  activeIntroTrial: v.number(),
  activeIntroPaid: v.number(),
  activePromo: v.number(),
  activeFreeOffer: v.number(),
  billingRetry: v.number(),
  gracePeriod: v.number(),
});

const eventRow = v.object({
  appSlug: v.string(),
  date: v.string(),
  event: v.string(),
  offerType: v.string(),
  offerDuration: v.string(),
  durationLabel: v.string(),
  originalStartDate: v.string(),
  subscriptionName: v.string(),
  subscriptionAppleId: v.string(),
  country: v.string(),
  count: v.number(),
});

async function markReportDay(ctx: MutationCtx, reportType: string, date: string, status: "ok" | "empty" | "error", rows: number) {
  const existing = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", reportType).eq("date", date))
    .first();
  const patch = { status, rows, fetchedAt: Date.now() };
  if (existing) await ctx.db.patch(existing._id, patch);
  else await ctx.db.insert("appleReportDays", { reportType, date, ...patch });
}

/** Replace every SUBSCRIPTION line of one report day. `rows: null` = Apple has no report (404). */
export const replaceDailyDay = internalMutation({
  args: { date: v.string(), rows: v.union(v.null(), v.array(dailyRow)) },
  handler: async (ctx, { date, rows }) => {
    const old = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.eq("date", date)).collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const row of rows ?? []) {
      await ctx.db.insert("appleSubscriptionDaily", { ...row, date, lineKey: `${date}|${row.appSlug}|${row.subscriptionAppleId}|${row.country}` });
    }
    await markReportDay(ctx, "SUBSCRIPTION", date, rows ? "ok" : "empty", rows?.length ?? 0);
    return rows?.length ?? 0;
  },
});

/** Replace every SUBSCRIPTION_EVENT line that came from one report day. */
export const replaceEventsDay = internalMutation({
  args: { reportDate: v.string(), rows: v.union(v.null(), v.array(eventRow)) },
  handler: async (ctx, { reportDate, rows }) => {
    const old = await ctx.db.query("appleSubscriptionEvents").withIndex("by_report_date", (q) => q.eq("reportDate", reportDate)).collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const row of rows ?? []) {
      const lineKey = [reportDate, row.appSlug, row.date, row.event, row.subscriptionAppleId, row.offerType, row.offerDuration, row.originalStartDate, row.country].join("|");
      await ctx.db.insert("appleSubscriptionEvents", { ...row, reportDate, lineKey });
    }
    await markReportDay(ctx, "SUBSCRIPTION_EVENT", reportDate, rows ? "ok" : "empty", rows?.length ?? 0);
    return rows?.length ?? 0;
  },
});

export const markError = internalMutation({
  args: { reportType: v.string(), date: v.string() },
  handler: async (ctx, { reportType, date }) => {
    // A failed re-fetch never downgrades a day whose data is already stored.
    const current = await ctx.db
      .query("appleReportDays")
      .withIndex("by_type_date", (q) => q.eq("reportType", reportType).eq("date", date))
      .first();
    if (current?.status === "ok") return;
    await markReportDay(ctx, reportType, date, "error", 0);
  },
});

/** Upsert RevenueCat daily values. The action resolves the USD rate of each day (fxRates, else fetched). */
export const upsertRevenuecat = internalMutation({
  args: {
    appSlug: v.string(),
    days: v.array(
      v.object({
        date: v.string(),
        mrrUsd: v.number(),
        activeSubscriptions: v.number(),
        activeTrials: v.number(),
        usdPerEur: v.number(),
        fxDate: v.string(),
        revenue28dUsd: v.optional(v.number()),
        newCustomers28d: v.optional(v.number()),
        activeUsers28d: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { appSlug, days }) => {
    for (const day of days) {
      const existing = await ctx.db
        .query("revenuecatSnapshots")
        .withIndex("by_app_date", (q) => q.eq("appSlug", appSlug).eq("date", day.date))
        .first();
      const doc = {
        appSlug,
        ...day,
        // Keep the overview's 28-day figures when a later charts-only refresh lacks them.
        revenue28dUsd: day.revenue28dUsd ?? existing?.revenue28dUsd,
        newCustomers28d: day.newCustomers28d ?? existing?.newCustomers28d,
        activeUsers28d: day.activeUsers28d ?? existing?.activeUsers28d,
        mrrEur: Math.round((day.mrrUsd / day.usdPerEur) * 100) / 100,
        fetchedAt: Date.now(),
      };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("revenuecatSnapshots", doc);
    }
    return days.length;
  },
});

/** USD rate (1 EUR = x USD) stored in fxRates for each day of a range (days without a stored rate are absent). */
export const usdRates = internalQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    // One indexed point read per day (a range scan reads every currency: ~45 docs/day, too many over a year).
    const out: Record<string, number> = {};
    for (let day = from, n = 0; day <= to && n < 1200; n++) {
      const row = await ctx.db
        .query("fxRates")
        .withIndex("by_date_currency", (q) => q.eq("date", day).eq("currency", "USD"))
        .first();
      if (row) out[day] = row.perEur;
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      day = d.toISOString().slice(0, 10);
    }
    return out;
  },
});

/** Report days already fetched (for the backfill to report progress). */
export const reportDayStatus = internalQuery({
  args: { reportType: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, { reportType, from, to }) => {
    const rows = await ctx.db
      .query("appleReportDays")
      .withIndex("by_type_date", (q) => q.eq("reportType", reportType).gte("date", from).lte("date", to))
      .collect();
    return rows.map((r) => ({ date: r.date, status: r.status, rows: r.rows }));
  },
});
