import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { APP_SLUGS } from "./lib/apps";
import { authAction, authQuery } from "./lib/auth";
import { storefrontOf } from "./reviewsData";

// Model (reads) for the "Avis & notes" page. Everything is aggregated here; the client gets
// compact, ready-to-format results.

const appArg = v.union(v.string(), v.null());

async function reviewsFor(ctx: QueryCtx, apps: string[]): Promise<Doc<"appReviews">[]> {
  const out: Doc<"appReviews">[] = [];
  for (const slug of apps) {
    out.push(...(await ctx.db.query("appReviews").withIndex("by_app_created", (q) => q.eq("appSlug", slug)).order("desc").collect()));
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const inRange = (createdAt: string, from: string, to: string) => {
  const day = createdAt.slice(0, 10);
  return day >= from && day <= to;
};

type Agg = { sum: number; count: number; rated: number };
const addTo = (agg: Agg, row: Doc<"appRatings">) => {
  agg.count += row.ratingCount;
  if (row.averageRating != null) {
    agg.sum += row.averageRating * row.ratingCount;
    agg.rated += row.ratingCount;
  }
};
const avgOf = (agg: Agg) => (agg.rated > 0 ? agg.sum / agg.rated : null);

async function ratingsOn(ctx: QueryCtx, date: string, apps: Set<string>) {
  const rows = await ctx.db.query("appRatings").withIndex("by_date", (q) => q.eq("date", date)).collect();
  return rows.filter((r) => apps.has(r.appSlug));
}

async function lastRun(ctx: QueryCtx, source: string) {
  const runs = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", source)).order("desc").take(20);
  const latest = runs[0] ?? null;
  const ok = runs.find((r) => r.status === "ok") ?? null;
  return {
    lastOkAt: ok ? (ok.finishedAt ?? ok.startedAt) : null,
    status: latest?.status ?? null,
    error: latest?.status === "error" ? (latest.message ?? "erreur") : null,
    message: ok?.message ?? null,
  };
}

export const overview = authQuery({
  args: { app: appArg, from: v.string(), to: v.string(), prevFrom: v.string(), prevTo: v.string() },
  handler: async (ctx, { app, from, to, prevFrom, prevTo }) => {
    const apps = app ? [app] : APP_SLUGS;
    const appSet = new Set<string>(apps);

    // Written reviews (ASC).
    const reviews = await reviewsFor(ctx, apps);
    const period = reviews.filter((r) => inRange(r.createdAt, from, to));
    const prev = reviews.filter((r) => inRange(r.createdAt, prevFrom, prevTo));
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: period.filter((r) => r.rating === stars).length }));
    const low = period.filter((r) => r.rating <= 2).length;
    const prevLow = prev.filter((r) => r.rating <= 2).length;

    // Ratings snapshots (iTunes Lookup), latest day.
    const latestRow = await ctx.db.query("appRatings").withIndex("by_date").order("desc").first();
    const latestDate = latestRow?.date ?? null;
    const latest = latestDate ? await ratingsOn(ctx, latestDate, appSet) : [];
    const total: Agg = { sum: 0, count: 0, rated: 0 };
    latest.forEach((r) => addTo(total, r));

    // Snapshot at the start of the period (latest one on or before `from`) for the delta.
    const startRow = await ctx.db.query("appRatings").withIndex("by_date", (q) => q.lte("date", from)).order("desc").first();
    let start: { date: string; count: number; average: number | null } | null = null;
    if (startRow) {
      const agg: Agg = { sum: 0, count: 0, rated: 0 };
      (await ratingsOn(ctx, startRow.date, appSet)).forEach((r) => addTo(agg, r));
      start = { date: startRow.date, count: agg.count, average: avgOf(agg) };
    }

    // Country × app table: latest ratings joined with written reviews.
    const key = (slug: string, country: string) => `${slug}:${country}`;
    const table = new Map<string, { appSlug: string; country: string; average: number | null; count: number; reviewsTotal: number; reviewsPeriod: number }>();
    for (const r of latest) table.set(key(r.appSlug, r.country), { appSlug: r.appSlug, country: r.country, average: r.averageRating, count: r.ratingCount, reviewsTotal: 0, reviewsPeriod: 0 });
    for (const r of reviews) {
      const country = storefrontOf(r.territory);
      const k = key(r.appSlug, country);
      const row = table.get(k) ?? { appSlug: r.appSlug, country, average: null, count: 0, reviewsTotal: 0, reviewsPeriod: 0 };
      row.reviewsTotal++;
      if (inRange(r.createdAt, from, to)) row.reviewsPeriod++;
      table.set(k, row);
    }
    const countries = [...table.values()].sort((a, b) => b.count - a.count || b.reviewsTotal - a.reviewsTotal);

    // Trend: every snapshot since the period start (snapshots only exist from the first sync on).
    const trendRows = (await ctx.db.query("appRatings").withIndex("by_date", (q) => q.gte("date", from)).collect()).filter((r) => appSet.has(r.appSlug));
    const dates = [...new Set(trendRows.map((r) => r.date))].sort();
    const perDate = (filter: (r: Doc<"appRatings">) => boolean) =>
      dates.map((d) => {
        const agg: Agg = { sum: 0, count: 0, rated: 0 };
        trendRows.filter((r) => r.date === d && filter(r)).forEach((r) => addTo(agg, r));
        return agg;
      });
    const trendApps = apps
      .map((slug) => {
        const aggs = perDate((r) => r.appSlug === slug);
        return { appSlug: slug, average: aggs.map((a) => avgOf(a)), count: aggs.map((a) => (a.count > 0 ? a.count : null)) };
      })
      .filter((s) => s.count.some((c) => c != null));
    const trendTotal = perDate(() => true);

    const firstSnapshot = await ctx.db.query("appRatings").withIndex("by_date").order("asc").first();

    return {
      ratings: {
        date: latestDate,
        firstDate: firstSnapshot?.date ?? null,
        average: avgOf(total),
        count: total.count,
        countryCount: new Set(latest.map((r) => r.country)).size,
        start,
      },
      reviews: { period: period.length, prev: prev.length, low, prevLow, total: reviews.length, unansweredPeriod: period.filter((r) => !r.hasResponse).length },
      distribution,
      countries,
      trend: { dates, apps: trendApps, totalAverage: trendTotal.map((a) => avgOf(a)), totalCount: trendTotal.map((a) => a.count) },
      sync: { reviews: await lastRun(ctx, "asc_reviews"), ratings: await lastRun(ctx, "itunes_ratings") },
    };
  },
});

export const feed = authQuery({
  args: {
    app: appArg,
    from: v.string(),
    to: v.string(),
    stars: v.union(v.literal("all"), v.literal("low"), v.literal("mid"), v.literal("high")),
    unanswered: v.boolean(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { app, from, to, stars, unanswered, limit }) => {
    const apps = app ? [app] : APP_SLUGS;
    const all = (await reviewsFor(ctx, apps)).filter((r) => inRange(r.createdAt, from, to));
    const starsOk = (rating: number) => (stars === "low" ? rating <= 2 : stars === "mid" ? rating === 3 : stars === "high" ? rating >= 4 : true);
    const matched = all.filter((r) => starsOk(r.rating) && (!unanswered || !r.hasResponse));
    return {
      inPeriod: all.length,
      matched: matched.length,
      rows: matched.slice(0, Math.min(limit ?? 100, 300)).map((r) => ({
        id: r.reviewId,
        appSlug: r.appSlug,
        rating: r.rating,
        title: r.title ?? null,
        body: r.body ?? null,
        nickname: r.nickname ?? null,
        country: storefrontOf(r.territory),
        createdAt: r.createdAt,
        hasResponse: r.hasResponse,
      })),
    };
  },
});

/** "Synchroniser" button: runs the same sync as the daily cron. */
export const refresh = authAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    await ctx.runAction(internal.sources.reviews.syncRecent, {});
    return null;
  },
});
