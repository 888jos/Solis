import { v } from "convex/values";
import { authMutation, authQuery } from "./lib/auth";

// Vidéos page > Scripts (src/features/videos): the scripts as edited in Solis.
// Rows override the built-in scripts of src/features/videos/scripts.ts by scriptId; see convex/schema/projects.ts.

const shot = v.object({
  time: v.string(),
  plan: v.string(),
  image: v.union(v.string(), v.null()),
  imageNote: v.optional(v.string()),
  who: v.string(),
  speaker: v.union(v.literal("lipsync"), v.literal("voiceover"), v.literal("none")),
  line: v.string(),
  sound: v.string(),
  promo: v.optional(v.boolean()),
});

const script = v.object({
  id: v.string(),
  hero: v.string(),
  title: v.string(),
  duration: v.string(),
  hooks: v.array(v.string()),
  caption: v.string(),
  shots: v.array(shot),
  missing: v.object({ fish: v.array(v.string()), captures: v.array(v.string()), montage: v.array(v.string()) }),
  note: v.optional(v.string()),
});

export const list = authQuery({
  args: { project: v.string() },
  handler: async (ctx, { project }) => {
    const rows = await ctx.db
      .query("videoScripts")
      .withIndex("by_project", (q) => q.eq("project", project))
      .collect();
    return rows.map((r) => ({ scriptId: r.scriptId, order: r.order, deleted: r.deleted ?? false, data: r.data ?? null, updatedAt: r.updatedAt }));
  },
});

async function rowOf(ctx: { db: any }, scriptId: string) {
  return await ctx.db
    .query("videoScripts")
    .withIndex("by_script", (q: any) => q.eq("scriptId", scriptId))
    .first();
}

/** Create or replace one script. */
export const save = authMutation({
  args: { project: v.string(), order: v.number(), script },
  handler: async (ctx, { project, order, script }) => {
    const row = await rowOf(ctx, script.id);
    const doc = { scriptId: script.id, project, order, deleted: false, data: script, updatedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("videoScripts", doc);
  },
});

/** Hide a script (builtIn: keep a tombstone so the built-in version stays hidden) or drop the edits (reset). */
export const remove = authMutation({
  args: { project: v.string(), scriptId: v.string(), mode: v.union(v.literal("delete"), v.literal("reset")), builtIn: v.boolean() },
  handler: async (ctx, { project, scriptId, mode, builtIn }) => {
    const row = await rowOf(ctx, scriptId);
    if (mode === "reset" || !builtIn) {
      if (row) await ctx.db.delete(row._id);
      return;
    }
    const doc = { scriptId, project, order: row?.order ?? 0, deleted: true, updatedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("videoScripts", doc);
  },
});
