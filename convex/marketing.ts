import { v } from "convex/values";
import { APPS } from "./lib/apps";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";
import { bucketOf, bucketsBetween, loadSales } from "./revenue";

// Page Performance (Marketing), inspired by creator dashboards (SideShift, ViralApp): views won per day,
// posts, engagement, accounts leaderboard, top videos with previews, and the same days' installs (apps)
// or reports (Otto) to see whether views turn into users.
//
// Two ways to count views, both from Post for Me:
//   - "gained": views won each day (snapshots since Solis started reading Post for Me) — exact, recent
//   - "posted": every view of a video counted on the day it was published — works for the whole history

type Bucket = "day" | "week" | "month";
const DAY_MS = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function parisDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Pearson correlation of two equal-length series (null when not enough variance or points). */
function correlation(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 5) return null;
  const ma = a.reduce((t, x) => t + x, 0) / n;
  const mb = b.reduce((t, x) => t + x, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  if (!va || !vb) return null;
  return r2(cov / Math.sqrt(va * vb));
}

const filterArgs = {
  from: v.string(),
  to: v.string(),
  prevFrom: v.string(),
  prevTo: v.string(),
  bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
  project: v.optional(v.union(v.string(), v.null())),
  platform: v.optional(v.union(v.string(), v.null())),
  account: v.optional(v.union(v.string(), v.null())), // pfm account id
  mode: v.union(v.literal("gained"), v.literal("posted")),
};

export const overview = authQuery({
  args: filterArgs,
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket, project, platform, account, mode }) => {
    const accounts = await ctx.db.query("socialAccounts").collect();
    const keep = (a: { project?: string; platform: string; pfmAccountId?: string; pfmId?: string }) =>
      (!project || a.project === project) && (!platform || a.platform === platform) && (!account || (a.pfmAccountId ?? a.pfmId) === account);
    const x = bucketsBetween(from, to, bucket as Bucket);
    const xIndex = new Map(x.map((k, i) => [k, i]));
    const zeros = () => x.map(() => 0);
    const startMs = Date.parse(`${prevFrom}T00:00:00Z`);
    const endMs = Date.parse(`${addDays(to, 1)}T00:00:00Z`);

    // Posts published in the current or previous window (all modes need them).
    const posts = (await ctx.db.query("socialPosts").withIndex("by_posted", (q) => q.gte("postedAt", startMs).lt("postedAt", endMs)).collect()).filter((p) => keep(p));
    const inCur = (day: string) => day >= from && day <= to;
    const inPrev = (day: string) => day >= prevFrom && day <= prevTo;
    const curPosts = posts.filter((p) => inCur(parisDay(p.postedAt)));
    const prevPosts = posts.filter((p) => inPrev(parisDay(p.postedAt)));

    // Views / engagement per bucket, by platform.
    const totals = { views: 0, likes: 0, comments: 0, shares: 0 };
    const prevTotals = { views: 0, likes: 0, comments: 0, shares: 0 };
    const byPlatform = new Map<string, number[]>();
    const byAccount = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
    const viewsSeries = zeros();
    let trackingSince: string | null = null;
    if (mode === "gained") {
      const firstDaily = await ctx.db.query("socialDaily").withIndex("by_day").first();
      trackingSince = firstDaily?.day ?? null;
      const daily = (await ctx.db.query("socialDaily").withIndex("by_day", (q) => q.gte("day", prevFrom).lte("day", to)).collect()).filter((d) => keep(d));
      for (const d of daily) {
        const t = inCur(d.day) ? totals : inPrev(d.day) ? prevTotals : null;
        if (!t) continue;
        t.views += d.views;
        t.likes += d.likes;
        t.comments += d.comments;
        t.shares += d.shares;
        if (t !== totals) continue;
        const i = xIndex.get(bucketOf(d.day, bucket as Bucket));
        if (i == null) continue;
        if (!byPlatform.has(d.platform)) byPlatform.set(d.platform, zeros());
        byPlatform.get(d.platform)![i] += d.views;
        viewsSeries[i] += d.views;
        const acc = byAccount.get(d.pfmAccountId) ?? { views: 0, likes: 0, comments: 0, shares: 0 };
        acc.views += d.views;
        acc.likes += d.likes;
        acc.comments += d.comments;
        acc.shares += d.shares;
        byAccount.set(d.pfmAccountId, acc);
      }
    } else {
      for (const p of posts) {
        const day = parisDay(p.postedAt);
        const t = inCur(day) ? totals : inPrev(day) ? prevTotals : null;
        if (!t) continue;
        t.views += p.views;
        t.likes += p.likes;
        t.comments += p.comments;
        t.shares += p.shares;
        if (t !== totals) continue;
        const i = xIndex.get(bucketOf(day, bucket as Bucket));
        if (i == null) continue;
        if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, zeros());
        byPlatform.get(p.platform)![i] += p.views;
        viewsSeries[i] += p.views;
        const acc = byAccount.get(p.pfmAccountId) ?? { views: 0, likes: 0, comments: 0, shares: 0 };
        acc.views += p.views;
        acc.likes += p.likes;
        acc.comments += p.comments;
        acc.shares += p.shares;
        byAccount.set(p.pfmAccountId, acc);
      }
    }
    const postsSeries = zeros();
    for (const p of curPosts) {
      const i = xIndex.get(bucketOf(parisDay(p.postedAt), bucket as Bucket));
      if (i != null) postsSeries[i]++;
    }

    // Outcome on the same days: installs of the project's app(s), or Otto's reports and payments.
    const appSlugs = project ? APPS.filter((a) => a.slug === project).map((a) => a.slug as string) : APPS.map((a) => a.slug as string);
    const outcomeSeries = zeros();
    const outcomeDaily = new Map<string, number>();
    let outcomeLabel = "Téléchargements";
    let outcomeTotal = 0;
    if (project === "otto") {
      outcomeLabel = "Rapports Otto";
      for (const r of await ctx.db.query("ottoDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect()) {
        outcomeDaily.set(r.day, (outcomeDaily.get(r.day) ?? 0) + r.reports);
      }
    } else {
      const sales = (await loadSales(ctx, from, to, project && appSlugs.length === 1 ? project : null)).filter((s) => s.isDownload && appSlugs.includes(s.appSlug));
      for (const s of sales) outcomeDaily.set(s.date, (outcomeDaily.get(s.date) ?? 0) + s.units);
      if (!project) outcomeLabel = "Téléchargements (toutes les apps)";
    }
    for (const [day, n] of outcomeDaily) {
      outcomeTotal += n;
      const i = xIndex.get(bucketOf(day, bucket as Bucket));
      if (i != null) outcomeSeries[i] += n;
    }
    // Day-level correlation between views and outcome (same day and with a 1-day lag).
    const viewsByDay = new Map<string, number>();
    if (mode === "gained") {
      for (const d of (await ctx.db.query("socialDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect()).filter((d) => keep(d))) viewsByDay.set(d.day, (viewsByDay.get(d.day) ?? 0) + d.views);
    } else {
      for (const p of curPosts) viewsByDay.set(parisDay(p.postedAt), (viewsByDay.get(parisDay(p.postedAt)) ?? 0) + p.views);
    }
    const days: string[] = [];
    for (let d = trackingSince && mode === "gained" && trackingSince > from ? trackingSince : from; d <= to; d = addDays(d, 1)) days.push(d);
    const vs = days.map((d) => viewsByDay.get(d) ?? 0);
    const os = days.map((d) => outcomeDaily.get(d) ?? 0);
    const sameDay = correlation(vs, os);
    const nextDay = correlation(vs.slice(0, -1), os.slice(1));

    // Leaderboard of accounts.
    const accountRows = accounts
      .filter((a) => keep(a))
      .map((a) => {
        const own = curPosts.filter((p) => p.pfmAccountId === a.pfmId);
        const g = byAccount.get(a.pfmId) ?? { views: 0, likes: 0, comments: 0, shares: 0 };
        return {
          id: a._id,
          pfmId: a.pfmId,
          platform: a.platform,
          username: a.username,
          project: a.project ?? null,
          avatarUrl: a.avatarUrl ?? null,
          posts: own.length,
          views: g.views,
          medianViews: median(own.map((p) => p.views)),
          engagement: g.views ? r2((g.likes + g.comments + g.shares) / g.views) : null,
          comments: g.comments,
          shares: g.shares,
          best: own.reduce<number>((m, p) => Math.max(m, p.views), 0),
        };
      })
      .sort((a, b) => b.views - a.views);

    // Top videos of the window (published in it), with what the page needs for a preview.
    const top = [...curPosts]
      .sort((a, b) => b.views - a.views)
      .slice(0, 24)
      .map((p) => ({
        postId: p.postId,
        platform: p.platform,
        account: p.account,
        project: p.project ?? null,
        url: p.url ?? null,
        caption: p.caption ?? null,
        postedAt: p.postedAt,
        thumbnailUrl: p.thumbnailUrl ?? null,
        mediaUrl: p.mediaUrl ?? null,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        engagement: p.views ? r2((p.likes + p.comments + p.shares) / p.views) : null,
      }));

    const curViews = curPosts.map((p) => p.views);
    const last = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", "postforme")).order("desc").first();
    return {
      connected: accounts.length > 0,
      lastSync: last ? { status: last.status, message: last.message ?? null, at: last.finishedAt ?? last.startedAt } : null,
      mode,
      trackingSince,
      x,
      totals,
      prevTotals,
      posts: curPosts.length,
      prevPosts: prevPosts.length,
      medianViews: median(curViews),
      prevMedianViews: median(prevPosts.map((p) => p.views)),
      viral: curViews.filter((n) => n >= 10_000).length,
      over1k: curViews.filter((n) => n >= 1_000).length,
      byPlatform: [...byPlatform].map(([key, values]) => ({ key, values })),
      viewsSeries,
      postsSeries,
      outcome: { label: outcomeLabel, total: outcomeTotal, series: outcomeSeries, perThousandViews: totals.views ? r2((outcomeTotal / totals.views) * 1000) : null, sameDay, nextDay },
      accounts: accountRows,
      top,
      unassigned: accounts.filter((a) => !a.project).length,
      platforms: [...new Set(accounts.map((a) => a.platform))].sort(),
      allAccounts: accounts.map((a) => ({ id: a._id, pfmId: a.pfmId, platform: a.platform, username: a.username, project: a.project ?? null })).sort((a, b) => a.username.localeCompare(b.username)),
      dayMs: DAY_MS,
    };
  },
});
