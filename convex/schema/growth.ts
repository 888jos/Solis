import { defineTable } from "convex/server";
import { v } from "convex/values";

export const growthTables = {
  // Owner: ugc agent. Snapshot of the Airtable UGC base (appDXNkfK2prnjyud), read-only.
  // Filled by convex/sources/airtable.ts (REST, needs AIRTABLE_TOKEN) or ugcData:importSnapshot.
  ugcCreators: defineTable({
    airtableId: v.string(),
    name: v.string(),
    handle: v.optional(v.string()),
    platform: v.optional(v.string()),
    status: v.optional(v.string()), // Airtable "Status": Active / Paused / Inactive / Onboarding
    deal: v.optional(v.string()), // legacy free label
    program: v.optional(v.string()), // "CPM campaign" | "Creator Program (fixed)"
    stage: v.optional(v.string()), // Onboarding / Trial / Fixed / CPM / Floor ($4/video) / Paused / Ended
    campaign: v.optional(v.string()), // SideShift campaign
    country: v.optional(v.string()),
    tiktokUrl: v.optional(v.string()),
    startDate: v.optional(v.string()),
    trialStart: v.optional(v.string()),
    fixedStart: v.optional(v.string()),
    fixedMonthlyUsd: v.optional(v.number()), // only when Airtable records the amount ("$300/month")
    createdAt: v.optional(v.number()), // Airtable record creation time
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]),

  ugcVideos: defineTable({
    airtableId: v.string(),
    creatorAirtableId: v.optional(v.string()),
    label: v.optional(v.string()),
    status: v.optional(v.string()), // Selected / Published / Abandoned
    url: v.optional(v.string()),
    platform: v.optional(v.string()),
    postedAt: v.optional(v.string()),
    views: v.number(),
    likes: v.optional(v.number()),
    comments: v.optional(v.number()),
    shares: v.optional(v.number()),
    script: v.optional(v.string()),
    costUsd: v.optional(v.number()), // Airtable "Attributed cost USD" (recorded)
    costSource: v.optional(v.string()),
    statsUpdatedAt: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]),

  ugcPayouts: defineTable({
    airtableId: v.string(),
    creatorAirtableId: v.optional(v.string()),
    month: v.string(), // "YYYY-MM"
    amountUsd: v.number(),
    amountEur: v.number(),
    kind: v.string(), // "cpm" | "fixed" | "bonus" | "contest" | "trial"
    status: v.optional(v.string()), // "paid" | "due"
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]).index("by_month", ["month"]),

  // Outreach rows (no names or messages stored: only dates and labels for the funnel).
  ugcOutreach: defineTable({
    airtableId: v.string(),
    firstContact: v.optional(v.string()),
    label: v.optional(v.string()),
    lastReplyDate: v.optional(v.string()),
    lastMessageBy: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]),

  // Creator applications (no personal data stored).
  ugcApplications: defineTable({
    airtableId: v.string(),
    appliedAt: v.string(), // ISO timestamp
    program: v.optional(v.string()),
    decision: v.optional(v.string()),
    source: v.optional(v.string()),
    creatorAirtableId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_airtable", ["airtableId"]),

  // Owner: aso agent. App Store metadata per app × locale, from App Store Connect (read-only).
  // channel "live" = version on sale, "draft" = newer version being edited (only when it exists).
  asoLocalizations: defineTable({
    appSlug: v.string(),
    locale: v.string(),
    channel: v.optional(v.union(v.literal("live"), v.literal("draft"))),
    versionString: v.optional(v.string()),
    versionState: v.optional(v.string()),
    name: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    keywords: v.optional(v.string()),
    promotionalText: v.optional(v.string()),
    descriptionLength: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_app_locale", ["appSlug", "locale"]),

  asoKeywords: defineTable({
    appSlug: v.string(),
    keyword: v.string(), // lowercase, trimmed
    country: v.string(), // lowercase iTunes storefront, e.g. "us", "fr"
    source: v.optional(v.union(v.literal("metadata"), v.literal("manual"), v.literal("astro"))),
    addedAt: v.optional(v.number()),
    removedAt: v.optional(v.number()), // untracked from the UI; kept so metadata seeding does not bring it back
    // From Astro (scripts/astro_sync.py): Apple Search Ads popularity (5-100), Astro difficulty (0-100),
    // number of apps ranking on the keyword, Astro's last refresh.
    popularity: v.optional(v.number()),
    difficulty: v.optional(v.number()),
    competitors: v.optional(v.number()),
    astroUpdatedAt: v.optional(v.number()),
    // Denormalized latest measure (any source), so the keyword list never scans the history.
    lastRank: v.optional(v.union(v.number(), v.null())),
    lastRankDate: v.optional(v.string()),
    lastRankSource: v.optional(v.string()),
    prevRank: v.optional(v.union(v.number(), v.null())), // latest measure at least 7 days before lastRankDate
    prevRankDate: v.optional(v.string()),
    itunesDate: v.optional(v.string()), // last day the server tracker measured it (App Store search, iTunes fallback)
    statsSource: v.optional(v.string()), // "solis" (computed from App Store search + suggestions) or "astro" (imported)
    statsUpdatedAt: v.optional(v.number()),
  })
    .index("by_app", ["appSlug"])
    .index("by_app_keyword_country", ["appSlug", "keyword", "country"]),

  // One snapshot per keyword × country × day, from the public iTunes Search API (top 200 results).
  asoRankings: defineTable({
    appSlug: v.string(),
    keyword: v.string(),
    country: v.string(),
    date: v.string(),
    rank: v.union(v.number(), v.null()), // null = not ranked (iTunes: not in top 200; Astro: not in its depth)
    topCompetitor: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    // "astro" = real App Store search results measured by Astro on the Mac; "itunes" (or absent) = public
    // iTunes Search API. One row per day: an Astro measure replaces an iTunes one, never the reverse.
    // "appstore" = real App Store search order (server, daily); "astro" = imported from Astro; "itunes" (or
    // absent) = public iTunes Search API. One row per day; priority appstore > astro > itunes.
    source: v.optional(v.union(v.literal("itunes"), v.literal("astro"), v.literal("appstore"))),
  }).index("by_app_keyword_date", ["appSlug", "keyword", "country", "date"]).index("by_date", ["date"]),
};
