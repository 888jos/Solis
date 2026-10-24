import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";
import { bucketsBetween, bucketOf, loadSales, totalsOf } from "./revenue";
import { eventKind, type EventKind } from "./subscriptions";

// Model for the "Apps > Cocorise" page.
//  - Firestore (project snapwake-33207, collection analytics_events + users): the app's own event tracking,
//    aggregated by sources/cocoriseAnalytics.ts (same logic as the old local dashboard server.mjs) and
//    cached in analyticsCache. These queries only read the cache: the UI never waits on Firestore.
//  - OneSignal (read-only GET): push subscribers and sent messages, cached the same way.
//  - App Store Connect tables already synced by other sources (appleSales, subscriptions, reviews, versions).

export const APP = "cocorise";
export const PROJECT_ID = "snapwake-33207";
/** The old dashboard bucketed days in the Mac's time zone. */
export const TIME_ZONE = "Europe/Paris";

const MIN = 60_000;
export const TTL_RECENT_MS = 15 * MIN;
export const TTL_CLOSED_MS = 7 * 24 * 60 * MIN;
export const TTL_BOUNDS_MS = 60 * MIN;
export const TTL_ONESIGNAL_MS = 30 * MIN;
export const REPORT_VERSION = "v1";

/* ---------------- keys & dates (shared with the node source) ---------------- */

/** FNV-1a 32-bit, hex. Stable cache key from the query identity. */
export function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const boundsKey = () => `${APP}:firestore:bounds:${hashKey(`${PROJECT_ID}|analytics_events|bounds`)}`;
export const reportKey = (from: string, to: string) => `${APP}:firestore:report:${hashKey(`${PROJECT_ID}|analytics_events|onboarding-report|${REPORT_VERSION}|${from}|${to}`)}`;
export const dayKey = (day: string) => `${APP}:firestore:day:${hashKey(`${PROJECT_ID}|analytics_events|day-partial|${REPORT_VERSION}|${day}`)}`;
export const daysIndexKey = () => `${APP}:firestore:days:${hashKey(`${PROJECT_ID}|analytics_events|day-index|${REPORT_VERSION}`)}`;
export const backfillKey = () => `${APP}:firestore:backfill:${hashKey(`${PROJECT_ID}|analytics_events|backfill`)}`;
export const oneSignalKey = () => `${APP}:onesignal:${hashKey("onesignal|app+notifications|v1")}`;

/** Day (YYYY-MM-DD) of an instant in the Paris time zone. */
export function parisDay(ms: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** UTC instant of 00:00 Paris time on `day`. */
export function parisMidnight(day: string): number {
  const guess = Date.parse(`${day}T00:00:00Z`);
  // Offset of Paris at that instant (CET +1 / CEST +2), found by formatting the guess in Paris.
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return guess - (asUtc - guess);
}

export type Bounds = { firstDay: string | null; lastDay: string | null; lastEventAt: number | null };
/** day → fetchedAt of its cached partial aggregate. */
export type DaysIndex = { days: Record<string, number> };
export type BackfillState = { scheduledFor: number | null; lastError: string | null; lastRunAt: number; leaseUntil: number };

/** Every day of [from, to]. */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Requested period clamped to the days that actually hold events (so "12 mois" and "Tout" share one cache entry). */
export function effectiveRange(from: string, to: string, bounds: Bounds): { from: string; to: string } | null {
  if (!bounds.firstDay || !bounds.lastDay) return null;
  const f = from > bounds.firstDay ? from : bounds.firstDay;
  const t = to < bounds.lastDay ? to : bounds.lastDay;
  return f <= t ? { from: f, to: t } : null;
}

/** Closed windows (ending before yesterday) never change: cache them for a week. */
export function ttlFor(to: string, now = Date.now()): number {
  return to >= addDays(parisDay(now), -1) ? TTL_RECENT_MS : TTL_CLOSED_MS;
}

/* ---------------- cache plumbing ---------------- */

export const getCache = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

/** Upsert a cache entry. With `error` only, keeps the previous payload (stale data beats no data). */
export const putCache = internalMutation({
  args: { key: v.string(), payload: v.optional(v.any()), error: v.optional(v.string()) },
  handler: async (ctx, { key, payload, error }) => {
    const existing = await ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (payload === undefined) {
      if (existing) await ctx.db.patch(existing._id, { error });
      else await ctx.db.insert("analyticsCache", { key, appSlug: APP, payload: null, fetchedAt: 0, error });
      return;
    }
    const row = { key, appSlug: APP, payload, fetchedAt: Date.now(), error: undefined };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("analyticsCache", row);
  },
});

/** Records that the partial aggregate of `day` is cached (atomic read-modify-write of the index). */
export const markDay = internalMutation({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const key = daysIndexKey();
    const existing = await ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const index = ((existing?.payload as DaysIndex | null) ?? { days: {} }) as DaysIndex;
    const payload: DaysIndex = { days: { ...index.days, [day]: Date.now() } };
    if (existing) await ctx.db.patch(existing._id, { payload, fetchedAt: Date.now() });
    else await ctx.db.insert("analyticsCache", { key, appSlug: APP, payload, fetchedAt: Date.now() });
  },
});

/**
 * Day-loading lease (one loader at a time, so the page and the scheduled resume never read the same days twice).
 * `claim` returns false when another run holds it; `release` stores the outcome and the next scheduled resume.
 */
export const backfillLease = internalMutation({
  args: { op: v.union(v.literal("claim"), v.literal("release")), ttlMs: v.optional(v.number()), lastError: v.optional(v.union(v.string(), v.null())), scheduledFor: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, { op, ttlMs, lastError, scheduledFor }) => {
    const key = backfillKey();
    const existing = await ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const cur: BackfillState = (existing?.payload as BackfillState | null) ?? { scheduledFor: null, lastError: null, lastRunAt: 0, leaseUntil: 0 };
    const now = Date.now();
    let next: BackfillState;
    if (op === "claim") {
      if (cur.leaseUntil > now) return false;
      next = { ...cur, leaseUntil: now + (ttlMs ?? 9 * MIN), lastRunAt: now };
    } else {
      next = { ...cur, leaseUntil: 0, lastError: lastError ?? null, scheduledFor: scheduledFor === undefined ? cur.scheduledFor : scheduledFor };
    }
    if (existing) await ctx.db.patch(existing._id, { payload: next, fetchedAt: now });
    else await ctx.db.insert("analyticsCache", { key, appSlug: APP, payload: next, fetchedAt: now });
    return true;
  },
});

async function readCache(ctx: QueryCtx, key: string): Promise<Doc<"analyticsCache"> | null> {
  return ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

/* ---------------- Firestore report (cache read) ---------------- */

export type StepCount = { id: string; users: number };
export type FreeWakeupRow = {
  userId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  limit: number;
  completed: number;
  remaining: number;
  premium: boolean;
  reconnected: boolean;
  provider: string;
  hasProfile: boolean;
};
export type NotificationTypeRow = {
  type: string;
  scheduled: number;
  opened: number;
  foreground: number;
  openedThenCompleted: number;
  openedThenFreeWakeup: number;
  openedThenPremium: number;
  openedThenAuth: number;
};
export type FirestoreReport = {
  from: string;
  to: string;
  eventsRead: number;
  /** Days of the period merged into this report. loaded < total while the history is still loading (Spark quota). */
  coverage: { loaded: number; total: number; missingFrom: string | null };
  totals: {
    totalEvents: number;
    totalUsers: number;
    installs: number;
    installsStartedOnboarding: number;
    onboardingUsers: number;
    started: number;
    completed: number;
    authReached: number;
    paywallReached: number;
    paywallViewed: number;
    purchased: number;
    trackedRevenue: number;
  };
  steps: StepCount[]; // every onboarding step seen (users per step), plus "completed"
  sources: StepCount[]; // "Where did you hear about us?" answers
  daily: { date: string; started: number; completed: number }[];
  topButtons: { button: string; count: number }[];
  eventCounts: { name: string; count: number }[];
  freeWakeups: {
    totals: { users: number; assigned: number; withRemaining: number; exhausted: number; completedAtLeastOne: number; totalCompleted: number; premiumUnlocked: number; reconnected: number };
    funnel: StepCount[];
    users: FreeWakeupRow[];
    userCount: number;
  };
  notifications: {
    totals: { typesTracked: number; scheduledUsers: number; openedUsers: number; foregroundUsers: number };
    byType: NotificationTypeRow[];
    byCampaign: { type: string; id: string; scheduled: number; opened: number; openedThenPremium: number }[];
  };
};

/**
 * Firestore analytics report for [from, to] (Paris days), from the cache.
 * status: "missing" (not built yet: the client asks sources/cocoriseAnalytics:refreshFirestore; `progress`
 *         says how many days of the period are already loaded), "empty" (no event in the period),
 *         "ready" (payload, maybe stale), "error" (with the reason, e.g. Firestore daily quota).
 */
export const firestoreReport = authQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const boundsRow = await readCache(ctx, boundsKey());
    const bounds = (boundsRow?.payload as Bounds | null) ?? null;
    const boundsStale = !boundsRow || !bounds || Date.now() - boundsRow.fetchedAt > TTL_BOUNDS_MS;
    const backfillRow = await readCache(ctx, backfillKey());
    const backfill = (backfillRow?.payload as BackfillState | null) ?? null;
    if (!bounds) return { status: boundsRow?.error ? ("error" as const) : ("missing" as const), bounds: null, needsRefresh: true, error: boundsRow?.error ?? null, backfill };
    const range = effectiveRange(from, to, bounds);
    if (!range) return { status: "empty" as const, bounds, needsRefresh: boundsStale, error: null, backfill };
    const row = await readCache(ctx, reportKey(range.from, range.to));
    const payload = (row?.payload as FirestoreReport | null) ?? null;
    const days = daysOf(range.from, range.to);
    const complete = !!payload && (payload.coverage?.loaded ?? days.length) >= days.length;
    let progress = { loaded: payload?.coverage?.loaded ?? 0, total: days.length };
    if (!complete) {
      const index = ((await readCache(ctx, daysIndexKey()))?.payload as DaysIndex | null) ?? { days: {} };
      progress = { loaded: days.filter((d) => index.days[d]).length, total: days.length };
    }
    if (!payload) {
      return { status: row?.error ? ("error" as const) : ("missing" as const), bounds, range, progress, needsRefresh: true, error: row?.error ?? null, backfill };
    }
    // An incomplete report is rebuilt only when more days got loaded since (each rebuild reads user profiles).
    const stale = complete ? Date.now() - row!.fetchedAt > ttlFor(range.to) : progress.loaded > (payload.coverage?.loaded ?? 0);
    return { status: "ready" as const, bounds, range, progress, complete, report: payload, fetchedAt: row!.fetchedAt, stale, needsRefresh: stale || boundsStale, error: row!.error ?? null, backfill };
  },
});

/* ---------------- OneSignal (cache read) ---------------- */

export type OneSignalPayload = {
  appName: string | null;
  players: number;
  messageablePlayers: number;
  createdAt: string | null;
  notificationsTotal: number;
  clicks30d: number | null;
  notifications: { id: string; name: string; sentAt: number | null; successful: number; failed: number; errored: number; converted: number; received: number | null }[];
};

export const oneSignal = authQuery({
  args: {},
  handler: async (ctx) => {
    const row = await readCache(ctx, oneSignalKey());
    const payload = (row?.payload as OneSignalPayload | null) ?? null;
    return {
      payload,
      fetchedAt: row?.fetchedAt ?? null,
      error: row?.error ?? null,
      needsRefresh: !row || !payload || Date.now() - row.fetchedAt > TTL_ONESIGNAL_MS,
    };
  },
});

/* ---------------- App Store (already-synced Solis tables) ---------------- */

const bucketArg = v.union(v.literal("day"), v.literal("week"), v.literal("month"));

/** Sales, subscriptions, ratings, reviews and versions of Cocorise for the period. Compact result. */
export const appStore = authQuery({
  args: { from: v.string(), to: v.string(), prevFrom: v.string(), prevTo: v.string(), bucket: bucketArg },
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket }) => {
    const [sales, prevSales] = await Promise.all([loadSales(ctx, from, to, APP), loadSales(ctx, prevFrom, prevTo, APP)]);
    const x = bucketsBetween(from, to, bucket);
    const index = new Map(x.map((k, i) => [k, i]));
    const downloads = x.map(() => 0);
    const proceeds = x.map(() => 0);
    for (const s of sales) {
      const i = index.get(bucketOf(s.date, bucket));
      if (i === undefined) continue;
      if (s.isDownload) downloads[i] += s.units;
      proceeds[i] += s.proceedsEur;
    }
    const latestSale = await ctx.db.query("appleSales").withIndex("by_app_date", (q) => q.eq("appSlug", APP)).order("desc").first();

    // Subscription events in the period, by category.
    const events = await ctx.db.query("appleSubscriptionEvents").withIndex("by_app_date", (q) => q.eq("appSlug", APP).gte("date", from).lte("date", to)).collect();
    const eventTotals: Partial<Record<EventKind, number>> = {};
    for (const e of events) {
      const k = eventKind(e.event, e.offerType);
      eventTotals[k] = (eventTotals[k] ?? 0) + e.count;
    }

    // Active subscriptions on the latest report day ≤ to.
    const lastDaily = await ctx.db
      .query("appleSubscriptionDaily")
      .withIndex("by_app_date", (q) => q.eq("appSlug", APP).lte("date", to))
      .order("desc")
      .first();
    let active: { day: string; paid: number; trials: number; billing: number } | null = null;
    if (lastDaily) {
      const rows = await ctx.db.query("appleSubscriptionDaily").withIndex("by_app_date", (q) => q.eq("appSlug", APP).eq("date", lastDaily.date)).collect();
      active = { day: lastDaily.date, paid: 0, trials: 0, billing: 0 };
      for (const r of rows) {
        active.paid += r.activeStandard + r.activeIntroPaid + r.activePromo;
        active.trials += r.activeIntroTrial + (r.activeFreeOffer ?? 0);
        active.billing += r.billingRetry + r.gracePeriod;
      }
    }

    // Ratings: latest snapshot per storefront.
    const ratingRows = await ctx.db.query("appRatings").withIndex("by_app_country_date", (q) => q.eq("appSlug", APP)).collect();
    const latestByCountry = new Map<string, Doc<"appRatings">>();
    for (const r of ratingRows) {
      const cur = latestByCountry.get(r.country);
      if (!cur || r.date > cur.date) latestByCountry.set(r.country, r);
    }
    let ratingSum = 0;
    let rated = 0;
    let ratingCount = 0;
    for (const r of latestByCountry.values()) {
      ratingCount += r.ratingCount;
      if (r.averageRating != null) {
        ratingSum += r.averageRating * r.ratingCount;
        rated += r.ratingCount;
      }
    }

    const reviews = await ctx.db.query("appReviews").withIndex("by_app_created", (q) => q.eq("appSlug", APP)).order("desc").take(200);
    const periodReviews = reviews.filter((r) => r.createdAt.slice(0, 10) >= from && r.createdAt.slice(0, 10) <= to);

    const versions = (await ctx.db.query("appVersions").withIndex("by_app", (q) => q.eq("appSlug", APP)).collect())
      .map((r) => ({ id: r.versionId, version: r.versionString, state: r.appVersionState ?? r.state, platform: r.platform ?? null, releasedAt: r.releasedAt ?? null, createdDate: r.createdDate ?? null, build: r.buildNumber ?? null }))
      .sort((a, b) => (b.releasedAt ?? b.createdDate ?? "").localeCompare(a.releasedAt ?? a.createdDate ?? ""))
      .slice(0, 8);

    return {
      hasSales: !!latestSale,
      latestSaleDay: latestSale?.date ?? null,
      current: totalsOf(sales),
      previous: totalsOf(prevSales),
      series: { x, downloads, proceeds: proceeds.map((n) => Math.round(n * 100) / 100) },
      eventTotals,
      active,
      ratings: { average: rated > 0 ? ratingSum / rated : null, count: ratingCount, storefronts: latestByCountry.size },
      reviews: {
        periodCount: periodReviews.length,
        periodAverage: periodReviews.length ? periodReviews.reduce((s, r) => s + r.rating, 0) / periodReviews.length : null,
        latest: reviews.slice(0, 6).map((r) => ({ id: r.reviewId, rating: r.rating, title: r.title ?? null, body: (r.body ?? "").slice(0, 280), territory: r.territory, createdAt: r.createdAt, nickname: r.nickname ?? null })),
      },
      versions,
    };
  },
});

/** First-time downloads of Cocorise in [from, to] (to spot days where the app is used but Firestore stays silent). */
export const downloadsBetween = authQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    if (from > to) return { downloads: 0 };
    const rows = await loadSales(ctx, from, to, APP);
    return { downloads: rows.reduce((s, r) => s + (r.isDownload ? r.units : 0), 0) };
  },
});
