import { defineTable } from "convex/server";
import { v } from "convex/values";

// Owner: system/sources agent. Every sync writes one syncRuns row (see convex/syncRuns.ts).
export const coreTables = {
  syncRuns: defineTable({
    source: v.string(), // e.g. "asc_sales", "revenuecat", "amplitude", "posthog", "asc_reviews"
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("error"), v.literal("skipped")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    rows: v.optional(v.number()),
    message: v.optional(v.string()),
  }).index("by_source_started", ["source", "startedAt"]),

  // Daily FX: 1 EUR = rate units of currency (source: fawazahmed0 currency-api, ECB-like daily rates).
  fxRates: defineTable({
    date: v.string(),
    currency: v.string(),
    perEur: v.number(),
  }).index("by_date_currency", ["date", "currency"]),

  briefs: defineTable({
    date: v.string(),
    kind: v.union(v.literal("daily"), v.literal("weekly")),
    text: v.string(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_date", ["date"]),
};
