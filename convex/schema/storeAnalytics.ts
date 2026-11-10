import { defineTable } from "convex/server";
import { v } from "convex/values";

// App Store Analytics Reports (convex/sources/ascAnalytics.ts): store funnel per app, day and source
// type. One row per (report instance, app, day, source): Apple delivers data in instances that may
// add late events for past days, so rows are summed at read time and an instance re-read replaces
// its own rows only.
export const storeAnalyticsTables = {
  storeFunnelDaily: defineTable({
    instanceId: v.string(),
    requestKind: v.optional(v.union(v.literal("ongoing"), v.literal("snapshot"))), // a day with ongoing rows ignores snapshot rows
    appSlug: v.string(),
    day: v.string(),
    sourceType: v.string(), // "App Store search", "App Store browse", "App referrer", "Web referrer", ...
    impressions: v.number(),
    uniqueImpressions: v.number(),
    pageViews: v.number(), // product page views
    uniquePageViews: v.number(),
    firstDownloads: v.number(),
    redownloads: v.number(),
    syncedAt: v.number(),
  })
    .index("by_instance", ["instanceId"])
    .index("by_day", ["day"]),

  // Report instances already read (instance ids are immutable once Apple has delivered them).
  storeReportInstances: defineTable({
    instanceId: v.string(),
    report: v.string(),
    appSlug: v.string(),
    processingDate: v.string(),
    rows: v.number(),
    readAt: v.number(),
  }).index("by_instance", ["instanceId"]),
};
