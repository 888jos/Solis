import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { loadSpend } from "./expenses";
import { APPS } from "./lib/apps";
import { authQuery } from "./lib/auth";
import { addDays, isoDay } from "./lib/dates";
import { bucketOf, bucketsBetween, loadSales } from "./revenue";
import { ottoWindow } from "./otto";
import { SOURCES } from "./sources";
import { eventKind } from "./subscriptions";

// Model of the "Vue d'ensemble" page: one compact answer to "how is Drift Studio doing?".
// Reuses the other domains' definitions (no new money logic here):
//  - Net        = Apple proceeds (revenue model, appleSales, refunds included)
//  - Dépenses   = expenses model (expenses + UGC payouts, superseded bank lines skipped)
//  - Abonnés / essais = Apple SUBSCRIPTION report, end of day (subscriptions model definitions)
//  - Conversion = subscriptions model cohort rate (matured trials only)
// "À surveiller" is built only from stored signals; each item says where to look.

const DAY_MS = 86400000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const AT_APPLE = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE", "PENDING_APPLE_RELEASE", "READY_FOR_REVIEW", "ACCEPTED", "PROCESSING_FOR_APP_STORE"]);
const REJECTED = new Set(["REJECTED", "METADATA_REJECTED", "INVALID_BINARY"]);
const STALE_RUNNING_MS = 30 * 60 * 1000;

type Bucket = "day" | "week" | "month";
type Counts = { paid: number; trials: number; billing: number };
export type WatchSeverity = "critical" | "warning" | "neutral";
type Cohort = { started: number; matured: number; converted: number };
/** One "À surveiller" signal. Raw values only: the ViewModel words and formats them. */
export type WatchItem = { key: string; severity: WatchSeverity; href: string; appSlug: string | null } & (
  | { kind: "syncError"; name: string; message: string }
  | { kind: "syncLate"; name: string; lastOkAt: number | null }
  | { kind: "salesLag"; day: string }
  | { kind: "versionRejected"; version: string; state: string }
  | { kind: "versionReady"; version: string }
  | { kind: "versionWaiting"; version: string; inReview: boolean; submittedAt: string | null; days: number | null }
  | { kind: "lowReview"; rating: number; title: string; createdAt: string; hasResponse: boolean }
  | { kind: "moreLowReviews"; count: number }
  | { kind: "conversionDrop"; current: Cohort; previous: Cohort }
  | { kind: "netDrop"; net: number; prevNet: number }
  | { kind: "spendSpike"; spend: number; prevSpend: number; vendor: string | null; vendorDelta: number | null }
  | { kind: "ratingDrop"; current: number; start: number; startDay: string }
  | { kind: "billing"; count: number }
  | { kind: "refunds"; units: number; grossEur: number }
  | { kind: "unplugged"; names: string[] }
);

function countsOf(rows: Doc<"appleSubscriptionDaily">[]): Counts {
  const c = { paid: 0, trials: 0, billing: 0 };
  for (const r of rows) {
    c.paid += r.activeStandard + r.activeIntroPaid + r.activePromo;
    c.trials += r.activeIntroTrial + (r.activeFreeOffer ?? 0);
    c.billing += r.billingRetry + r.gracePeriod;
  }
  return c;
}

/** "3 Days" / "1 Week" / "1 Month" → days (same rule as the subscriptions model). */
function offerDays(label: string | undefined): number {
  const m = /(\d+)\s*(day|week|month|year)/i.exec(label ?? "");
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
}

async function okReportDays(ctx: QueryCtx, reportType: string, from: string, to: string): Promise<string[]> {
  const rows = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", reportType).gte("date", from).lte("date", to))
    .collect();
  return rows.filter((r) => r.status === "ok").map((r) => r.date).sort();
}

async function latestOkDay(ctx: QueryCtx, reportType: string, notAfter?: string): Promise<string | null> {
  const row = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => (notAfter ? q.eq("reportType", reportType).lte("date", notAfter) : q.eq("reportType", reportType)))
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "ok"))
    .first();
  return row?.date ?? null;
}

/** Latest day Apple has published (with or without sales) for a report type. */
async function latestPublishedDay(ctx: QueryCtx, reportType: string): Promise<string | null> {
  const rows = await ctx.db.query("appleReportDays").withIndex("by_type_date", (q) => q.eq("reportType", reportType)).order("desc").take(30);
  return rows.find((r) => r.status === "ok" || r.status === "empty")?.date ?? null;
}

async function subsOn(ctx: QueryCtx, day: string | null, apps: string[]): Promise<Record<string, Counts> | null> {
  if (!day) return null;
  const rows = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.eq("date", day)).collect();
  return Object.fromEntries(apps.map((slug) => [slug, countsOf(rows.filter((r) => r.appSlug === slug))]));
}

/** First day covered by expense data: earliest expense, UGC payout or imported bank statement (as profitability). */
async function expensesCoveredFrom(ctx: QueryCtx): Promise<string | null> {
  const firstExpense = await ctx.db.query("expenses").withIndex("by_date").first();
  const firstPayout = await ctx.db.query("ugcPayouts").withIndex("by_month").first();
  const batches = await ctx.db.query("importBatches").collect();
  const candidates = [firstExpense?.date, firstPayout ? `${firstPayout.month}-01` : undefined, ...batches.map((b) => b.dateFrom)].filter((d): d is string => !!d);
  return candidates.sort()[0] ?? null;
}

/** Weighted average rating over every storefront of the latest snapshot on or before `notAfter`. */
async function ratingsAt(ctx: QueryCtx, notAfter: string | null, apps: string[]) {
  const head = notAfter
    ? await ctx.db.query("appRatings").withIndex("by_date", (q) => q.lte("date", notAfter)).order("desc").first()
    : await ctx.db.query("appRatings").withIndex("by_date").order("desc").first();
  if (!head) return null;
  const rows = await ctx.db.query("appRatings").withIndex("by_date", (q) => q.eq("date", head.date)).collect();
  const per = Object.fromEntries(
    apps.map((slug) => {
      let sum = 0;
      let rated = 0;
      let count = 0;
      for (const r of rows) {
        if (r.appSlug !== slug) continue;
        count += r.ratingCount;
        if (r.averageRating != null) {
          sum += r.averageRating * r.ratingCount;
          rated += r.ratingCount;
        }
      }
      return [slug, { average: rated > 0 ? sum / rated : null, count }];
    }),
  ) as Record<string, { average: number | null; count: number }>;
  return { date: head.date, per };
}

function daysAgo(isoDate: string, now: number) {
  return (now - Date.parse(isoDate)) / DAY_MS;
}

export const summary = authQuery({
  args: {
    from: v.string(),
    to: v.string(),
    prevFrom: v.string(),
    prevTo: v.string(),
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    app: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket, app }) => {
    const now = Date.now();
    const today = isoDay(new Date(now));
    const apps = app ? APPS.filter((a) => a.slug === app).map((a) => a.slug as string) : APPS.map((a) => a.slug as string);
    const x = bucketsBetween(from, to, bucket as Bucket);
    const xIndex = new Map(x.map((k, i) => [k, i]));
    const zeros = () => x.map(() => 0);

    /* ---------- Sales (Net, downloads) ---------- */
    // Apple publishes a day ~1-2 days late: the previous window is cut by the same number of missing
    // days, so deltas compare equal numbers of reported days.
    const salesLatestDay = await latestPublishedDay(ctx, "SALES");
    const coveredTo = salesLatestDay && salesLatestDay < to ? salesLatestDay : to;
    const missingDays = Math.max(0, Math.round((Date.parse(to) - Date.parse(coveredTo)) / DAY_MS));
    const prevCmpTo = addDays(prevTo, -missingDays);
    const coveredDays = Math.max(0, Math.round((Date.parse(coveredTo) - Date.parse(from)) / DAY_MS) + 1);
    const sales = (await loadSales(ctx, prevFrom, to, app)).filter((s) => apps.includes(s.appSlug));
    const perAppSales = Object.fromEntries(apps.map((slug) => [slug, { net: 0, prevNet: 0, downloads: 0, prevDownloads: 0, netSeries: zeros() }])) as Record<
      string,
      { net: number; prevNet: number; downloads: number; prevDownloads: number; netSeries: number[] }
    >;
    const netSeries = zeros();
    const downloadSeries = zeros();
    let refundUnits = 0;
    let refundGross = 0;
    for (const s of sales) {
      const a = perAppSales[s.appSlug];
      if (s.date >= from && s.date <= to) {
        a.net += s.proceedsEur;
        if (s.isDownload) a.downloads += s.units;
        const i = xIndex.get(bucketOf(s.date, bucket as Bucket));
        if (i != null) {
          a.netSeries[i] += s.proceedsEur;
          netSeries[i] += s.proceedsEur;
          if (s.isDownload) downloadSeries[i] += s.units;
        }
        if (s.units < 0) {
          refundUnits -= s.units;
          refundGross -= s.grossEur;
        }
      } else if (s.date >= prevFrom && s.date <= prevCmpTo) {
        a.prevNet += s.proceedsEur;
        if (s.isDownload) a.prevDownloads += s.units;
      }
    }
    const sum = (pick: (a: (typeof perAppSales)[string]) => number) => Object.values(perAppSales).reduce((t, a) => t + pick(a), 0);
    const net = round2(sum((a) => a.net));
    const prevNet = round2(sum((a) => a.prevNet));
    const downloads = sum((a) => a.downloads);
    const prevDownloads = sum((a) => a.prevDownloads);

    const salesFirstDay = (
      await ctx.db
        .query("appleReportDays")
        .withIndex("by_type_date", (q) => q.eq("reportType", "SALES"))
        .filter((q) => q.eq(q.field("status"), "ok"))
        .first()
    )?.date ?? null;

    // Buckets after the last published Apple sales day are unknown, not zero.
    const salesEnd = salesLatestDay ? bucketOf(salesLatestDay, bucket as Bucket) : null;
    const known = <T,>(arr: T[]) => arr.map((val, i) => (salesEnd && x[i] > salesEnd ? null : val));

    /* ---------- Expenses ---------- */
    const coveredFrom = await expensesCoveredFrom(ctx);
    const spendItems = coveredFrom ? (await loadSpend(ctx, prevFrom, to, app)).filter((i) => !i.superseded) : [];
    let spend = 0;
    let prevSpend = 0;
    const spendSeries = zeros();
    const vendorCur = new Map<string, number>();
    const vendorPrev = new Map<string, number>();
    for (const i of spendItems) {
      if (i.date >= from && i.date <= to) {
        spend += i.amountEur;
        vendorCur.set(i.vendor, (vendorCur.get(i.vendor) ?? 0) + i.amountEur);
        const at = xIndex.get(bucketOf(i.date, bucket as Bucket));
        if (at != null) spendSeries[at] += i.amountEur;
      } else if (i.date >= prevFrom && i.date <= prevTo) {
        prevSpend += i.amountEur;
        vendorPrev.set(i.vendor, (vendorPrev.get(i.vendor) ?? 0) + i.amountEur);
      }
    }
    const expensesCovered = coveredFrom != null && coveredFrom <= to;
    const expensesPartial = expensesCovered && coveredFrom > from;
    const prevCovered = coveredFrom != null && coveredFrom <= prevFrom;
    const expenses = expensesCovered
      ? {
          coveredFrom,
          partial: expensesPartial,
          total: round2(spend),
          prev: prevCovered ? round2(prevSpend) : null,
          series: spendSeries.map(round2),
          margin: round2(net - spend),
          prevMargin: prevCovered ? round2(prevNet - prevSpend) : null,
          marginSeries: known(netSeries.map((n, i) => round2(n - spendSeries[i]))),
        }
      : null;

    /* ---------- Subscriptions (end-of-period snapshot + per-bucket sparkline) ---------- */
    const subsDay = await latestOkDay(ctx, "SUBSCRIPTION", to);
    const subsPrevDay = await latestOkDay(ctx, "SUBSCRIPTION", prevTo);
    const subsNow = await subsOn(ctx, subsDay, apps);
    const subsPrev = subsPrevDay && subsPrevDay !== subsDay ? await subsOn(ctx, subsPrevDay, apps) : null;
    const subOkDays = await okReportDays(ctx, "SUBSCRIPTION", from, to);
    const lastDayOfBucket = new Map<string, string>();
    for (const d of subOkDays) lastDayOfBucket.set(bucketOf(d, bucket as Bucket), d);
    const paidSeries: (number | null)[] = [];
    const trialSeries: (number | null)[] = [];
    for (const k of x) {
      const d = lastDayOfBucket.get(k);
      const snap = d ? (d === subsDay ? subsNow : await subsOn(ctx, d, apps)) : null;
      paidSeries.push(snap ? Object.values(snap).reduce((t, c) => t + c.paid, 0) : null);
      trialSeries.push(snap ? Object.values(snap).reduce((t, c) => t + c.trials, 0) : null);
    }
    const total = (snap: Record<string, Counts> | null, key: keyof Counts) => (snap ? Object.values(snap).reduce((t, c) => t + c[key], 0) : null);

    /* ---------- Trial → paid conversion cohort (current vs previous) ---------- */
    const eventsHorizon = await latestOkDay(ctx, "SUBSCRIPTION_EVENT");
    const events = (await ctx.db.query("appleSubscriptionEvents").withIndex("by_date", (q) => q.gte("date", prevFrom)).collect()).filter((e) => apps.includes(e.appSlug));
    const cohort = (lo: string, hi: string) => {
      const c = { started: 0, matured: 0, converted: 0 };
      const horizon = eventsHorizon ?? to;
      for (const e of events) {
        const kind = eventKind(e.event, e.offerType);
        if (kind === "trialStart" && e.date >= lo && e.date <= hi) {
          c.started += e.count;
          if (addDays(e.date, offerDays(e.offerDuration)) <= horizon) c.matured += e.count;
        }
        if (kind === "conversion" && e.originalStartDate && e.originalStartDate >= lo && e.originalStartDate <= hi) c.converted += e.count;
      }
      return c;
    };
    const conv = cohort(from, to);
    const prevConv = cohort(prevFrom, prevTo);

    /* ---------- Ratings, reviews, versions ---------- */
    const ratingsNow = await ratingsAt(ctx, null, apps);
    const ratingsStart = ratingsNow ? await ratingsAt(ctx, addDays(from, -1), apps) : null;

    const lowReviews: Doc<"appReviews">[] = [];
    for (const slug of apps) {
      const rows = await ctx.db
        .query("appReviews")
        .withIndex("by_app_created", (q) => q.eq("appSlug", slug).gte("createdAt", from).lt("createdAt", addDays(to, 1)))
        .collect();
      lowReviews.push(...rows.filter((r) => r.rating <= 2));
    }
    lowReviews.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const versionRows = app
      ? await ctx.db.query("appVersions").withIndex("by_app", (q) => q.eq("appSlug", app)).collect()
      : await ctx.db.query("appVersions").collect();
    const versionsByApp = new Map<string, Doc<"appVersions">[]>();
    for (const r of versionRows) versionsByApp.set(r.appSlug, [...(versionsByApp.get(r.appSlug) ?? []), r]);
    const liveOf = (slug: string) =>
      (versionsByApp.get(slug) ?? [])
        .filter((r) => r.state === "READY_FOR_SALE")
        .sort((a, b) => (b.releasedAt ?? b.createdDate ?? "").localeCompare(a.releasedAt ?? a.createdDate ?? ""))[0] ?? null;
    const pendingOf = (slug: string) => (versionsByApp.get(slug) ?? []).filter((r) => AT_APPLE.has(r.state) || REJECTED.has(r.state));

    /* ---------- Sync health ---------- */
    const syncs: { source: string; name: string; state: "ok" | "late" | "error" | "running" | "notConfigured" | "never"; lastOkAt: number | null; message: string | null }[] = [];
    for (const def of SOURCES) {
      const runs = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", def.source)).order("desc").take(30);
      const finished = runs.find((r) => r.status !== "running" || now - r.startedAt > STALE_RUNNING_MS) ?? null;
      const lastOk = runs.find((r) => r.status === "ok") ?? null;
      const lastOkAt = lastOk ? (lastOk.finishedAt ?? lastOk.startedAt) : null;
      const missing = def.envs.some((name) => !process.env[name]);
      let state: (typeof syncs)[number]["state"];
      if (!runs.length) state = missing ? "notConfigured" : "never";
      else if (!finished) state = "running";
      else if (finished.status === "skipped") state = "notConfigured";
      else if (finished.status === "error" || finished.status === "running") state = "error";
      else if (lastOkAt && now - lastOkAt > def.staleAfterHours * 3600 * 1000) state = "late";
      else state = "ok";
      const message = state === "error" ? (finished?.status === "running" ? "Synchro interrompue" : (finished?.message ?? "Erreur inconnue")) : null;
      syncs.push({ source: def.source, name: def.name, state, lastOkAt, message });
    }
    const lastSyncAt = syncs.reduce<number | null>((m, s) => (s.lastOkAt && (!m || s.lastOkAt > m) ? s.lastOkAt : m), null);

    /* ---------- À surveiller ---------- */
    const watch: WatchItem[] = [];
    const base = (key: string, severity: WatchSeverity, href: string, appSlug: string | null) => ({ key, severity, href, appSlug });
    for (const s of syncs) {
      if (s.state === "error") watch.push({ ...base(`sync:${s.source}`, "critical", "/sources", null), kind: "syncError", name: s.name, message: (s.message ?? "").slice(0, 200) });
      if (s.state === "late") watch.push({ ...base(`sync:${s.source}`, "warning", "/sources", null), kind: "syncLate", name: s.name, lastOkAt: s.lastOkAt });
    }
    if (salesLatestDay && salesLatestDay < addDays(today, -3)) watch.push({ ...base("sales-lag", "warning", "/sources", null), kind: "salesLag", day: salesLatestDay });
    for (const slug of apps) {
      for (const r of pendingOf(slug)) {
        const subs = r.submissions ?? [];
        const lastSub = subs[subs.length - 1];
        const key = `version:${r.versionId}`;
        if (REJECTED.has(r.state)) watch.push({ ...base(key, "critical", "/versions", slug), kind: "versionRejected", version: r.versionString, state: r.state });
        else if (r.state === "PENDING_DEVELOPER_RELEASE") watch.push({ ...base(key, "neutral", "/versions", slug), kind: "versionReady", version: r.versionString });
        else {
          const days = lastSub ? daysAgo(lastSub.submittedDate, now) : null;
          watch.push({ ...base(key, days != null && days > 2 ? "warning" : "neutral", "/versions", slug), kind: "versionWaiting", version: r.versionString, inReview: r.state === "IN_REVIEW", submittedAt: lastSub?.submittedDate ?? null, days });
        }
      }
    }
    for (const r of lowReviews.slice(0, 3)) {
      watch.push({ ...base(`review:${r.reviewId}`, "warning", "/avis", r.appSlug), kind: "lowReview", rating: r.rating, title: (r.title ?? "").slice(0, 120), createdAt: r.createdAt, hasResponse: r.hasResponse });
    }
    if (lowReviews.length > 3) watch.push({ ...base("review:more", "warning", "/avis", null), kind: "moreLowReviews", count: lowReviews.length - 3 });
    if (conv.matured >= 5 && prevConv.matured >= 5 && prevConv.converted / prevConv.matured - conv.converted / conv.matured >= 0.1) {
      watch.push({ ...base("conversion", "warning", "/abonnements", null), kind: "conversionDrop", current: conv, previous: prevConv });
    }
    // Compared on the same number of reported days (see prevCmpTo).
    if (coveredDays >= 3 && prevNet >= 20 && net < prevNet * 0.75) watch.push({ ...base("net-drop", "warning", "/revenus", null), kind: "netDrop", net, prevNet });
    if (expenses && expenses.prev != null && spend - prevSpend >= 50 && spend > prevSpend * 1.5) {
      const growth = [...vendorCur].map(([vendor, cur]) => ({ vendor, delta: round2(cur - (vendorPrev.get(vendor) ?? 0)) })).sort((a, b) => b.delta - a.delta)[0];
      watch.push({ ...base("spend-spike", "warning", "/depenses", null), kind: "spendSpike", spend: round2(spend), prevSpend: round2(prevSpend), vendor: growth && growth.delta > 0 ? growth.vendor : null, vendorDelta: growth && growth.delta > 0 ? growth.delta : null });
    }
    if (ratingsNow && ratingsStart && ratingsStart.date !== ratingsNow.date) {
      for (const slug of apps) {
        const cur = ratingsNow.per[slug]?.average;
        const start = ratingsStart.per[slug]?.average;
        if (cur != null && start != null && start - cur >= 0.1) watch.push({ ...base(`rating:${slug}`, "warning", "/avis", slug), kind: "ratingDrop", current: cur, start, startDay: ratingsStart.date });
      }
    }
    const billing = total(subsNow, "billing");
    if (billing) watch.push({ ...base("billing", "neutral", "/abonnements", null), kind: "billing", count: billing });
    if (refundUnits > 0) watch.push({ ...base("refunds", "neutral", "/revenus", null), kind: "refunds", units: refundUnits, grossEur: round2(refundGross) });
    const unplugged = syncs.filter((s) => s.state === "notConfigured");
    if (unplugged.length) watch.push({ ...base("unplugged", "neutral", "/sources", null), kind: "unplugged", names: unplugged.map((s) => s.name) });
    const rank: Record<WatchSeverity, number> = { critical: 0, warning: 1, neutral: 2 };
    watch.sort((a, b) => rank[a.severity] - rank[b.severity]);

    /* ---------- Per app ---------- */
    const perApp = apps.map((slug) => {
      const s = perAppSales[slug];
      const live = liveOf(slug);
      const pending = pendingOf(slug)[0] ?? null;
      return {
        slug,
        net: round2(s.net),
        prevNet: round2(s.prevNet),
        netSeries: known(s.netSeries.map(round2)),
        downloads: s.downloads,
        prevDownloads: s.prevDownloads,
        paid: subsNow ? subsNow[slug].paid : null,
        prevPaid: subsPrev ? subsPrev[slug].paid : null,
        trials: subsNow ? subsNow[slug].trials : null,
        rating: ratingsNow?.per[slug]?.average ?? null,
        ratingCount: ratingsNow?.per[slug]?.count ?? 0,
        liveVersion: live ? { version: live.versionString, releasedAt: live.releasedAt ?? null } : null,
        pendingVersion: pending ? { version: pending.versionString, state: pending.state } : null,
      };
    });

    /* ---------- Otto (not an App Store app: only on the all-projects view) ---------- */
    const ottoRaw = app ? null : await ottoWindow(ctx, { from, to, prevFrom, prevTo }, (d) => bucketOf(d, bucket as Bucket));
    const otto = ottoRaw
      ? { ...ottoRaw.current, prev: ottoRaw.previous, series: x.map((k) => round2(ottoRaw.series.get(k) ?? 0)), revenueSource: ottoRaw.revenueSource }
      : null;

    return {
      x,
      bucket,
      otto,
      hasSales: salesFirstDay != null,
      comparedDays: { missing: missingDays, prevTo: prevCmpTo },
      net: { total: net, prev: salesFirstDay && salesFirstDay <= prevTo ? prevNet : null, series: known(netSeries.map(round2)) },
      downloads: { total: downloads, prev: salesFirstDay && salesFirstDay <= prevTo ? prevDownloads : null, series: known(downloadSeries) },
      expenses,
      subscriptions: {
        day: subsDay,
        prevDay: subsPrev ? subsPrevDay : null,
        paid: total(subsNow, "paid"),
        prevPaid: total(subsPrev, "paid"),
        trials: total(subsNow, "trials"),
        prevTrials: total(subsPrev, "trials"),
        paidSeries,
        trialSeries,
      },
      conversion: { current: conv, previous: prevConv },
      perApp,
      watch,
      freshness: {
        salesLatestDay,
        subsDay,
        eventsDay: eventsHorizon,
        ratingsDay: ratingsNow?.date ?? null,
        lastSyncAt,
        syncErrors: syncs.filter((s) => s.state === "error").length,
        syncLate: syncs.filter((s) => s.state === "late").length,
      },
    };
  },
});
