import { defineTable } from "convex/server";
import { v } from "convex/values";

// Owner: projects agent. Things Solis pilots beyond the App Store apps, all pushed from Jos's Mac
// (`python3 scripts/solis_projects_sync.py` in ~/app/carousel-factory, CAROUSEL_SYNC_TOKEN):
// - mediaAssets: the Vidéos page, i.e. the generated images and clips used to make the videos
//   (Quest IRL: Fish Audio / Nano Banana images, Kling clips). The Mac stays the source of truth.
// - otto*: ottoknows.it (website, not an app), read from its Convex prod with the Convex CLI on the Mac
//   (aggregates only: no conversation, no email, no user id ever leaves the Mac).
export const projectTables = {
  mediaAssets: defineTable({
    key: v.string(), // path relative to the factory's content/heroes (stable id)
    project: v.string(), // questirl | otto | cortifree
    kind: v.union(v.literal("image"), v.literal("video")),
    category: v.string(), // e.g. heroes, faces, sets, storyboard, clips
    group: v.string(), // storyboard id for category "storyboard", "" otherwise
    title: v.string(),
    order: v.number(),
    chosen: v.optional(v.boolean()), // storyboard: the take kept for the edit
    source: v.string(), // fish_audio | kling
    storageId: v.id("_storage"), // web version (image: max 1600 px JPEG; video: the mp4 itself)
    thumbId: v.optional(v.id("_storage")), // 480 px JPEG (images only)
    width: v.number(),
    height: v.number(),
    bytes: v.number(), // size of the original file on the Mac
    hash: v.string(), // sha1 of the original file, so unchanged files are never uploaded twice
    fileAt: v.number(), // mtime of the original file
    syncedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_project", ["project"]),

  ottoDaily: defineTable({
    day: v.string(), // YYYY-MM-DD (Paris day, as Otto stores it)
    reports: v.number(),
    paid: v.number(),
    revenueCents: v.number(), // EUR
    aiCostMicroUsd: v.number(),
    syncedAt: v.number(),
  }).index("by_day", ["day"]),

  ottoVideos: defineTable({
    postId: v.string(),
    platform: v.string(), // tiktok | instagram
    account: v.string(), // handle without @
    url: v.string(),
    caption: v.string(),
    postedAt: v.number(),
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    shares: v.number(),
    syncedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_posted", ["postedAt"]),

  // One row: the latest snapshot of the Mac-side pipeline (video validation queue, accounts, offers).
  ottoSnapshot: defineTable({
    accounts: v.array(v.object({ key: v.string(), name: v.string(), tiktok: v.string(), order: v.number() })),
    validation: v.array(v.object({ account: v.string(), status: v.string(), count: v.number() })),
    offers: v.array(v.object({ offer: v.string(), sales: v.number(), refunded: v.number(), eurCents: v.number() })),
    syncedAt: v.number(),
  }),
};
