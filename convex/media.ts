import { v } from "convex/values";
import { authQuery, carouselSyncMutation, carouselSyncQuery } from "./lib/auth";

// Vidéos page (src/features/videos): the generated images and clips used to make the videos.
// - authQuery: the page.
// - carouselSync*: the Mac (scripts/solis_projects_sync.py in the Carousel Factory), with CAROUSEL_SYNC_TOKEN,
//   the same machine token as `cf sync` (it only opens Mac sync functions, never the rest of Solis).

const SOURCE = "media_sync";

export const library = authQuery({
  args: { project: v.string() },
  handler: async (ctx, { project }) => {
    const rows = await ctx.db
      .query("mediaAssets")
      .withIndex("by_project", (q) => q.eq("project", project))
      .collect();
    const items = await Promise.all(
      rows.map(async (r) => ({
        key: r.key,
        kind: r.kind,
        category: r.category,
        group: r.group,
        title: r.title,
        order: r.order,
        chosen: r.chosen ?? false,
        source: r.source,
        width: r.width,
        height: r.height,
        bytes: r.bytes,
        fileAt: r.fileAt,
        url: await ctx.storage.getUrl(r.storageId),
        thumb: r.thumbId ? await ctx.storage.getUrl(r.thumbId) : null,
      })),
    );
    const run = await ctx.db
      .query("syncRuns")
      .withIndex("by_source_started", (q) => q.eq("source", SOURCE))
      .order("desc")
      .first();
    const projects = new Set<string>();
    for (const r of await ctx.db.query("mediaAssets").take(2000)) projects.add(r.project);
    return { items, projects: [...projects].sort(), syncedAt: run?.finishedAt ?? null };
  },
});

// ---------- Mac sync ----------

export const hashes = carouselSyncQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("mediaAssets").collect();
    return rows.map((r) => ({ key: r.key, hash: r.hash }));
  },
});

export const generateUploadUrl = carouselSyncMutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

const meta = {
  key: v.string(),
  project: v.string(),
  kind: v.union(v.literal("image"), v.literal("video")),
  category: v.string(),
  group: v.string(),
  title: v.string(),
  order: v.number(),
  chosen: v.optional(v.boolean()),
  source: v.string(),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
  hash: v.string(),
  fileAt: v.number(),
};

/** Insert or replace one asset. Files are optional: metadata-only updates keep the stored files. */
export const upsert = carouselSyncMutation({
  args: { ...meta, storageId: v.optional(v.id("_storage")), thumbId: v.optional(v.id("_storage")) },
  handler: async (ctx, { storageId, thumbId, ...m }) => {
    const prev = await ctx.db
      .query("mediaAssets")
      .withIndex("by_key", (q) => q.eq("key", m.key))
      .unique();
    const now = Date.now();
    if (prev) {
      if (storageId && storageId !== prev.storageId) await ctx.storage.delete(prev.storageId);
      if (thumbId && prev.thumbId && thumbId !== prev.thumbId) await ctx.storage.delete(prev.thumbId);
      await ctx.db.patch(prev._id, { ...m, storageId: storageId ?? prev.storageId, thumbId: thumbId ?? prev.thumbId, syncedAt: now });
      return prev._id;
    }
    if (!storageId) throw new Error(`New asset ${m.key} needs a file`);
    return ctx.db.insert("mediaAssets", { ...m, storageId, thumbId, syncedAt: now });
  },
});

/** Remove the assets whose key is not in `keep` (files deleted or renamed on the Mac). */
export const prune = carouselSyncMutation({
  args: { keep: v.array(v.string()) },
  handler: async (ctx, { keep }) => {
    const set = new Set(keep);
    let removed = 0;
    for (const r of await ctx.db.query("mediaAssets").collect()) {
      if (set.has(r.key)) continue;
      await ctx.storage.delete(r.storageId);
      if (r.thumbId) await ctx.storage.delete(r.thumbId);
      await ctx.db.delete(r._id);
      removed++;
    }
    return removed;
  },
});

export const recordSync = carouselSyncMutation({
  args: { status: v.union(v.literal("ok"), v.literal("error")), startedAt: v.number(), rows: v.number(), message: v.optional(v.string()) },
  handler: (ctx, { status, startedAt, rows, message }) =>
    ctx.db.insert("syncRuns", { source: SOURCE, status, startedAt, finishedAt: Date.now(), rows, message }),
});
