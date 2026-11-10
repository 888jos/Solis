import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeKeyword, RANK_RUN_STALE_MS } from "./asoData";
import { appBySlug } from "./lib/apps";
import { addDays } from "./lib/dates";
import { authMutation, authQuery } from "./lib/auth";

// ASO model: store metadata per locale, tracked keywords and their daily iTunes Search rank.

const COUNTRY_RE = /^[a-z]{2}$/;

async function latestRun(ctx: any, source: string) {
  const runs = await ctx.db
    .query("syncRuns")
    .withIndex("by_source_started", (q: any) => q.eq("source", source))
    .order("desc")
    .take(20);
  const latest = runs[0] ?? null;
  const stale = !!latest && latest.status === "running" && Date.now() - latest.startedAt > RANK_RUN_STALE_MS;
  const lastOk = runs.find((r: any) => r.status === "ok") ?? null;
  return latest
    ? { status: (stale ? "error" : latest.status) as string, startedAt: latest.startedAt as number, message: (stale ? "La dernière mesure s'est interrompue avant la fin" : (latest.message ?? null)) as string | null, lastOkAt: (lastOk?.finishedAt ?? null) as number | null }
    : null;
}

/** Store metadata of every app (or one), all locales, live + draft. Small: ~60 rows of short strings. */
export const metadata = authQuery({
  args: { app: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { app }) => {
    const rows = app
      ? await ctx.db.query("asoLocalizations").withIndex("by_app_locale", (q) => q.eq("appSlug", app)).collect()
      : await ctx.db.query("asoLocalizations").collect();
    return {
      sync: await latestRun(ctx, "aso_metadata"),
      rows: rows.map(({ _id, _creationTime, ...row }) => row),
    };
  },
});

/** Tracked keywords with their latest rank, the rank 7 days before it and Astro's stats. */
export const keywords = authQuery({
  args: { app: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { app }) => {
    const tracked = app
      ? await ctx.db.query("asoKeywords").withIndex("by_app", (q) => q.eq("appSlug", app)).collect()
      : await ctx.db.query("asoKeywords").collect();
    const rows = [];
    for (const k of tracked) {
      if (k.removedAt) continue;
      // Denormalized by writeRank; rows written before that fall back to two index reads.
      let latest: { date: string; rank: number | null; topCompetitor?: string; source?: string } | null = k.lastRankDate ? { date: k.lastRankDate, rank: k.lastRank ?? null, source: k.lastRankSource } : null;
      let prev: { date: string; rank: number | null } | null = k.prevRankDate ? { date: k.prevRankDate, rank: k.prevRank ?? null } : null;
      if (!latest) {
        const range = (q: any) => q.eq("appSlug", k.appSlug).eq("keyword", k.keyword).eq("country", k.country);
        const l = await ctx.db.query("asoRankings").withIndex("by_app_keyword_date", range).order("desc").first();
        latest = l ? { date: l.date, rank: l.rank, topCompetitor: l.topCompetitor, source: l.source } : null;
        const p = l ? await ctx.db.query("asoRankings").withIndex("by_app_keyword_date", (q) => range(q).lte("date", addDays(l.date, -7))).order("desc").first() : null;
        prev = p ? { date: p.date, rank: p.rank } : null;
      }
      rows.push({
        id: k._id,
        appSlug: k.appSlug,
        keyword: k.keyword,
        country: k.country,
        source: k.source ?? "metadata",
        date: latest?.date ?? null,
        rank: latest ? latest.rank : null,
        rankSource: latest?.source ?? "itunes",
        measured: !!latest,
        topCompetitor: latest?.topCompetitor ?? null,
        prevDate: prev?.date ?? null,
        prevRank: prev ? prev.rank : null,
        prevMeasured: !!prev,
        popularity: k.popularity ?? null,
        difficulty: k.difficulty ?? null,
        competitors: k.competitors ?? null,
        astroUpdatedAt: k.astroUpdatedAt ?? null,
      });
    }
    return { sync: await latestRun(ctx, "aso_ranks"), astro: await latestRun(ctx, "astro"), rows };
  },
});

/** Daily rank history of one keyword between two days. */
export const history = authQuery({
  args: { appSlug: v.string(), keyword: v.string(), country: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, { appSlug, keyword, country, from, to }) => {
    const rows = await ctx.db
      .query("asoRankings")
      .withIndex("by_app_keyword_date", (q) => q.eq("appSlug", appSlug).eq("keyword", keyword).eq("country", country).gte("date", from).lte("date", to))
      .collect();
    return rows.map((r) => ({ date: r.date, rank: r.rank, topCompetitor: r.topCompetitor ?? null, source: r.source ?? "itunes" }));
  },
});

export const addKeyword = authMutation({
  args: { appSlug: v.string(), keyword: v.string(), country: v.string() },
  handler: async (ctx, args) => {
    const keyword = normalizeKeyword(args.keyword);
    const country = args.country.trim().toLowerCase();
    if (!appBySlug(args.appSlug)) throw new Error("App inconnue");
    if (!keyword || keyword.length > 100) throw new Error("Mot-clé vide ou trop long");
    if (!COUNTRY_RE.test(country)) throw new Error("Pays invalide (code à 2 lettres, ex. fr)");
    const existing = await ctx.db
      .query("asoKeywords")
      .withIndex("by_app_keyword_country", (q) => q.eq("appSlug", args.appSlug).eq("keyword", keyword).eq("country", country))
      .first();
    if (existing && !existing.removedAt) return { id: existing._id, created: false };
    if (existing) {
      await ctx.db.patch(existing._id, { removedAt: undefined, source: "manual", addedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.sources.aso.rankOne, { appSlug: args.appSlug, keyword, country });
      return { id: existing._id, created: true };
    }
    const id = await ctx.db.insert("asoKeywords", { appSlug: args.appSlug, keyword, country, source: "manual", addedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.sources.aso.rankOne, { appSlug: args.appSlug, keyword, country });
    return { id, created: true };
  },
});

/** Stops tracking a keyword. Rank history is kept and comes back if the keyword is re-added. */
export const removeKeyword = authMutation({
  args: { id: v.id("asoKeywords") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row && !row.removedAt) await ctx.db.patch(id, { removedAt: Date.now() });
  },
});

/** Re-reads App Store Connect metadata and measures today's missing ranks (no-op if a run is in progress). */
export const refresh = authMutation({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("syncRuns")
      .withIndex("by_source_started", (q) => q.eq("source", "aso_ranks"))
      .order("desc")
      .first();
    if (running?.status === "running" && Date.now() - running.startedAt < RANK_RUN_STALE_MS) return { started: false };
    await ctx.scheduler.runAfter(0, internal.sources.aso.syncRecent, {});
    return { started: true };
  },
});
