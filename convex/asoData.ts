import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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

/** Tracked keywords that have no snapshot for `date` yet (optionally one app only). */
export const pendingKeywords = internalQuery({
  args: { date: v.string(), limit: v.number() },
  handler: async (ctx, { date, limit }) => {
    const keywords = await ctx.db.query("asoKeywords").collect();
    const out: { appSlug: string; keyword: string; country: string }[] = [];
    let remaining = 0;
    for (const k of keywords) {
      if (k.removedAt) continue;
      const done = await ctx.db
        .query("asoRankings")
        .withIndex("by_app_keyword_date", (q) => q.eq("appSlug", k.appSlug).eq("keyword", k.keyword).eq("country", k.country).eq("date", date))
        .first();
      if (done) continue;
      if (out.length < limit) out.push({ appSlug: k.appSlug, keyword: k.keyword, country: k.country });
      else remaining++;
    }
    return { batch: out, remaining };
  },
});

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
    const existing = await ctx.db
      .query("asoRankings")
      .withIndex("by_app_keyword_date", (q) => q.eq("appSlug", row.appSlug).eq("keyword", row.keyword).eq("country", row.country).eq("date", row.date))
      .first();
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("asoRankings", row);
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
