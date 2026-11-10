import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { APPS } from "./lib/apps";
import { authQuery } from "./lib/auth";

// Store funnel model (App Store Analytics Reports): writes from convex/sources/ascAnalytics.ts and the
// "Fiche App Store" funnel of the Acquisition page.

export const instanceRead = internalQuery({
  args: { instanceId: v.string() },
  handler: async (ctx, { instanceId }) => (await ctx.db.query("storeReportInstances").withIndex("by_instance", (q) => q.eq("instanceId", instanceId)).first()) != null,
});

const aggRow = v.object({
  appSlug: v.string(),
  day: v.string(),
  sourceType: v.string(),
  impressions: v.number(),
  uniqueImpressions: v.number(),
  pageViews: v.number(),
  uniquePageViews: v.number(),
  firstDownloads: v.number(),
  redownloads: v.number(),
});

export const hasApp = internalQuery({
  args: { appSlug: v.string() },
  handler: async (ctx, { appSlug }) => (await ctx.db.query("storeReportInstances").filter((q) => q.eq(q.field("appSlug"), appSlug)).first()) != null,
});

export const writeInstance = internalMutation({
  args: { instanceId: v.string(), requestKind: v.union(v.literal("ongoing"), v.literal("snapshot")), report: v.string(), appSlug: v.string(), processingDate: v.string(), rows: v.array(aggRow) },
  handler: async (ctx, { instanceId, requestKind, report, appSlug, processingDate, rows }) => {
    for (const old of await ctx.db.query("storeFunnelDaily").withIndex("by_instance", (q) => q.eq("instanceId", instanceId)).collect()) await ctx.db.delete(old._id);
    const now = Date.now();
    for (const r of rows) await ctx.db.insert("storeFunnelDaily", { ...r, instanceId, requestKind, syncedAt: now });
    const prev = await ctx.db.query("storeReportInstances").withIndex("by_instance", (q) => q.eq("instanceId", instanceId)).first();
    if (prev) await ctx.db.patch(prev._id, { rows: rows.length, readAt: now });
    else await ctx.db.insert("storeReportInstances", { instanceId, report, appSlug, processingDate, rows: rows.length, readAt: now });
  },
});

type Totals = { impressions: number; uniqueImpressions: number; pageViews: number; uniquePageViews: number; firstDownloads: number };
const zero = (): Totals => ({ impressions: 0, uniqueImpressions: 0, pageViews: 0, uniquePageViews: 0, firstDownloads: 0 });

/** Impressions → product page views → first downloads over [from, to], by app and by source type. */
export const funnel = authQuery({
  args: { from: v.string(), to: v.string(), prevFrom: v.string(), prevTo: v.string(), app: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { from, to, prevFrom, prevTo, app }) => {
    const all = (await ctx.db.query("storeFunnelDaily").withIndex("by_day", (q) => q.gte("day", prevFrom).lte("day", to)).collect()).filter((r) => !app || r.appSlug === app);
    // A day covered by the ongoing request ignores the history snapshot for the same app (no double count).
    const ongoingDays = new Set(all.filter((r) => r.requestKind !== "snapshot").map((r) => `${r.appSlug}|${r.day}`));
    const rows = all.filter((r) => r.requestKind !== "snapshot" || !ongoingDays.has(`${r.appSlug}|${r.day}`));
    const any = rows.length > 0 || (await ctx.db.query("storeFunnelDaily").first()) != null;
    const cur = zero();
    const prev = zero();
    const bySource = new Map<string, Totals>();
    const byApp = new Map<string, Totals>();
    let lastDay: string | null = null;
    const add = (t: Totals, r: Totals) => {
      t.impressions += r.impressions;
      t.uniqueImpressions += r.uniqueImpressions;
      t.pageViews += r.pageViews;
      t.uniquePageViews += r.uniquePageViews;
      t.firstDownloads += r.firstDownloads;
    };
    for (const r of rows) {
      if (r.day >= from && r.day <= to) {
        add(cur, r);
        if (!bySource.has(r.sourceType)) bySource.set(r.sourceType, zero());
        add(bySource.get(r.sourceType)!, r);
        if (!byApp.has(r.appSlug)) byApp.set(r.appSlug, zero());
        add(byApp.get(r.appSlug)!, r);
        if (!lastDay || r.day > lastDay) lastDay = r.day;
      } else if (r.day >= prevFrom && r.day <= prevTo) add(prev, r);
    }
    const last = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", "asc_analytics")).order("desc").first();
    const order = new Map(APPS.map((a, i) => [a.slug as string, i]));
    return {
      connected: any,
      current: cur,
      previous: prev,
      lastDay,
      sources: [...bySource].map(([sourceType, t]) => ({ sourceType, ...t })).sort((a, b) => b.impressions - a.impressions),
      apps: [...byApp].map(([appSlug, t]) => ({ appSlug, ...t })).sort((a, b) => (order.get(a.appSlug) ?? 9) - (order.get(b.appSlug) ?? 9)),
      lastRun: last ? { status: last.status, message: last.message ?? null, at: last.finishedAt ?? last.startedAt } : null,
    };
  },
});
