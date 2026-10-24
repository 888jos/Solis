import { defineTable } from "convex/server";
import { v } from "convex/values";

export const productTables = {
  // Owner: engagement agent. Amplitude (CortiFree), PostHog (Quest IRL), other sources when available.
  engagementDaily: defineTable({
    appSlug: v.string(),
    date: v.string(),
    source: v.string(), // "amplitude" | "posthog" | ...
    activeUsers: v.number(),
    newUsers: v.number(),
    sessions: v.optional(v.number()),
  }).index("by_app_date", ["appSlug", "date"]).index("by_date", ["date"]),

  retentionCohorts: defineTable({
    appSlug: v.string(),
    source: v.string(),
    cohortStart: v.string(), // week start of the cohort
    cohortSize: v.number(),
    d1: v.optional(v.number()), // share 0..1
    d7: v.optional(v.number()),
    d30: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_app_cohort", ["appSlug", "cohortStart"]),

  // Owner: reviews agent.
  appReviews: defineTable({
    appSlug: v.string(),
    reviewId: v.string(),
    rating: v.number(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    nickname: v.optional(v.string()),
    territory: v.string(), // Apple 3-letter territory
    createdAt: v.string(), // ISO datetime
    hasResponse: v.boolean(),
  }).index("by_review", ["reviewId"]).index("by_app_created", ["appSlug", "createdAt"]),

  appRatings: defineTable({
    appSlug: v.string(),
    country: v.string(), // lowercase storefront
    date: v.string(),
    averageRating: v.union(v.number(), v.null()),
    ratingCount: v.number(),
  }).index("by_app_country_date", ["appSlug", "country", "date"]).index("by_date", ["date"]),

  // Owner: versions agent.
  appVersions: defineTable({
    appSlug: v.string(),
    versionId: v.string(),
    versionString: v.string(),
    state: v.string(), // App Store version state, e.g. READY_FOR_SALE, IN_REVIEW
    createdDate: v.optional(v.string()),
    releaseType: v.optional(v.string()),
    earliestReleaseDate: v.optional(v.string()),
    buildNumber: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_version", ["versionId"]).index("by_app", ["appSlug"]),

  appBuilds: defineTable({
    appSlug: v.string(),
    buildId: v.string(),
    version: v.string(),
    uploadedDate: v.string(),
    processingState: v.string(),
    expired: v.boolean(),
    fetchedAt: v.number(),
  }).index("by_build", ["buildId"]).index("by_app_uploaded", ["appSlug", "uploadedDate"]),
};
