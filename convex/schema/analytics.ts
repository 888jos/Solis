import { defineTable } from "convex/server";
import { v } from "convex/values";

// Owner: per-app analytics agents (pages "Apps > <app>"). Cached results of live analytics queries
// (Amplitude, PostHog, Supabase, Firestore) keyed by a stable hash of the query + period.
export const analyticsTables = {
  analyticsCache: defineTable({
    key: v.string(),
    appSlug: v.string(),
    payload: v.any(),
    fetchedAt: v.number(),
    error: v.optional(v.string()),
  }).index("by_key", ["key"]),
};
