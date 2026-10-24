import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";
import { UGC_SOURCE } from "./ugcData";

// UGC creators (CortiFree only). Costs:
// - recorded: Airtable "Attributed cost USD" on a production, when present;
// - CPM creators: views / 1000 × $1.20, capped at $300 per video (program terms), counted on the publication date;
// - fixed creators: the monthly amount recorded in Airtable, only from their "Fixed start" date, prorated by day.
export const CPM_USD_PER_1000 = 1.2;
export const CPM_CAP_PER_VIDEO_USD = 300;

type Bucket = "day" | "week" | "month";

function bucketOf(day: string, bucket: Bucket): string {
  if (bucket === "day") return day;
  if (bucket === "month") return day.slice(0, 7);
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday-based weeks
  return addDays(day, -back);
}

function bucketKeys(from: string, to: string, bucket: Bucket): string[] {
  const keys: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = bucketOf(d, bucket);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

const inRange = (day: string | undefined, from: string, to: string) => !!day && day >= from && day <= to;

function daysInMonth(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isCpm(c: Doc<"ugcCreators"> | undefined) {
  return !!c && (c.program === "CPM campaign" || c.stage === "CPM");
}

function videoCost(video: Doc<"ugcVideos">, creator: Doc<"ugcCreators"> | undefined): { usd: number; kind: "recorded" | "cpm" | "none" } {
  if (video.costUsd != null) return { usd: video.costUsd, kind: "recorded" };
  if (isCpm(creator)) return { usd: Math.min(CPM_CAP_PER_VIDEO_USD, (video.views / 1000) * CPM_USD_PER_1000), kind: "cpm" };
  return { usd: 0, kind: "none" };
}

function fixedCost(creator: Doc<"ugcCreators">, from: string, to: string): number {
  if (creator.stage !== "Fixed" || !creator.fixedStart || !creator.fixedMonthlyUsd) return 0;
  let total = 0;
  for (let d = creator.fixedStart > from ? creator.fixedStart : from; d <= to; d = addDays(d, 1)) total += creator.fixedMonthlyUsd / daysInMonth(d);
  return total;
}

/** EUR per USD from the shared fxRates table (1 EUR = perEur USD), latest rate on or before `day`. */
async function usdRate(ctx: QueryCtx, day: string): Promise<{ perEur: number; date: string } | null> {
  for (let i = 0, d = day; i < 15; i++, d = addDays(d, -1)) {
    const row = await ctx.db
      .query("fxRates")
      .withIndex("by_date_currency", (q) => q.eq("date", d).eq("currency", "USD"))
      .first();
    if (row) return { perEur: row.perEur, date: d };
  }
  return null;
}

function windowTotals(videos: Doc<"ugcVideos">[], creators: Map<string, Doc<"ugcCreators">>, from: string, to: string) {
  const published = videos.filter((vid) => vid.status === "Published" && inRange(vid.postedAt, from, to));
  let cpmUsd = 0;
  let recordedUsd = 0;
  for (const vid of published) {
    const cost = videoCost(vid, vid.creatorAirtableId ? creators.get(vid.creatorAirtableId) : undefined);
    if (cost.kind === "cpm") cpmUsd += cost.usd;
    if (cost.kind === "recorded") recordedUsd += cost.usd;
  }
  let fixedUsd = 0;
  for (const c of creators.values()) fixedUsd += fixedCost(c, from, to);
  return {
    published,
    videos: published.length,
    views: published.reduce((s, vid) => s + vid.views, 0),
    cpmUsd,
    recordedUsd,
    fixedUsd,
    costUsd: cpmUsd + recordedUsd + fixedUsd,
  };
}

export const summary = authQuery({
  args: {
    from: v.string(),
    to: v.string(),
    prevFrom: v.string(),
    prevTo: v.string(),
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
  },
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket }) => {
    const [creatorDocs, videos, outreach, applications] = await Promise.all([
      ctx.db.query("ugcCreators").collect(),
      ctx.db.query("ugcVideos").collect(),
      ctx.db.query("ugcOutreach").collect(),
      ctx.db.query("ugcApplications").collect(),
    ]);
    const runs = await ctx.db
      .query("syncRuns")
      .withIndex("by_source_started", (q) => q.eq("source", UGC_SOURCE))
      .order("desc")
      .take(20);
    const lastRun = runs[0] ?? null;
    const lastOk = runs.find((r) => r.status === "ok") ?? null;

    const hasData = creatorDocs.length + videos.length + outreach.length + applications.length > 0;
    const creators = new Map(creatorDocs.map((c) => [c.airtableId, c]));
    const cur = windowTotals(videos, creators, from, to);
    const prev = windowTotals(videos, creators, prevFrom, prevTo);
    const rate = await usdRate(ctx, to);
    const toEur = (usd: number) => (rate ? usd / rate.perEur : null);

    // Views by publication bucket.
    const keys = bucketKeys(from, to, bucket);
    const viewsByBucket = new Map(keys.map((k) => [k, { views: 0, videos: 0 }]));
    for (const vid of cur.published) {
      const slot = viewsByBucket.get(bucketOf(vid.postedAt!, bucket));
      if (slot) {
        slot.views += vid.views;
        slot.videos += 1;
      }
    }

    // Applications by bucket and program.
    const appsByBucket = new Map(keys.map((k) => [k, { cpm: 0, fixed: 0, other: 0 }]));
    const appsInPeriod = applications.filter((a) => inRange(a.appliedAt.slice(0, 10), from, to));
    for (const a of appsInPeriod) {
      const slot = appsByBucket.get(bucketOf(a.appliedAt.slice(0, 10), bucket));
      if (!slot) continue;
      if (a.program === "CPM campaign") slot.cpm += 1;
      else if (a.program === "Creator Program (fixed)") slot.fixed += 1;
      else slot.other += 1;
    }

    // Recruitment funnel for the period.
    const contacted = outreach.filter((o) => inRange(o.firstContact, from, to));
    const createdDay = (c: Doc<"ugcCreators">) => (c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : c.startDate);
    const newCreators = creatorDocs.filter((c) => inRange(createdDay(c), from, to));
    const creatorsWithVideo = new Set(cur.published.map((vid) => vid.creatorAirtableId).filter(Boolean));

    const stageCounts = new Map<string, number>();
    for (const c of creatorDocs) stageCounts.set(c.stage ?? "Sans étape", (stageCounts.get(c.stage ?? "Sans étape") ?? 0) + 1);

    // Per-creator table (period).
    const creatorRows = creatorDocs.map((c) => {
      const mine = cur.published.filter((vid) => vid.creatorAirtableId === c.airtableId);
      const views = mine.reduce((s, vid) => s + vid.views, 0);
      const videoUsd = mine.reduce((s, vid) => s + videoCost(vid, c).usd, 0);
      const costUsd = videoUsd + fixedCost(c, from, to);
      return {
        id: c.airtableId,
        name: c.name,
        handle: c.handle ?? null,
        tiktokUrl: c.tiktokUrl ?? null,
        program: c.program ?? null,
        stage: c.stage ?? null,
        status: c.status ?? null,
        fixedMonthlyUsd: c.fixedMonthlyUsd ?? null,
        joined: createdDay(c) ?? null,
        videos: mine.length,
        views,
        costUsd,
        costEur: toEur(costUsd),
      };
    });

    const topVideos = [...cur.published]
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)
      .map((vid) => {
        const c = vid.creatorAirtableId ? creators.get(vid.creatorAirtableId) : undefined;
        const cost = videoCost(vid, c);
        return {
          id: vid.airtableId,
          label: vid.label ?? null,
          creator: c?.name ?? null,
          platform: vid.platform ?? null,
          postedAt: vid.postedAt!,
          url: vid.url ?? null,
          views: vid.views,
          likes: vid.likes ?? null,
          costUsd: cost.usd,
          costKind: cost.kind,
          costEur: toEur(cost.usd),
        };
      });

    return {
      hasData,
      source: {
        lastOkAt: lastOk ? (lastOk.finishedAt ?? lastOk.startedAt) : null,
        lastOkMessage: lastOk?.message ?? null,
        isSnapshot: !!lastOk?.message?.startsWith("snapshot"),
        lastRunStatus: lastRun?.status ?? null,
        lastRunMessage: lastRun?.message ?? null,
      },
      fx: rate ? { date: rate.date, usdPerEur: rate.perEur } : null,
      totals: {
        creators: creatorDocs.length,
        activeCreators: creatorDocs.filter((c) => c.status === "Active").length,
        productions: videos.length,
        selectedNotPublished: videos.filter((vid) => vid.status === "Selected").length,
      },
      current: {
        videos: cur.videos,
        views: cur.views,
        costUsd: cur.costUsd,
        cpmUsd: cur.cpmUsd,
        fixedUsd: cur.fixedUsd,
        recordedUsd: cur.recordedUsd,
        costEur: toEur(cur.costUsd),
        newCreators: newCreators.length,
        creatorsWithVideo: creatorsWithVideo.size,
      },
      previous: { videos: prev.videos, views: prev.views, costUsd: prev.costUsd, costEur: toEur(prev.costUsd) },
      viewsSeries: keys.map((k) => ({ x: k, ...viewsByBucket.get(k)! })),
      applicationsSeries: keys.map((k) => ({ x: k, ...appsByBucket.get(k)! })),
      funnel: {
        contacted: contacted.length,
        replied: contacted.filter((o) => !!o.lastReplyDate).length,
        applied: appsInPeriod.length,
        creators: newCreators.length,
        withVideo: creatorsWithVideo.size,
      },
      outreachLabels: [...contacted.reduce((m, o) => m.set(o.label ?? "Sans label", (m.get(o.label ?? "Sans label") ?? 0) + 1), new Map<string, number>())]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      stages: [...stageCounts].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
      creators: creatorRows,
      topVideos,
    };
  },
});
