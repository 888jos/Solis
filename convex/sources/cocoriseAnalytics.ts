"use node";

import { createSign } from "node:crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import {
  boundsKey,
  dayKey,
  daysIndexKey,
  daysOf,
  effectiveRange,
  oneSignalKey,
  parisDay,
  parisMidnight,
  PROJECT_ID,
  reportKey,
  TTL_BOUNDS_MS,
  TTL_ONESIGNAL_MS,
  ttlFor,
  type Bounds,
  type DaysIndex,
  type FirestoreReport,
  type FreeWakeupRow,
  type NotificationTypeRow,
  type OneSignalPayload,
} from "../cocoriseAnalytics";
import { authAction } from "../lib/auth";
import { addDays } from "../lib/dates";

// Cocorise live analytics. READ-ONLY.
//  - Firestore REST API (project snapwake-33207) with the service account in COCORISE_FIREBASE_SA_B64
//    (base64 of the JSON key). Same aggregation as the old local dashboard
//    (CocoRise/analytics-local-dashboard/server.mjs, aggregateOnboarding), streamed page by page.
//  - OneSignal REST API GET endpoints with ONESIGNAL_COCORISE_APP_ID / ONESIGNAL_COCORISE_REST_API_KEY.
// Results go to analyticsCache; convex/cocoriseAnalytics.ts serves them to the UI.

const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const PAGE_SIZE = 5000;
const MAX_USER_ROWS = 300;

/* ---------------- Google auth ---------------- */

type ServiceAccount = { client_email: string; private_key: string; project_id: string };
let tokenCache: { token: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount {
  const b64 = process.env.COCORISE_FIREBASE_SA_B64;
  if (!b64) throw new Error("COCORISE_FIREBASE_SA_B64 manquante sur Convex");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function googleToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function firestorePost(path: string, body: unknown): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${FIRESTORE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      const quota = text.includes("RESOURCE_EXHAUSTED") || text.includes("Quota exceeded");
      throw new Error(quota ? "Quota Firestore dépassé (lectures du jour). Réessayer après la remise à zéro du quota." : `Firestore ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text);
  }
}

/* ---------------- Firestore values ---------------- */

type Value = Record<string, any>;
function decode(value: Value | undefined): unknown {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return Date.parse(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x as Value)]));
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map((x: Value) => decode(x));
  return undefined;
}
const decodeFields = (fields: Record<string, Value> | undefined) => Object.fromEntries(Object.entries(fields ?? {}).map(([k, x]) => [k, decode(x)])) as Record<string, any>;

const EVENT_FIELDS = [
  "user_id", "event_name", "timestamp", "step_name", "last_step", "screen_name", "screen", "flow", "price", "button_name",
  "notification_type", "notification_id", "freeWakeupLimit", "freeWakeupsCompleted", "remainingFreeWakeups", "freeAlarmCreated",
  "freeAlarmUsed", "isPremium", "question_index", "answer",
];

/** Streams analytics_events with timestamp in [startMs, endMs) to `onEvent`, ordered by timestamp. Returns docs read. */
async function streamEvents(startMs: number, endMs: number, onEvent: (e: Record<string, any>) => void): Promise<number> {
  let cursor: Value[] | null = null;
  let read = 0;
  for (;;) {
    const structuredQuery: any = {
      from: [{ collectionId: "analytics_events" }],
      select: { fields: EVENT_FIELDS.map((fieldPath) => ({ fieldPath })) },
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "timestamp" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: new Date(startMs).toISOString() } } },
            { fieldFilter: { field: { fieldPath: "timestamp" }, op: "LESS_THAN", value: { timestampValue: new Date(endMs).toISOString() } } },
          ],
        },
      },
      orderBy: [
        { field: { fieldPath: "timestamp" }, direction: "ASCENDING" },
        { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
      ],
      limit: PAGE_SIZE,
    };
    if (cursor) structuredQuery.startAt = { values: cursor, before: false };
    const rows: any[] = await firestorePost(":runQuery", { structuredQuery });
    const docs = rows.filter((r) => r.document).map((r) => r.document);
    for (const doc of docs) onEvent(decodeFields(doc.fields));
    read += docs.length;
    if (docs.length < PAGE_SIZE) return read;
    const last = docs[docs.length - 1];
    cursor = [last.fields.timestamp, { referenceValue: last.name }];
  }
}

async function edgeEvent(direction: "ASCENDING" | "DESCENDING"): Promise<number | null> {
  const rows: any[] = await firestorePost(":runQuery", {
    structuredQuery: {
      from: [{ collectionId: "analytics_events" }],
      select: { fields: [{ fieldPath: "timestamp" }] },
      orderBy: [{ field: { fieldPath: "timestamp" }, direction }],
      limit: 1,
    },
  });
  const doc = rows.find((r) => r.document)?.document;
  const ts = doc ? decode(doc.fields?.timestamp) : null;
  return typeof ts === "number" ? ts : null;
}

/** users/{id} profile fields used by the free-wakeups table (createdAt, lastLoginAt, authProvider). */
async function loadUsers(ids: string[]): Promise<Map<string, Record<string, any>>> {
  const out = new Map<string, Record<string, any>>();
  const base = `projects/${PROJECT_ID}/databases/(default)/documents/users/`;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const rows: any[] = await firestorePost(":batchGet", { documents: batch.map((id) => base + id), mask: { fieldPaths: ["createdAt", "lastLoginAt", "authProvider"] } });
    for (const r of rows) {
      if (!r.found) continue;
      out.set(r.found.name.slice(base.length), decodeFields(r.found.fields));
    }
  }
  return out;
}

/* ---------------- aggregation (port of server.mjs aggregateOnboarding) ---------------- */
// The Firestore project is on the free Spark plan (50k document reads per day) and the history holds more
// events than that, so events are read ONE DAY AT A TIME into a mergeable partial aggregate (named sets of
// user ids, additive counters, per-user free-wakeup state). Closed days are read once, ever; a period
// report is the merge of its days. If the daily quota runs out, loading resumes by itself later.

const SOURCE_IDS = ["tiktok", "instagram", "youtube", "app_store", "friend", "other"];

function inferStepName(e: Record<string, any>): string | null {
  if (typeof e.step_name === "string" && e.step_name.length > 0) return e.step_name;
  if (typeof e.last_step === "string" && e.last_step.length > 0) return e.last_step;
  if (e.event_name === "onboarding_completed") return "completed";
  if (typeof e.screen_name === "string" && e.screen_name.startsWith("onboarding_")) return e.screen_name.replace(/^onboarding_/, "");
  if (typeof e.screen === "string" && e.screen.startsWith("onboarding_")) return e.screen.replace(/^onboarding_/, "");
  if (typeof e.event_name === "string" && e.event_name.startsWith("onboarding_step_")) return e.event_name.replace("onboarding_step_", "");
  return null;
}

function isOnboardingEvent(e: Record<string, any>): boolean {
  return (
    e.flow === "onboarding" ||
    (typeof e.event_name === "string" && e.event_name.startsWith("onboarding_")) ||
    (typeof e.screen_name === "string" && e.screen_name.startsWith("onboarding_")) ||
    (typeof e.screen === "string" && e.screen.startsWith("onboarding_"))
  );
}

type FreeUser = {
  userId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  limit: number;
  completed: number;
  remaining: number | null;
  remainingAt: number; // timestamp of the event that set `remaining` (latest wins)
  premium: boolean;
  sawSoftPaywall: boolean;
  hitLimitPaywall: boolean;
  continuedFree: boolean;
};

/** Serializable partial aggregate (one day, or a merge of days). */
type Partial = {
  totalEvents: number;
  trackedRevenue: number;
  eventCounts: Record<string, number>;
  buttonCounts: Record<string, number>;
  sets: Record<string, string[]>;
  free: FreeUser[];
};

// Set names: all, onb, install, started, completed, auth, paywall, pwViewed, purchased,
// step:<id>, src:<id>, dS:<day>, dC:<day>, nS:<type[:id]>, nO:<type[:id]>, nF:<type[:id]>.
class Aggregator {
  totalEvents = 0;
  trackedRevenue = 0;
  eventCounts = new Map<string, number>();
  buttonCounts = new Map<string, number>();
  sets = new Map<string, Set<string>>();
  free = new Map<string, FreeUser>();

  set(name: string): Set<string> {
    let s = this.sets.get(name);
    if (!s) this.sets.set(name, (s = new Set()));
    return s;
  }
  size(name: string): number {
    return this.sets.get(name)?.size ?? 0;
  }
  private inc(map: Map<string, number>, key: string, by = 1) {
    map.set(key, (map.get(key) ?? 0) + by);
  }
  private mergeFree(u: FreeUser) {
    const cur = this.free.get(u.userId);
    if (!cur) {
      this.free.set(u.userId, { ...u });
      return;
    }
    cur.firstSeenAt = Math.min(cur.firstSeenAt, u.firstSeenAt);
    cur.lastSeenAt = Math.max(cur.lastSeenAt, u.lastSeenAt);
    cur.limit = Math.max(cur.limit, u.limit);
    cur.completed = Math.max(cur.completed, u.completed);
    if (u.remaining != null && (cur.remaining == null || u.remainingAt >= cur.remainingAt)) {
      cur.remaining = u.remaining;
      cur.remainingAt = u.remainingAt;
    }
    cur.premium ||= u.premium;
    cur.sawSoftPaywall ||= u.sawSoftPaywall;
    cur.hitLimitPaywall ||= u.hitLimitPaywall;
    cur.continuedFree ||= u.continuedFree;
  }

  add(e: Record<string, any>) {
    this.totalEvents++;
    const userId = String(e.user_id ?? "");
    const eventName = String(e.event_name ?? "unknown");
    const ts = typeof e.timestamp === "number" ? e.timestamp : null;
    const step = inferStepName(e);
    if (!userId || ts == null) return;

    this.set("all").add(userId);
    this.inc(this.eventCounts, eventName);
    if (eventName === "app_first_opened") this.set("install").add(userId);
    if (eventName === "paywall_viewed") this.set("pwViewed").add(userId);
    if (eventName === "subscription_purchased") {
      this.set("purchased").add(userId);
      this.trackedRevenue += Number(e.price ?? 0) || 0;
    }
    if (e.button_name) this.inc(this.buttonCounts, String(e.button_name));

    const nType = typeof e.notification_type === "string" ? e.notification_type : null;
    const nId = typeof e.notification_id === "string" ? e.notification_id : null;
    const prefix = eventName === "notification_scheduled" ? "nS:" : eventName === "notification_opened" ? "nO:" : eventName === "notification_presented_foreground" ? "nF:" : null;
    if (prefix && nType) {
      this.set(prefix + nType).add(userId);
      if (nId) this.set(`${prefix}${nType}:${nId}`).add(userId);
    }

    const u: FreeUser = {
      userId,
      firstSeenAt: ts,
      lastSeenAt: ts,
      limit: typeof e.freeWakeupLimit === "number" ? e.freeWakeupLimit || 0 : 0,
      completed: Math.max(typeof e.freeWakeupsCompleted === "number" ? e.freeWakeupsCompleted || 0 : 0, eventName === "free_alarm_completed" ? 1 : 0),
      remaining: typeof e.remainingFreeWakeups === "number" ? e.remainingFreeWakeups : null,
      remainingAt: ts,
      premium: (typeof e.isPremium === "boolean" && e.isPremium) || eventName === "premium_unlocked",
      sawSoftPaywall: eventName === "onboarding_soft_paywall_shown",
      hitLimitPaywall: eventName === "free_alarm_limit_hit" || eventName === "post_first_alarm_paywall_shown",
      continuedFree: eventName === "continued_with_free_alarm",
    };
    this.mergeFree(u);

    if (!isOnboardingEvent(e)) return;
    this.set("onb").add(userId);
    if (step) {
      this.set(`step:${step}`).add(userId);
      if (step === "auth") this.set("auth").add(userId);
      if (step === "paywall") this.set("paywall").add(userId);
    }
    if (eventName === "onboarding_started") {
      this.set("started").add(userId);
      this.set(`dS:${parisDay(ts)}`).add(userId);
    }
    if (eventName === "onboarding_completed") {
      this.set("completed").add(userId);
      this.set(`dC:${parisDay(ts)}`).add(userId);
      this.set("step:completed").add(userId);
    }
    if (eventName === "onboarding_question_answered" && Number(e.question_index) === 20) {
      const source = String(e.answer ?? "").trim();
      if (SOURCE_IDS.includes(source)) this.set(`src:${source}`).add(userId);
    }
  }

  toPartial(): Partial {
    return {
      totalEvents: this.totalEvents,
      trackedRevenue: this.trackedRevenue,
      eventCounts: Object.fromEntries(this.eventCounts),
      buttonCounts: Object.fromEntries(this.buttonCounts),
      sets: Object.fromEntries([...this.sets].map(([k, s]) => [k, [...s]])),
      free: [...this.free.values()],
    };
  }

  merge(p: Partial) {
    this.totalEvents += p.totalEvents;
    this.trackedRevenue += p.trackedRevenue;
    for (const [k, n] of Object.entries(p.eventCounts)) this.inc(this.eventCounts, k, n);
    for (const [k, n] of Object.entries(p.buttonCounts)) this.inc(this.buttonCounts, k, n);
    for (const [k, ids] of Object.entries(p.sets)) {
      const s = this.set(k);
      for (const id of ids) s.add(id);
    }
    for (const u of p.free) this.mergeFree(u);
  }

  /** Users that need a profile lookup (the free-wakeups rows). */
  freeCandidates(): FreeUser[] {
    return [...this.free.values()].filter((u) => u.limit > 0 || u.sawSoftPaywall || u.completed > 0);
  }

  finish(from: string, to: string, profiles: Map<string, Record<string, any>>): Omit<FirestoreReport, "coverage"> {
    const rows = this.freeCandidates().map((u) => {
      const profile = profiles.get(u.userId) ?? null;
      const createdAt = typeof profile?.createdAt === "number" ? profile.createdAt : null;
      const lastLoginAt = typeof profile?.lastLoginAt === "number" ? profile.lastLoginAt : null;
      const completed = Math.max(0, u.completed);
      const remaining = u.remaining == null ? Math.max(0, u.limit - completed) : Math.max(0, u.remaining);
      const row: FreeWakeupRow = {
        userId: u.userId,
        firstSeenAt: u.firstSeenAt,
        lastSeenAt: u.lastSeenAt,
        limit: u.limit,
        completed,
        remaining,
        premium: u.premium,
        reconnected: createdAt != null && lastLoginAt != null && lastLoginAt - createdAt > 5 * 60_000,
        provider: typeof profile?.authProvider === "string" ? profile.authProvider : "anonymous",
        hasProfile: !!profile,
      };
      return { row, u };
    });
    rows.sort((a, b) => b.row.completed - a.row.completed || b.row.lastSeenAt - a.row.lastSeenAt);
    const r = rows.map((x) => x.row);
    const freeTotals = {
      users: r.length,
      assigned: r.filter((x) => x.limit > 0).length,
      withRemaining: r.filter((x) => x.remaining > 0).length,
      exhausted: r.filter((x) => x.remaining === 0 && x.limit > 0).length,
      completedAtLeastOne: r.filter((x) => x.completed > 0).length,
      totalCompleted: r.reduce((s, x) => s + x.completed, 0),
      premiumUnlocked: r.filter((x) => x.premium).length,
      reconnected: r.filter((x) => x.reconnected).length,
    };
    const freeFunnel = [
      { id: "soft_paywall_seen", users: rows.filter((x) => x.u.sawSoftPaywall).length },
      { id: "continued_free", users: rows.filter((x) => x.u.continuedFree).length },
      { id: "completed_free", users: freeTotals.completedAtLeastOne },
      { id: "limit_reached", users: rows.filter((x) => x.u.hitLimitPaywall || (x.row.limit > 0 && x.row.remaining === 0)).length },
      { id: "premium_unlocked", users: freeTotals.premiumUnlocked },
    ];

    const freeCompleted = new Set(r.filter((x) => x.completed > 0).map((x) => x.userId));
    const premiumUsers = new Set(r.filter((x) => x.premium).map((x) => x.userId));
    const authProfiles = new Set(r.filter((x) => x.hasProfile).map((x) => x.userId));
    const completedUsers = this.sets.get("completed") ?? new Set<string>();
    const names = [...this.sets.keys()];
    const notifKeys = (prefix: string) => names.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    const empty = new Set<string>();
    const countIn = (users: Set<string>, pool: Set<string>) => [...users].filter((u) => pool.has(u)).length;
    const types = [...new Set([...notifKeys("nS:"), ...notifKeys("nO:"), ...notifKeys("nF:")].filter((k) => !k.includes(":")))];
    const byType: NotificationTypeRow[] = types
      .map((type) => {
        const opened = this.sets.get(`nO:${type}`) ?? empty;
        return {
          type,
          scheduled: this.size(`nS:${type}`),
          opened: opened.size,
          foreground: this.size(`nF:${type}`),
          openedThenCompleted: countIn(opened, completedUsers),
          openedThenFreeWakeup: countIn(opened, freeCompleted),
          openedThenPremium: countIn(opened, premiumUsers),
          openedThenAuth: countIn(opened, authProfiles),
        };
      })
      .sort((a, b) => b.opened - a.opened);
    const campaigns = [...new Set([...notifKeys("nS:"), ...notifKeys("nO:")].filter((k) => k.includes(":")))];
    const byCampaign = campaigns
      .map((key) => {
        const [type, ...rest] = key.split(":");
        const opened = this.sets.get(`nO:${key}`) ?? empty;
        return { type, id: rest.join(":"), scheduled: this.size(`nS:${key}`), opened: opened.size, openedThenPremium: countIn(opened, premiumUsers) };
      })
      .sort((a, b) => b.opened - a.opened)
      .slice(0, 16);
    const union = (prefix: string) => new Set(names.filter((k) => k.startsWith(prefix)).flatMap((k) => [...this.sets.get(k)!])).size;
    const started = this.sets.get("started") ?? empty;
    const days = [...new Set(names.filter((k) => k.startsWith("dS:") || k.startsWith("dC:")).map((k) => k.slice(3)))].sort();

    return {
      from,
      to,
      eventsRead: this.totalEvents,
      totals: {
        totalEvents: this.totalEvents,
        totalUsers: this.size("all"),
        installs: this.size("install"),
        installsStartedOnboarding: countIn(this.sets.get("install") ?? empty, started),
        onboardingUsers: this.size("onb"),
        started: started.size,
        completed: completedUsers.size,
        authReached: this.size("auth"),
        paywallReached: this.size("paywall"),
        paywallViewed: this.size("pwViewed"),
        purchased: this.size("purchased"),
        trackedRevenue: Math.round(this.trackedRevenue * 100) / 100,
      },
      steps: names.filter((k) => k.startsWith("step:")).map((k) => ({ id: k.slice(5), users: this.size(k) })),
      sources: SOURCE_IDS.map((id) => ({ id, users: this.size(`src:${id}`) })),
      daily: days.map((date) => ({ date, started: this.size(`dS:${date}`), completed: this.size(`dC:${date}`) })),
      topButtons: [...this.buttonCounts].map(([button, count]) => ({ button, count })).sort((a, b) => b.count - a.count).slice(0, 12),
      eventCounts: [...this.eventCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 40),
      freeWakeups: { totals: freeTotals, funnel: freeFunnel, users: r.slice(0, MAX_USER_ROWS), userCount: r.length },
      notifications: {
        totals: { typesTracked: byType.length, scheduledUsers: union("nS:"), openedUsers: union("nO:"), foregroundUsers: union("nF:") },
        byType,
        byCampaign,
      },
    };
  }
}

/* ---------------- loading days ---------------- */

const LOAD_BUDGET_MS = 7 * 60_000;
const QUOTA_RETRY_MS = 2 * 60 * 60_000;
const isQuota = (msg: string) => msg.startsWith("Quota Firestore");

async function ensureBounds(ctx: ActionCtx, force: boolean): Promise<Bounds> {
  const row = await ctx.runQuery(internal.cocoriseAnalytics.getCache, { key: boundsKey() });
  if (!force && row?.payload && Date.now() - row.fetchedAt <= TTL_BOUNDS_MS) return row.payload as Bounds;
  const [first, last] = await Promise.all([edgeEvent("ASCENDING"), edgeEvent("DESCENDING")]);
  const bounds: Bounds = { firstDay: first != null ? parisDay(first) : null, lastDay: last != null ? parisDay(last) : null, lastEventAt: last };
  await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key: boundsKey(), payload: bounds });
  return bounds;
}

/** Reads one Paris day of events from Firestore into a partial aggregate. */
async function loadDay(day: string): Promise<Partial> {
  const agg = new Aggregator();
  await streamEvents(parisMidnight(day), parisMidnight(addDays(day, 1)), (e) => agg.add(e));
  return agg.toPartial();
}

/** Days of the list whose partial is missing or stale (recent days refresh every 15 min, closed days never). */
async function daysToLoad(ctx: ActionCtx, days: string[], force: boolean): Promise<string[]> {
  const index = ((await ctx.runQuery(internal.cocoriseAnalytics.getCache, { key: daysIndexKey() }))?.payload as DaysIndex | null) ?? { days: {} };
  const yesterday = addDays(parisDay(Date.now()), -1);
  // `force` re-reads only today/yesterday: closed days never change and re-reading them would burn the quota.
  return days.filter((d) => {
    const at = index.days[d];
    if (!at) return true;
    return force ? d >= yesterday : Date.now() - at > ttlFor(d);
  });
}

/**
 * Loads missing days (oldest first) until done, out of time or out of Firestore quota.
 * Returns what is still missing and the error that stopped it, if any.
 */
async function fillDays(ctx: ActionCtx, days: string[], force: boolean): Promise<{ missing: string[]; error: string | null; busy: boolean }> {
  const todo = await daysToLoad(ctx, days, force);
  if (!todo.length) return { missing: [], error: null, busy: false };
  const claimed = await ctx.runMutation(internal.cocoriseAnalytics.backfillLease, { op: "claim" });
  if (!claimed) return { missing: todo, error: null, busy: true };
  const started = Date.now();
  let error: string | null = null;
  let done = 0;
  try {
    for (const day of todo) {
      if (Date.now() - started > LOAD_BUDGET_MS) break;
      const partial = await loadDay(day);
      await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key: dayKey(day), payload: partial });
      await ctx.runMutation(internal.cocoriseAnalytics.markDay, { day });
      done++;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const missing = todo.slice(done);
  // Resume by itself: right away when out of time, in 2 h when out of quota (Spark quota resets daily).
  let scheduledFor: number | null = null;
  if (missing.length && (!error || isQuota(error))) {
    const delay = error ? QUOTA_RETRY_MS : 0;
    scheduledFor = Date.now() + delay;
    await ctx.scheduler.runAfter(delay, internal.sources.cocoriseAnalytics.resumeBackfill, {});
  }
  await ctx.runMutation(internal.cocoriseAnalytics.backfillLease, { op: "release", lastError: error, scheduledFor });
  return { missing, error, busy: false };
}

/** Merges the cached partials of [from, to] and resolves the free-wakeup profiles. */
async function buildReport(ctx: ActionCtx, from: string, to: string): Promise<FirestoreReport> {
  const agg = new Aggregator();
  const days = daysOf(from, to);
  let loaded = 0;
  let missingFrom: string | null = null;
  for (const day of days) {
    const row = await ctx.runQuery(internal.cocoriseAnalytics.getCache, { key: dayKey(day) });
    if (row?.payload) {
      agg.merge(row.payload as Partial);
      loaded++;
    } else missingFrom ??= day;
  }
  const profiles = await loadUsers(agg.freeCandidates().map((u) => u.userId));
  return { ...agg.finish(from, to, profiles), coverage: { loaded, total: days.length, missingFrom } };
}

/** Scheduled continuation: loads every missing day of the whole history. */
export const resumeBackfill = internalAction({
  args: {},
  handler: async (ctx) => {
    const bounds = await ensureBounds(ctx, false);
    if (!bounds.firstDay || !bounds.lastDay) return;
    await fillDays(ctx, daysOf(bounds.firstDay, bounds.lastDay), false);
  },
});

/**
 * Refreshes the cached Firestore report for the period (clamped to the days that hold events):
 * loads the missing days, then merges them. Skips work when the report is still fresh, unless `force`.
 */
export const refreshFirestore = authAction({
  args: { from: v.string(), to: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { from, to, force }): Promise<{ status: string; missingDays?: number; eventsRead?: number; error?: string }> => {
    let key = boundsKey();
    try {
      const bounds = await ensureBounds(ctx, !!force);
      const range = effectiveRange(from, to, bounds);
      if (!range) return { status: "empty" };
      key = reportKey(range.from, range.to);
      const row = await ctx.runQuery(internal.cocoriseAnalytics.getCache, { key });
      if (!force && row?.payload && Date.now() - row.fetchedAt <= ttlFor(range.to)) return { status: "fresh" };
      const fill = await fillDays(ctx, daysOf(range.from, range.to), !!force);
      const prevLoaded = (row?.payload as FirestoreReport | null)?.coverage?.loaded ?? -1;
      const loadedNow = daysOf(range.from, range.to).length - fill.missing.length;
      // Partial report from the days already loaded (rebuilt only when more days arrived).
      if (fill.missing.length && loadedNow <= prevLoaded) {
        if (fill.error) await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key, error: fill.error });
        return { status: fill.busy ? "busy" : fill.error ? "error" : "partial", missingDays: fill.missing.length, error: fill.error ?? undefined };
      }
      if (loadedNow === 0) {
        if (fill.error) await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key, error: fill.error });
        return { status: fill.error ? "error" : "partial", missingDays: fill.missing.length, error: fill.error ?? undefined };
      }
      const report = await buildReport(ctx, range.from, range.to);
      await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key, payload: report });
      return { status: fill.missing.length ? "partial" : "fetched", missingDays: fill.missing.length, eventsRead: report.eventsRead };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key, error });
      return { status: "error", error };
    }
  },
});

/* ---------------- OneSignal ---------------- */

async function oneSignalGet(path: string): Promise<any> {
  const key = process.env.ONESIGNAL_COCORISE_REST_API_KEY;
  if (!key) throw new Error("ONESIGNAL_COCORISE_REST_API_KEY manquante sur Convex");
  const res = await fetch(`https://api.onesignal.com${path}`, { headers: { Authorization: `Key ${key}` } });
  if (!res.ok) throw new Error(`OneSignal ${res.status} sur ${path.split("?")[0]}`);
  return res.json();
}

export const refreshOneSignal = authAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<{ status: string; error?: string }> => {
    const key = oneSignalKey();
    try {
      const appId = process.env.ONESIGNAL_COCORISE_APP_ID;
      if (!appId) throw new Error("ONESIGNAL_COCORISE_APP_ID manquante sur Convex");
      const row = await ctx.runQuery(internal.cocoriseAnalytics.getCache, { key });
      if (!force && row?.payload && Date.now() - row.fetchedAt <= TTL_ONESIGNAL_MS) return { status: "fresh" };
      const app = await oneSignalGet(`/apps/${appId}`);
      const list = await oneSignalGet(`/notifications?app_id=${appId}&limit=50&total_count=true`);
      let clicks30d: number | null = null;
      try {
        const outcomes = await oneSignalGet(`/apps/${appId}/outcomes?outcome_names=os__click.count&outcome_time_range=1mo&outcome_platforms=0`);
        clicks30d = Number(outcomes?.outcomes?.find((o: any) => o.id === "os__click")?.value ?? 0);
      } catch {
        clicks30d = null;
      }
      // Only these fields are kept: the /apps response also carries push credentials that must never be stored.
      const payload: OneSignalPayload = {
        appName: typeof app?.name === "string" ? app.name : null,
        players: Number(app?.players ?? 0),
        messageablePlayers: Number(app?.messageable_players ?? 0),
        createdAt: typeof app?.created_at === "string" ? app.created_at : null,
        notificationsTotal: Number(list?.total_count ?? 0),
        clicks30d,
        notifications: (list?.notifications ?? []).slice(0, 50).map((n: any) => ({
          id: String(n.id),
          name: String(n.name || n.headings?.fr || n.headings?.en || n.contents?.fr || n.contents?.en || "Sans titre").slice(0, 120),
          sentAt: typeof n.completed_at === "number" ? n.completed_at * 1000 : typeof n.send_after === "number" ? n.send_after * 1000 : null,
          successful: Number(n.successful ?? 0),
          failed: Number(n.failed ?? 0),
          errored: Number(n.errored ?? 0),
          converted: Number(n.converted ?? 0),
          received: n.received == null ? null : Number(n.received),
        })),
      };
      await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key, payload });
      return { status: "fetched" };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.cocoriseAnalytics.putCache, { key, error });
      return { status: "error", error };
    }
  },
});
