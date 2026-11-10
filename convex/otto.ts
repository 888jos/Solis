import { v } from "convex/values";
import { authQuery, carouselSyncMutation } from "./lib/auth";

// Projets > Otto (src/features/project-otto): ottoknows.it, read on the Mac from Otto's Convex prod
// (oceanic-schnauzer-911) by scripts/solis_projects_sync.py and pushed here with CAROUSEL_SYNC_TOKEN.
// Only aggregates and public post stats: no conversation, no email, no user id.

const SOURCE = "otto_sync";
const DAY = 86_400_000;

function parisDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

type Totals = { reports: number; paid: number; revenueCents: number; aiCostMicroUsd: number };
const zero = (): Totals => ({ reports: 0, paid: 0, revenueCents: 0, aiCostMicroUsd: 0 });

export const summary = authQuery({
  // days: 7 | 30 | 90; 0 = since the first day Otto recorded.
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const now = Date.now();
    const daily = (await ctx.db.query("ottoDaily").withIndex("by_day").collect()).sort((a, b) => a.day.localeCompare(b.day));
    const today = parisDay(now);
    const first = daily[0]?.day ?? today;
    const span = days > 0 ? Math.min(days, 365) : Math.max(1, Math.round((Date.parse(today) - Date.parse(first)) / DAY) + 1);
    const x = Array.from({ length: span }, (_, i) => parisDay(now - (span - 1 - i) * DAY));
    const prevX = new Set(Array.from({ length: span }, (_, i) => parisDay(now - (2 * span - 1 - i) * DAY)));
    const inWindow = new Set(x);
    const byDay = new Map(daily.map((d) => [d.day, d]));

    const cur = zero();
    const prev = zero();
    for (const d of daily) {
      const t = inWindow.has(d.day) ? cur : prevX.has(d.day) ? prev : null;
      if (!t) continue;
      t.reports += d.reports;
      t.paid += d.paid;
      t.revenueCents += d.revenueCents;
      t.aiCostMicroUsd += d.aiCostMicroUsd;
    }
    const series = {
      reports: x.map((day) => byDay.get(day)?.reports ?? 0),
      paid: x.map((day) => byDay.get(day)?.paid ?? 0),
      revenueCents: x.map((day) => byDay.get(day)?.revenueCents ?? 0),
      aiCostMicroUsd: x.map((day) => byDay.get(day)?.aiCostMicroUsd ?? 0),
    };

    // Videos posted in the window (all time when days = 0). Views are the latest reading.
    const since = days > 0 ? now - days * DAY : 0;
    const videos = (await ctx.db.query("ottoVideos").withIndex("by_posted", (q) => q.gte("postedAt", since)).collect()).sort(
      (a, b) => b.views - a.views,
    );
    const byAccount = new Map<string, typeof videos>();
    for (const vid of videos) byAccount.set(vid.account, [...(byAccount.get(vid.account) ?? []), vid]);
    const snapshot = await ctx.db.query("ottoSnapshot").first();
    const order = new Map((snapshot?.accounts ?? []).map((a) => [a.tiktok, a.order]));
    const accounts = [...byAccount.entries()]
      .map(([account, list]) => ({
        account,
        posts: list.length,
        views: list.reduce((s, x) => s + x.views, 0),
        medianViews: median(list.map((x) => x.views)),
        likes: list.reduce((s, x) => s + x.likes, 0),
        comments: list.reduce((s, x) => s + x.comments, 0),
        shares: list.reduce((s, x) => s + x.shares, 0),
        platforms: [...new Set(list.map((x) => x.platform))].sort(),
      }))
      .sort((a, b) => (order.get(a.account) ?? 99) - (order.get(b.account) ?? 99) || b.views - a.views);
    const top = videos.slice(0, 15).map((x) => ({
      postId: x.postId,
      platform: x.platform,
      account: x.account,
      url: x.url,
      caption: x.caption,
      postedAt: x.postedAt,
      views: x.views,
      likes: x.likes,
      comments: x.comments,
      shares: x.shares,
    }));
    const videoTotals = {
      posts: videos.length,
      views: videos.reduce((s, x) => s + x.views, 0),
      medianViews: median(videos.map((x) => x.views)),
      likes: videos.reduce((s, x) => s + x.likes, 0),
      comments: videos.reduce((s, x) => s + x.comments, 0),
    };

    const run = await ctx.db
      .query("syncRuns")
      .withIndex("by_source_started", (q) => q.eq("source", SOURCE))
      .order("desc")
      .first();
    // AI costs are billed in USD: shown in EUR at the latest daily rate (one rate for the whole window).
    const fx = await ctx.db
      .query("fxRates")
      .withIndex("by_date_currency")
      .order("desc")
      .filter((q) => q.eq(q.field("currency"), "USD"))
      .first();

    return {
      usdPerEur: fx?.perEur ?? null,
      connected: daily.length > 0 || videos.length > 0 || !!snapshot,
      x,
      current: cur,
      previous: days > 0 ? prev : null,
      series,
      videoTotals,
      accounts,
      top,
      validation: snapshot?.validation ?? [],
      offers: snapshot?.offers ?? [],
      syncedAt: run?.finishedAt ?? snapshot?.syncedAt ?? null,
      lastRun: run ? { status: run.status, message: run.message ?? null } : null,
    };
  },
});

// ---------- Mac sync ----------

export const syncDaily = carouselSyncMutation({
  args: { rows: v.array(v.object({ day: v.string(), reports: v.number(), paid: v.number(), revenueCents: v.number(), aiCostMicroUsd: v.number() })) },
  handler: async (ctx, { rows }) => {
    const now = Date.now();
    for (const r of rows) {
      const prev = await ctx.db
        .query("ottoDaily")
        .withIndex("by_day", (q) => q.eq("day", r.day))
        .unique();
      if (prev) await ctx.db.patch(prev._id, { ...r, syncedAt: now });
      else await ctx.db.insert("ottoDaily", { ...r, syncedAt: now });
    }
    return rows.length;
  },
});

const videoV = v.object({
  postId: v.string(),
  platform: v.string(),
  account: v.string(),
  url: v.string(),
  caption: v.string(),
  postedAt: v.number(),
  views: v.number(),
  likes: v.number(),
  comments: v.number(),
  shares: v.number(),
});

/** Upsert the posts read on the Mac. With `complete`, posts no longer in Otto's table are removed. */
export const syncVideos = carouselSyncMutation({
  args: { rows: v.array(videoV), complete: v.boolean() },
  handler: async (ctx, { rows, complete }) => {
    const now = Date.now();
    for (const r of rows) {
      const prev = await ctx.db
        .query("ottoVideos")
        .withIndex("by_post", (q) => q.eq("postId", r.postId))
        .unique();
      if (prev) await ctx.db.patch(prev._id, { ...r, syncedAt: now });
      else await ctx.db.insert("ottoVideos", { ...r, syncedAt: now });
    }
    if (complete) {
      const keep = new Set(rows.map((r) => r.postId));
      for (const r of await ctx.db.query("ottoVideos").collect()) if (!keep.has(r.postId)) await ctx.db.delete(r._id);
    }
    return rows.length;
  },
});

export const syncSnapshot = carouselSyncMutation({
  args: {
    accounts: v.array(v.object({ key: v.string(), name: v.string(), tiktok: v.string(), order: v.number() })),
    validation: v.array(v.object({ account: v.string(), status: v.string(), count: v.number() })),
    offers: v.array(v.object({ offer: v.string(), sales: v.number(), refunded: v.number(), eurCents: v.number() })),
  },
  handler: async (ctx, args) => {
    const prev = await ctx.db.query("ottoSnapshot").first();
    if (prev) await ctx.db.replace(prev._id, { ...args, syncedAt: Date.now() });
    else await ctx.db.insert("ottoSnapshot", { ...args, syncedAt: Date.now() });
  },
});

export const recordSync = carouselSyncMutation({
  args: { status: v.union(v.literal("ok"), v.literal("error")), startedAt: v.number(), rows: v.number(), message: v.optional(v.string()) },
  handler: (ctx, { status, startedAt, rows, message }) =>
    ctx.db.insert("syncRuns", { source: SOURCE, status, startedAt, finishedAt: Date.now(), rows, message }),
});
