import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
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
export async function writeRank(ctx: MutationCtx, row: RankRow, source: "itunes" | "astro", keyword?: Doc<"asoKeywords"> | null): Promise<boolean> {
  const range = (q: any) => q.eq("appSlug", row.appSlug).eq("keyword", row.keyword).eq("country", row.country);
  const existing = await ctx.db.query("asoRankings").withIndex("by_app_keyword_date", (q) => range(q).eq("date", row.date)).first();
  if (existing && existing.source === "astro" && source === "itunes") return false;
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
  },
  handler: async (ctx, row) => {
    const k = await ctx.db.query("asoKeywords").withIndex("by_app_keyword_country", (q) => q.eq("appSlug", row.appSlug).eq("keyword", row.keyword).eq("country", row.country)).first();
    await writeRank(ctx, row, "itunes", k);
    if (k) await ctx.db.patch(k._id, { itunesDate: row.date });
  },
});

/** True while a rank run started less than an hour ago is still going (avoids parallel chains). */
export const rankRunActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const run = await ctx.db
      .query("syncRuns")
      .withIndex("by_source_started", (q) => q.eq("source", "aso_ranks"))
      .order("desc")
      .first();
    return !!run && run.status === "running" && Date.now() - run.startedAt < RANK_RUN_STALE_MS;
  },
});

export const RANK_RUN_STALE_MS = 60 * 60_000;
