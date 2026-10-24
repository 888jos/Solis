import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Write side of the Apple SALES pipeline (called by convex/sources/revenue.ts).

export const saleLine = v.object({
  appSlug: v.string(),
  date: v.string(),
  country: v.string(),
  sku: v.string(),
  title: v.string(),
  productTypeId: v.string(),
  isSubscription: v.boolean(),
  isDownload: v.boolean(),
  units: v.number(),
  customerPrice: v.number(),
  customerCurrency: v.string(),
  proceeds: v.number(),
  proceedsCurrency: v.string(),
  grossEur: v.number(),
  exVatEur: v.number(),
  proceedsEur: v.number(),
  lineKey: v.string(),
  parentSku: v.optional(v.string()),
  appleId: v.optional(v.string()),
  subscriptionKind: v.optional(v.string()),
  period: v.optional(v.string()),
  orderType: v.optional(v.string()),
  device: v.optional(v.string()),
  version: v.optional(v.string()),
});

const dayStatus = v.union(v.literal("ok"), v.literal("empty"), v.literal("error"));

/** Status of every SALES report day already fetched in [from, to]. */
export const dayStatuses = internalQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const rows = await ctx.db
      .query("appleReportDays")
      .withIndex("by_type_date", (q) => q.eq("reportType", "SALES").gte("date", from).lte("date", to))
      .collect();
    return rows.map((r) => ({ date: r.date, status: r.status, rows: r.rows }));
  },
});

async function markDay(ctx: any, date: string, status: "ok" | "empty" | "error", rows: number, message?: string) {
  const existing = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q: any) => q.eq("reportType", "SALES").eq("date", date))
    .first();
  const doc = { reportType: "SALES", date, status, rows, fetchedAt: Date.now(), message };
  if (existing) await ctx.db.replace(existing._id, doc);
  else await ctx.db.insert("appleReportDays", doc);
}

/**
 * Store one report day: upsert every line by lineKey, delete lines of that day that are no longer
 * in the report, then mark the day. Called only with a complete, successfully parsed report.
 */
export const writeDay = internalMutation({
  args: { date: v.string(), lines: v.array(saleLine) },
  handler: async (ctx, { date, lines }) => {
    const existing = await ctx.db.query("appleSales").withIndex("by_date", (q) => q.eq("date", date)).collect();
    const byKey = new Map(existing.map((row) => [row.lineKey, row]));
    const keep = new Set<string>();
    for (const line of lines) {
      keep.add(line.lineKey);
      const row = byKey.get(line.lineKey);
      if (row) await ctx.db.replace(row._id, line);
      else await ctx.db.insert("appleSales", line);
    }
    for (const row of existing) if (!keep.has(row.lineKey)) await ctx.db.delete(row._id);
    await markDay(ctx, date, lines.length ? "ok" : "empty", lines.length);
    return lines.length;
  },
});

/** Mark a day without data: "empty" (Apple: no sales that day) or "error" (failed / not available yet). */
export const markReportDay = internalMutation({
  args: { date: v.string(), status: dayStatus, message: v.optional(v.string()) },
  handler: async (ctx, { date, status, message }) => {
    if (status === "error") {
      // A failed re-fetch never downgrades a day that already has its data.
      const current = await ctx.db
        .query("appleReportDays")
        .withIndex("by_type_date", (q) => q.eq("reportType", "SALES").eq("date", date))
        .first();
      if (current?.status === "ok") return;
    }
    if (status === "empty") {
      const existing = await ctx.db.query("appleSales").withIndex("by_date", (q) => q.eq("date", date)).collect();
      for (const row of existing) await ctx.db.delete(row._id);
    }
    await markDay(ctx, date, status, 0, message);
  },
});
