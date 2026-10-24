import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { loadSpend } from "./expenses";
import { authQuery } from "./lib/auth";
import { APPS } from "./lib/apps";
import { bucketOf, bucketsBetween, comparablePrevTo, loadSales } from "./revenue";
import { eventKind } from "./subscriptions";

// Acquisition model. Sources:
//  - Apple SALES daily reports (appleSales): first-time downloads (product types 1, 1F, 1T, F1),
//    re-downloads (3, 3F) and updates (7, 7F), all free units. Refund lines never apply to these.
//  - Apple SUBSCRIPTION_EVENT reports: trial starts and new paying subscribers (trial conversions + direct
//    subscriptions), for the download → paid ratio of the same period (not a cohort).
//  - engagementDaily: new users seen by the analytics tool (Amplitude for CortiFree, PostHog for Quest IRL).
//  - ugcVideos: views of published UGC videos (CortiFree only), counted on the publication date.
//  - expenses (+ UGC payouts through loadSpend): categories "ugc" and "ads", for the cost per download.

const REDOWNLOAD_TYPES = new Set(["3", "3F"]);
const UPDATE_TYPES = new Set(["7", "7F"]);
const SPEND_CATEGORIES = new Set(["ugc", "ads"]);

const bucketArg = v.union(v.literal("day"), v.literal("week"), v.literal("month"));

type Window = { downloads: number; redownloads: number; updates: number; dataDays: number; ugcEur: number; adsEur: number; spendLines: number };

const minDay = (a: string, b: string) => (a < b ? a : b);
const dayCount = (from: string, to: string) => (to < from ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function latestSalesDay(ctx: QueryCtx) {
  const row = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", "SALES"))
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "ok"))
    .first();
  return row ? { day: row.date, fetchedAt: row.fetchedAt } : null;
}

/** UGC + ads spend of [from, to]. With an app filter: lines tagged with that app, plus UGC payouts for CortiFree (the only app with UGC). */
async function spendOf(ctx: QueryCtx, from: string, to: string, app: string | null) {
  const items = await loadSpend(ctx, from, to, null);
  let ugcEur = 0;
  let adsEur = 0;
  let lines = 0;
  for (const it of items) {
    if (it.superseded || !SPEND_CATEGORIES.has(it.category)) continue;
    if (app && it.appSlug !== app && !(it.source === "ugc_airtable" && app === "cortifree")) continue;
    if (it.category === "ugc") ugcEur += it.amountEur;
    else adsEur += it.amountEur;
    lines++;
  }
  return { ugcEur: round2(ugcEur), adsEur: round2(adsEur), lines };
}

/**
 * Everything the Acquisition page shows for one period (and the previous one of the same length):
 * KPI totals, downloads per app over time, top countries, UGC views on the same buckets, and the
 * per-app funnel downloads → trials → new paying subscribers.
 */
export const overview = authQuery({
  args: { from: v.string(), to: v.string(), prevFrom: v.string(), prevTo: v.string(), bucket: bucketArg, app: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket, app }) => {
    const appFilter = app ?? null;
    const apps = APPS.filter((a) => !appFilter || a.slug === appFilter).map((a) => a.slug as string);
    const latest = await latestSalesDay(ctx);
    // Previous window cut to the same number of reported days as the current one (see comparablePrevTo).
    const prevCmpTo = await comparablePrevTo(ctx, "SALES", to, prevTo);
    const [sales, prevSales, spend, prevSpend] = await Promise.all([
      loadSales(ctx, from, to, appFilter),
      loadSales(ctx, prevFrom, prevCmpTo, appFilter),
      spendOf(ctx, from, to, appFilter),
      spendOf(ctx, prevFrom, prevTo, appFilter),
    ]);

    // Days covered by Apple data: from the first sales line of the app(s) (launch) to the latest report day.
    const first = appFilter
      ? await ctx.db.query("appleSales").withIndex("by_app_date", (q) => q.eq("appSlug", appFilter)).order("asc").first()
      : await ctx.db.query("appleSales").withIndex("by_date").order("asc").first();
    const dataDays = (f: string, t: string) => (latest && first ? dayCount(f > first.date ? f : first.date, minDay(t, latest.day)) : 0);

    /* --- Totals, series by app, countries --- */
    const x = bucketsBetween(from, to, bucket);
    const index = new Map(x.map((k, i) => [k, i]));
    const byApp = new Map<string, number[]>(apps.map((slug) => [slug, x.map(() => 0)]));
    const countries = new Map<string, number>();
    const perApp = new Map<string, { downloads: number; redownloads: number; updates: number }>(apps.map((slug) => [slug, { downloads: 0, redownloads: 0, updates: 0 }]));
    const cur: Window = { downloads: 0, redownloads: 0, updates: 0, dataDays: dataDays(from, to), ugcEur: spend.ugcEur, adsEur: spend.adsEur, spendLines: spend.lines };
    for (const s of sales) {
      const a = perApp.get(s.appSlug);
      if (s.isDownload) {
        cur.downloads += s.units;
        if (a) a.downloads += s.units;
        const i = index.get(bucketOf(s.date, bucket));
        const arr = byApp.get(s.appSlug);
        if (arr && i != null) arr[i] += s.units;
        countries.set(s.country, (countries.get(s.country) ?? 0) + s.units);
      } else if (REDOWNLOAD_TYPES.has(s.productTypeId)) {
        cur.redownloads += s.units;
        if (a) a.redownloads += s.units;
      } else if (UPDATE_TYPES.has(s.productTypeId)) {
        cur.updates += s.units;
        if (a) a.updates += s.units;
      }
    }
    const prev: Window = { downloads: 0, redownloads: 0, updates: 0, dataDays: dataDays(prevFrom, prevCmpTo), ugcEur: prevSpend.ugcEur, adsEur: prevSpend.adsEur, spendLines: prevSpend.lines };
    for (const s of prevSales) {
      if (s.isDownload) prev.downloads += s.units;
      else if (REDOWNLOAD_TYPES.has(s.productTypeId)) prev.redownloads += s.units;
      else if (UPDATE_TYPES.has(s.productTypeId)) prev.updates += s.units;
    }

    /* --- Funnel per app: trials and new paying subscribers (events), new users (analytics) --- */
    const funnel = [];
    for (const slug of apps) {
      const events = await ctx.db.query("appleSubscriptionEvents").withIndex("by_app_date", (q) => q.eq("appSlug", slug).gte("date", from).lte("date", to)).collect();
      let trialStarts = 0;
      let newPaid = 0;
      for (const e of events) {
        const kind = eventKind(e.event, e.offerType);
        if (kind === "trialStart") trialStarts += e.count;
        if (kind === "conversion" || kind === "newPaid") newPaid += e.count;
      }
      const engagement = await ctx.db.query("engagementDaily").withIndex("by_app_date", (q) => q.eq("appSlug", slug).gte("date", from).lte("date", to)).collect();
      const counts = perApp.get(slug)!;
      funnel.push({
        slug,
        ...counts,
        trialStarts,
        newPaid,
        newUsers: engagement.length ? engagement.reduce((sum, r) => sum + r.newUsers, 0) : null,
        analyticsSource: engagement[0]?.source ?? null,
      });
    }
    const eventsDay = await ctx.db
      .query("appleReportDays")
      .withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION_EVENT"))
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "ok"))
      .first();

    /* --- UGC views on the same buckets (CortiFree only) --- */
    const ugcRows = await ctx.db.query("ugcVideos").collect();
    const ugcRun = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", "airtable_ugc")).order("desc").first();
    const ugcViews = x.map(() => 0);
    const ugcVideos = x.map(() => 0);
    for (const vid of ugcRows) {
      if (vid.status !== "Published" || !vid.postedAt) continue;
      const day = vid.postedAt.slice(0, 10);
      if (day < from || day > to) continue;
      const i = index.get(bucketOf(day, bucket));
      if (i == null) continue;
      ugcViews[i] += vid.views;
      ugcVideos[i] += 1;
    }

    const sortedCountries = [...countries.entries()]
      .map(([country, downloads]) => ({ country, downloads }))
      .filter((c) => c.downloads !== 0)
      .sort((a, b) => b.downloads - a.downloads || a.country.localeCompare(b.country));

    return {
      latestDay: latest?.day ?? null,
      firstDay: first?.date ?? null,
      lastFetchedAt: latest?.fetchedAt ?? null,
      eventsLatestDay: eventsDay?.date ?? null,
      current: cur,
      previous: prev,
      x,
      series: [...byApp.entries()].map(([slug, values]) => ({ slug, values })),
      countries: sortedCountries.slice(0, 10),
      countryCount: sortedCountries.length,
      otherCountryDownloads: sortedCountries.slice(10).reduce((sum, c) => sum + c.downloads, 0),
      funnel,
      ugc: {
        connected: ugcRows.length > 0,
        lastRunStatus: ugcRun?.status ?? null,
        lastRunMessage: ugcRun?.message ?? null,
        lastRunAt: ugcRun?.finishedAt ?? ugcRun?.startedAt ?? null,
        views: ugcViews,
        videos: ugcVideos,
      },
    };
  },
});
