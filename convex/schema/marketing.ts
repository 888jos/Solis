import { defineTable } from "convex/server";
import { v } from "convex/values";

// Marketing performance (page Performance): every social account connected to Post for Me, every post
// with its latest metrics, and one snapshot per post per day so "views gained per day" is exact.
// Filled by convex/sources/postforme.ts (server-side, POSTFORME_API_KEY on Convex).
export const marketingTables = {
  socialAccounts: defineTable({
    pfmId: v.string(), // Post for Me social account id
    platform: v.string(), // tiktok | instagram | facebook | youtube | x | ...
    username: v.string(), // handle, without @
    displayName: v.optional(v.string()), // what Post for Me calls the account (TikTok: the display name)
    project: v.optional(v.string()), // otto | cortifree | questirl ; unset = to assign on the page
    avatarUrl: v.optional(v.string()),
    status: v.optional(v.string()),
    syncedAt: v.number(),
  }).index("by_pfm", ["pfmId"]),

  socialPosts: defineTable({
    postId: v.string(), // platform post id
    pfmAccountId: v.string(),
    platform: v.string(),
    account: v.string(),
    project: v.optional(v.string()),
    url: v.optional(v.string()),
    caption: v.optional(v.string()),
    postedAt: v.number(),
    thumbnailUrl: v.optional(v.string()),
    mediaUrl: v.optional(v.string()), // may expire: the page prefers the platform embed
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    shares: v.number(),
    saves: v.optional(v.number()),
    firstSeenAt: v.number(),
    syncedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_posted", ["postedAt"])
    .index("by_project_posted", ["project", "postedAt"]),

  // End-of-day totals per post (last sync of the day wins). Views gained on a day = today − yesterday.
  socialPostDaily: defineTable({
    postId: v.string(),
    day: v.string(), // Paris day
    project: v.optional(v.string()),
    platform: v.string(),
    account: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    shares: v.number(),
  })
    .index("by_post_day", ["postId", "day"])
    .index("by_day", ["day"]),

  // Gains per account per day (views, likes, comments, shares won that day), maintained by every sync:
  // the page reads these small rows, never the per-post history.
  socialDaily: defineTable({
    day: v.string(),
    pfmAccountId: v.string(),
    project: v.optional(v.string()),
    platform: v.string(),
    account: v.string(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    shares: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_account_day", ["pfmAccountId", "day"]),
};
