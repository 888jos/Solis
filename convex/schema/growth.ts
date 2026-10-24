import { defineTable } from "convex/server";
import { v } from "convex/values";

export const growthTables = {
  // Owner: ugc agent. Snapshot of the Airtable UGC base (appDXNkfK2prnjyud).
  ugcCreators: defineTable({
    airtableId: v.string(),
    name: v.string(),
    handle: v.optional(v.string()),
    platform: v.optional(v.string()),
    status: v.optional(v.string()),
    deal: v.optional(v.string()), // "CPM", "Daily $500", "Weekly $300", "Trial"...
    country: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]),

  ugcVideos: defineTable({
    airtableId: v.string(),
    creatorAirtableId: v.optional(v.string()),
    url: v.optional(v.string()),
    platform: v.optional(v.string()),
    postedAt: v.optional(v.string()),
    views: v.number(),
    likes: v.optional(v.number()),
    script: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]),

  ugcPayouts: defineTable({
    airtableId: v.string(),
    creatorAirtableId: v.optional(v.string()),
    month: v.string(), // "YYYY-MM"
    amountUsd: v.number(),
    amountEur: v.number(),
    kind: v.string(), // "cpm" | "fixed" | "bonus" | "contest" | "trial"
    status: v.optional(v.string()), // "paid" | "due" | "estimated"
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]).index("by_month", ["month"]),

  // Owner: aso agent.
  asoLocalizations: defineTable({
    appSlug: v.string(),
    locale: v.string(),
    versionString: v.optional(v.string()),
    name: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    keywords: v.optional(v.string()),
    promotionalText: v.optional(v.string()),
    descriptionLength: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_app_locale", ["appSlug", "locale"]),

  asoKeywords: defineTable({
    appSlug: v.string(),
    keyword: v.string(),
    country: v.string(), // lowercase iTunes storefront, e.g. "us", "fr"
  }).index("by_app", ["appSlug"]),

  asoRankings: defineTable({
    appSlug: v.string(),
    keyword: v.string(),
    country: v.string(),
    date: v.string(),
    rank: v.union(v.number(), v.null()), // null = not in top 200
    topCompetitor: v.optional(v.string()),
  }).index("by_app_keyword_date", ["appSlug", "keyword", "country", "date"]).index("by_date", ["date"]),
};
