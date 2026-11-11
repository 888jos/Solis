import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addDays } from "./lib/dates";

// Internal model helpers for the ASO feature (non-node): written by convex/sources/aso.ts.

const localizationRow = v.object({
  locale: v.string(),
  channel: v.union(v.literal("live"), v.literal("draft")),
  versionString: v.optional(v.string()),
  versionState: v.optional(v.string()),
  name: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  keywords: v.optional(v.string()),
  promotionalText: v.optional(v.string()),
  descriptionLength: v.optional(v.number()),
});

/** Store locales whose keywords seed rank tracking, mapped to their iTunes storefront. */
export const SEED_LOCALES: Record<string, string> = {
  "en-US": "us",
  "fr-FR": "fr",
  "de-DE": "de",
  "es-ES": "es",
  ja: "jp",
  ko: "kr",
};

export function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Replaces every localization row of an app with a fresh snapshot, then seeds tracked keywords. */
export const replaceLocalizations = internalMutation({
  args: { appSlug: v.string(), rows: v.array(localizationRow) },
  handler: async (ctx, { appSlug, rows }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("asoLocalizations")
      .withIndex("by_app_locale", (q) => q.eq("appSlug", appSlug))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const row of rows) await ctx.db.insert("asoLocalizations", { appSlug, ...row, fetchedAt: now });

    // Seed from the live keywords (draft only when the app has no live version yet).
    const hasLive = rows.some((r) => r.channel === "live");
    let seeded = 0;
    for (const row of rows) {
      if (row.channel !== (hasLive ? "live" : "draft")) continue;
      const country = SEED_LOCALES[row.locale];
      if (!country || !row.keywords) continue;
      const words = [...new Set(row.keywords.split(",").map(normalizeKeyword).filter(Boolean))];
      for (const keyword of words) {
        const found = await ctx.db
          .query("asoKeywords")
          .withIndex("by_app_keyword_country", (q) => q.eq("appSlug", appSlug).eq("keyword", keyword).eq("country", country))
          .first();
        if (found) continue;
        await ctx.db.insert("asoKeywords", { appSlug, keyword, country, source: "metadata", addedAt: now });
        seeded++;
      }
    }
    return { rows: rows.length, seeded };
  },
});

/** Tracked keywords that the iTunes tracker has not measured on `date` yet. */
export const pendingKeywords = internalQuery({
  args: { date: v.string(), limit: v.number() },
  handler: async (ctx, { date, limit }) => {
    const keywords = await ctx.db.query("asoKeywords").collect();
    const out: { appSlug: string; keyword: string; country: string }[] = [];
    let remaining = 0;
    // Best-ranked first, so a run cut short still measured what matters.
    const todo = keywords
      .filter((k) => !k.removedAt && k.itunesDate !== date)
      .sort((a, b) => (a.lastRank ?? 9999) - (b.lastRank ?? 9999) || (b.popularity ?? 0) - (a.popularity ?? 0));
    for (const k of todo) {
      if (out.length < limit) out.push({ appSlug: k.appSlug, keyword: k.keyword, country: k.country });
      else remaining++;
    }
    return { batch: out, remaining };
  },
});

type RankRow = { appSlug: string; keyword: string; country: string; date: string; rank: number | null; topCompetitor?: string; resultCount?: number };

/**
 * Writes one day's rank (Astro wins over iTunes for the same day) and refreshes the keyword's
 * denormalized latest / 7-days-before measure. Returns false when an Astro row kept its place.
 */
export type RankSource = "itunes" | "astro" | "appstore";
const PRIORITY: Record<string, number> = { itunes: 1, astro: 2, appstore: 3 };

export async function writeRank(ctx: MutationCtx, row: RankRow, source: RankSource, keyword?: Doc<"asoKeywords"> | null): Promise<boolean> {
  const range = (q: any) => q.eq("appSlug", row.appSlug).eq("keyword", row.keyword).eq("country", row.country);
  const existing = await ctx.db.query("asoRankings").withIndex("by_app_keyword_date", (q) => range(q).eq("date", row.date)).first();
  if (existing && PRIORITY[existing.source ?? "itunes"] > PRIORITY[source]) return false;
  const doc = { ...row, source };
  if (existing) await ctx.db.replace(existing._id, doc);
  else await ctx.db.insert("asoRankings", doc);

  const k = keyword ?? (await ctx.db.query("asoKeywords").withIndex("by_app_keyword_country", (q) => q.eq("appSlug", row.appSlug).eq("keyword", row.keyword).eq("country", row.country)).first());
  if (k && (!k.lastRankDate || row.date >= k.lastRankDate)) {
    const before = await ctx.db.query("asoRankings").withIndex("by_app_keyword_date", (q) => range(q).lte("date", addDays(row.date, -7))).order("desc").first();
    await ctx.db.patch(k._id, { lastRank: row.rank, lastRankDate: row.date, lastRankSource: source, prevRank: before ? before.rank : undefined, prevRankDate: before?.date });
  }
  return true;
}

export const upsertRanking = internalMutation({
  args: {
    appSlug: v.string(),
    keyword: v.string(),
    country: v.string(),
    date: v.string(),
    rank: v.union(v.number(), v.null()),
    topCompetitor: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    source: v.optional(v.union(v.literal("itunes"), v.literal("appstore"))),
  },
  handler: async (ctx, { source, ...row }) => {
    const k = await ctx.db.query("asoKeywords").withIndex("by_app_keyword_country", (q) => q.eq("appSlug", row.appSlug).eq("keyword", row.keyword).eq("country", row.country)).first();
    await writeRank(ctx, row, source ?? "itunes", k);
    if (k) await ctx.db.patch(k._id, { itunesDate: row.date });
  },
});

const STATS_MAX_AGE_MS = 14 * 86400000;

/** Keywords whose popularity/difficulty were never computed by Solis, or more than 14 days ago. */
export const pendingStats = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const todo = (await ctx.db.query("asoKeywords").collect())
      .filter((k) => !k.removedAt && (k.statsSource !== "solis" || !k.statsUpdatedAt || now - k.statsUpdatedAt > STATS_MAX_AGE_MS))
      // Never computed first, then the best ranked.
      .sort((a, b) => Number(a.statsSource === "solis") - Number(b.statsSource === "solis") || (a.lastRank ?? 9999) - (b.lastRank ?? 9999));
    return { batch: todo.slice(0, limit).map((k) => ({ id: k._id, appSlug: k.appSlug, keyword: k.keyword, country: k.country })), remaining: Math.max(0, todo.length - limit) };
  },
});

export const writeStats = internalMutation({
  args: { id: v.id("asoKeywords"), popularity: v.number(), difficulty: v.union(v.number(), v.null()), competitors: v.number() },
  handler: (ctx, { id, popularity, difficulty, competitors }) =>
    ctx.db.patch(id, { popularity, difficulty: difficulty ?? undefined, competitors, statsSource: "solis", statsUpdatedAt: Date.now() }),
});

/** True while the stats chain is going (same rule as rankRunActive). */
export const statsRunActive = internalQuery({
  args: {},
  handler: (ctx) => chainActive(ctx, "aso_stats"),
});

export async function chainActive(ctx: QueryCtx, source: string): Promise<boolean> {
  const run = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", source)).order("desc").first();
  if (!run) return false;
  if (run.status === "running") return Date.now() - run.startedAt < RANK_RUN_STALE_MS;
  return /restants/.test(run.message ?? "") && Date.now() - (run.finishedAt ?? run.startedAt) < 10 * 60_000;
}

/** True while a rank chain is going: a lot is running, or the last lot ended < 10 min ago with keywords left. */
export const rankRunActive = internalQuery({
  args: {},
  handler: (ctx) => chainActive(ctx, "aso_ranks"),
});

export const RANK_RUN_STALE_MS = 60 * 60_000;

/* ---------- Apple Ads search term popularity ---------- */

/** Countries with at least one tracked keyword. */
export const trackedCountries = internalQuery({
  args: {},
  handler: async (ctx) => [...new Set((await ctx.db.query("asoKeywords").collect()).filter((k) => !k.removedAt).map((k) => k.country))].sort(),
});

const appleTermRow = v.object({
  week: v.string(),
  country: v.string(),
  genre: v.string(),
  term: v.string(),
  popularity: v.number(),
  popularity5: v.optional(v.number()),
  popularityInGenre: v.optional(v.number()),
  rankInGenre: v.optional(v.number()),
});

/** Upserts rows keyed by (week, country, genre, term). */
export const writeAppleTerms = internalMutation({
  args: { rows: v.array(appleTermRow) },
  handler: async (ctx, { rows }) => {
    let n = 0;
    for (const r of rows) {
      const same = (await ctx.db.query("appleSearchTerms").withIndex("by_country_term", (q) => q.eq("country", r.country).eq("term", r.term)).collect()).find((x) => x.week === r.week && x.genre === r.genre);
      if (same) await ctx.db.replace(same._id, r);
      else await ctx.db.insert("appleSearchTerms", r);
      n++;
    }
    return n;
  },
});

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

/** Copies Apple's latest popularity (max across genres) onto every tracked keyword that Apple lists. */
export const applyApplePopularity = internalMutation({
  args: {},
  handler: async (ctx) => {
    const keywords = (await ctx.db.query("asoKeywords").collect()).filter((k) => !k.removedAt);
    let matched = 0;
    for (const k of keywords) {
      const rows = await ctx.db.query("appleSearchTerms").withIndex("by_country_term", (q) => q.eq("country", k.country).eq("term", k.keyword)).collect();
      const alt = rows.length ? [] : await ctx.db.query("appleSearchTerms").withIndex("by_country_term", (q) => q.eq("country", k.country).eq("term", fold(k.keyword))).collect();
      const all = rows.length ? rows : alt;
      if (!all.length) continue;
      const week = all.reduce((m, r) => (r.week > m ? r.week : m), "");
      const latest = all.filter((r) => r.week === week);
      const best = latest.reduce((a, b) => (b.popularity > a.popularity ? b : a));
      await ctx.db.patch(k._id, { applePopularity: best.popularity, applePopularity5: best.popularity5, appleWeek: week });
      matched++;
    }
    return matched;
  },
});
