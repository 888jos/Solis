import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authMutation } from "./lib/auth";

// Writes for the Performance page (convex/sources/postforme.ts) and the account → project assignment.

/** Otto's 8 personas (CLAUDE.md, 2026-11-08): new accounts with these handles start assigned to Otto. */
const OTTO_HANDLES = new Set(["lola.okii", "ines.oki", "manon.okii", "chloe.okii", "leaa.oki", "camille.okii", "maelys.oki", "yasmine.oki"]);
export const PROJECTS = ["otto", "cortifree", "questirl"] as const;

export const upsertAccount = internalMutation({
  args: { pfmId: v.string(), platform: v.string(), username: v.string(), avatarUrl: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, a) => {
    // The seed from Otto's videos used placeholder accounts: the real Post for Me account replaces them.
    const seedId = `seed:${a.platform}:${a.username.toLowerCase()}`;
    const seed = await ctx.db.query("socialAccounts").withIndex("by_pfm", (q) => q.eq("pfmId", seedId)).first();
    const seedProject = seed?.project;
    if (seed) {
      for (const d of await ctx.db.query("socialDaily").withIndex("by_account_day", (q) => q.eq("pfmAccountId", seedId)).collect()) await ctx.db.patch(d._id, { pfmAccountId: a.pfmId });
      await ctx.db.delete(seed._id);
    }
    const existing = await ctx.db.query("socialAccounts").withIndex("by_pfm", (q) => q.eq("pfmId", a.pfmId)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...a, syncedAt: Date.now() });
      return;
    }
    await ctx.db.insert("socialAccounts", { ...a, project: seedProject ?? (OTTO_HANDLES.has(a.username.toLowerCase()) ? "otto" : undefined), syncedAt: Date.now() });
  },
});

/**
 * One-off seed: Otto's videos already in Solis (ottoVideos, read from Post for Me on the Mac) become
 * social posts of placeholder accounts, so the page has the history before the server sync runs.
 * Idempotent; the server sync later updates the same posts by id and replaces the placeholder accounts.
 */
export const seedFromOtto = internalMutation({
  args: {},
  handler: async (ctx) => {
    const videos = await ctx.db.query("ottoVideos").collect();
    const now = Date.now();
    let created = 0;
    for (const vid of videos) {
      const platform = vid.platform.toLowerCase();
      const username = vid.account.replace(/^@/, "");
      const pfmId = `seed:${platform}:${username.toLowerCase()}`;
      if (!(await ctx.db.query("socialAccounts").withIndex("by_pfm", (q) => q.eq("pfmId", pfmId)).first())) {
        await ctx.db.insert("socialAccounts", { pfmId, platform, username, project: "otto", syncedAt: now });
      }
      const existing = await ctx.db.query("socialPosts").withIndex("by_post", (q) => q.eq("postId", vid.postId)).first();
      if (existing) continue;
      await ctx.db.insert("socialPosts", {
        postId: vid.postId,
        pfmAccountId: pfmId,
        platform,
        account: username,
        project: "otto",
        url: vid.url || undefined,
        caption: vid.caption || undefined,
        postedAt: vid.postedAt,
        views: vid.views,
        likes: vid.likes,
        comments: vid.comments,
        shares: vid.shares,
        firstSeenAt: now,
        syncedAt: vid.syncedAt,
      });
      created++;
    }
    return { videos: videos.length, created };
  },
});

const postRow = v.object({
  postId: v.string(),
  platform: v.string(),
  account: v.string(),
  url: v.optional(v.string()),
  caption: v.optional(v.string()),
  postedAt: v.number(),
  thumbnailUrl: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  views: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
  saves: v.optional(v.number()),
});

/** A post first seen more than this after publication: its views so far are a baseline, not a gain of the day. */
const BASELINE_AFTER_MS = 3 * 86400000;

/**
 * Latest metrics per post, today's end-of-day snapshot, and the account's gains of the day: each sync adds
 * (new total − total already counted today), so several syncs a day never double count.
 */
export const upsertPosts = internalMutation({
  args: { pfmAccountId: v.string(), day: v.string(), rows: v.array(postRow) },
  handler: async (ctx, { pfmAccountId, day, rows }) => {
    const account = await ctx.db.query("socialAccounts").withIndex("by_pfm", (q) => q.eq("pfmId", pfmAccountId)).first();
    const project = account?.project;
    const now = Date.now();
    const gain = { views: 0, likes: 0, comments: 0, shares: 0 };
    let platform = rows[0]?.platform ?? account?.platform ?? "";
    let handle = rows[0]?.account ?? account?.username ?? "";
    for (const r of rows) {
      platform = r.platform;
      handle = r.account;
      const existing = await ctx.db.query("socialPosts").withIndex("by_post", (q) => q.eq("postId", r.postId)).first();
      // Metrics never go down between two reads (platforms sometimes return a stale count): keep the max.
      const views = Math.max(r.views, existing?.views ?? 0);
      const likes = Math.max(r.likes, existing?.likes ?? 0);
      const comments = Math.max(r.comments, existing?.comments ?? 0);
      const shares = Math.max(r.shares, existing?.shares ?? 0);
      const doc = { ...r, views, likes, comments, shares, pfmAccountId, project, syncedAt: now };
      if (existing) await ctx.db.patch(existing._id, doc);
      else await ctx.db.insert("socialPosts", { ...doc, firstSeenAt: now });

      // What was already counted for this post today (or the previous day's total, or a baseline).
      const snap = await ctx.db.query("socialPostDaily").withIndex("by_post_day", (q) => q.eq("postId", r.postId).eq("day", day)).first();
      let counted = snap;
      if (!counted) {
        const prev = await ctx.db.query("socialPostDaily").withIndex("by_post_day", (q) => q.eq("postId", r.postId).lt("day", day)).order("desc").first();
        // No earlier snapshot and published more than 3 days ago (seeded or first read): its views so far
        // are history, not a gain of today.
        const isBaseline = !prev && now - r.postedAt > BASELINE_AFTER_MS;
        counted = prev ?? (isBaseline ? ({ views, likes, comments, shares } as any) : ({ views: 0, likes: 0, comments: 0, shares: 0 } as any));
      }
      gain.views += Math.max(0, views - counted!.views);
      gain.likes += Math.max(0, likes - counted!.likes);
      gain.comments += Math.max(0, comments - counted!.comments);
      gain.shares += Math.max(0, shares - counted!.shares);

      const daily = { postId: r.postId, day, project, platform: r.platform, account: r.account, views, likes, comments, shares };
      if (snap) await ctx.db.patch(snap._id, daily);
      else await ctx.db.insert("socialPostDaily", daily);
    }
    if (!rows.length) return;
    const agg = await ctx.db.query("socialDaily").withIndex("by_account_day", (q) => q.eq("pfmAccountId", pfmAccountId).eq("day", day)).first();
    if (agg) {
      await ctx.db.patch(agg._id, { project, views: agg.views + gain.views, likes: agg.likes + gain.likes, comments: agg.comments + gain.comments, shares: agg.shares + gain.shares });
    } else {
      await ctx.db.insert("socialDaily", { day, pfmAccountId, project, platform, account: handle, ...gain });
    }
  },
});

/** Assigns an account (and all its posts and snapshots) to a project from the page. */
export const setAccountProject = authMutation({
  args: { id: v.id("socialAccounts"), project: v.union(v.literal("otto"), v.literal("cortifree"), v.literal("questirl"), v.null()) },
  handler: async (ctx, { id, project }) => {
    const account = await ctx.db.get(id);
    if (!account) throw new Error("Compte introuvable");
    const p = project ?? undefined;
    await ctx.db.patch(id, { project: p });
    const posts = (await ctx.db.query("socialPosts").collect()).filter((x) => x.pfmAccountId === account.pfmId);
    for (const post of posts) {
      await ctx.db.patch(post._id, { project: p });
      for (const s of await ctx.db.query("socialPostDaily").withIndex("by_post_day", (q) => q.eq("postId", post.postId)).collect()) await ctx.db.patch(s._id, { project: p });
    }
    for (const d of await ctx.db.query("socialDaily").withIndex("by_account_day", (q) => q.eq("pfmAccountId", account.pfmId)).collect()) await ctx.db.patch(d._id, { project: p });
  },
});
