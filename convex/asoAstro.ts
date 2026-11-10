import { v } from "convex/values";
import { normalizeKeyword, writeRank } from "./asoData";
import { APPS } from "./lib/apps";
import { carouselSyncMutation, carouselSyncQuery } from "./lib/auth";

// Astro (Mac ASO app, matteospada.it.ASO) → Solis. scripts/astro_sync.py reads a copy of Astro's Core
// Data store and pushes here with the Mac sync token (same token as the Carousel Factory and Otto):
//   - keywords: popularity (Apple Search Ads, 5-100), difficulty, competing apps, Astro's current rank
//   - ranks: Astro's daily App Store search positions (1-999, null = not ranked)
// Astro's positions are real App Store search results; they replace an iTunes Search measure of the same day.

const SOURCE = "astro";
const BY_APPLE_ID = new Map(APPS.map((a) => [a.appStoreId, a.slug as string]));

/** Last Astro day already stored per app, so the script only sends newer history. */
export const status = carouselSyncQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, string | null> = {};
    for (const a of APPS) {
      const kws = await ctx.db.query("asoKeywords").withIndex("by_app", (q) => q.eq("appSlug", a.slug)).collect();
      out[a.appStoreId] = kws.reduce<string | null>((m, k) => (k.lastRankSource === "astro" && k.lastRankDate && (!m || k.lastRankDate > m) ? k.lastRankDate : m), null);
    }
    return out;
  },
});

const keywordRow = v.object({
  appleId: v.string(),
  keyword: v.string(),
  country: v.string(),
  popularity: v.optional(v.number()),
  difficulty: v.optional(v.number()),
  competitors: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
});

export const upsertKeywords = carouselSyncMutation({
  args: { rows: v.array(keywordRow) },
  handler: async (ctx, { rows }) => {
    let created = 0;
    let updated = 0;
    const now = Date.now();
    for (const r of rows) {
      const appSlug = BY_APPLE_ID.get(r.appleId);
      if (!appSlug) continue;
      const keyword = normalizeKeyword(r.keyword);
      const country = r.country.trim().toLowerCase();
      if (!keyword || !/^[a-z]{2}$/.test(country)) continue;
      const stats = { popularity: r.popularity, difficulty: r.difficulty, competitors: r.competitors, astroUpdatedAt: r.updatedAt };
      const k = await ctx.db.query("asoKeywords").withIndex("by_app_keyword_country", (q) => q.eq("appSlug", appSlug).eq("keyword", keyword).eq("country", country)).first();
      if (k) {
        // Never brings back a keyword removed from the UI; only refreshes its stats.
        await ctx.db.patch(k._id, stats);
        updated++;
      } else {
        await ctx.db.insert("asoKeywords", { appSlug, keyword, country, source: "astro", addedAt: now, ...stats });
        created++;
      }
    }
    return { created, updated };
  },
});

const rankRow = v.object({ appleId: v.string(), keyword: v.string(), country: v.string(), date: v.string(), rank: v.union(v.number(), v.null()) });

export const upsertRanks = carouselSyncMutation({
  args: { rows: v.array(rankRow) },
  handler: async (ctx, { rows }) => {
    let written = 0;
    for (const r of rows) {
      const appSlug = BY_APPLE_ID.get(r.appleId);
      if (!appSlug || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
      const keyword = normalizeKeyword(r.keyword);
      const country = r.country.trim().toLowerCase();
      if (await writeRank(ctx, { appSlug, keyword, country, date: r.date, rank: r.rank }, "astro")) written++;
    }
    return { written };
  },
});

export const recordSync = carouselSyncMutation({
  args: { status: v.union(v.literal("ok"), v.literal("error")), startedAt: v.number(), rows: v.number(), message: v.optional(v.string()) },
  handler: (ctx, { status, startedAt, rows, message }) => ctx.db.insert("syncRuns", { source: SOURCE, status, startedAt, finishedAt: Date.now(), rows, message }),
});
