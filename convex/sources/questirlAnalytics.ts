"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { authAction } from "../lib/auth";
import { missingQuestirlEnv, questirlCacheKey, questirlTtlMs } from "../questirlAnalytics";

// Quest IRL (LifeQuest) analytics, ported from LifeQuest/analytics-dashboard/server.mjs.
// Source: PostHog HogQL query API (read-only SELECTs). Instead of downloading every event with its
// full properties JSON (which hit "504 max execution time"), we fetch only the ~45 properties the
// dashboard reads, in 7-day chunks, then run the exact same aggregation as the old dashboard and
// cache the compact summary in analyticsCache.

type Props = Record<string, unknown>;
type Ev = { event: string; distinct_id: string; timestamp: string; properties: Props };

// Every property the old dashboard reads through prop(). `device_model` also falls back to PostHog's
// `$device_model` (the only `$` property that overlaps, checked against the project's keys).
const PROP_KEYS = [
  "step_id", "step", "step_index", "onboarding_attempt_id", "duration_seconds", "exit_reason",
  "referral_code", "creator_code", "affiliate_code", "invite_code", "referral_code_raw",
  "revenue", "price", "amount", "value", "usd",
  "notification_category", "category", "type", "notification_lifecycle", "lifecycle", "notification_id", "notification_request_id",
  "user_id", "anonymous_id", "device_id", "flow", "analytics_schema_version", "completion_reason",
  "elapsed_since_first_seen_seconds", "is_returning_visit", "page", "screen", "question_id", "answer",
  "dominant_hero", "archetype", "language", "device_model", "selected_goal", "main_pain_point", "granted",
  "onboarding_step_id", "program_day", "copy_variant", "cancelled_count",
] as const;

const DAY = 86400000;
const CHUNK_DAYS = 7;
const ROW_LIMIT = 50000;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquante sur Convex`);
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hogql(query: string): Promise<{ columns: string[]; results: unknown[][] }> {
  const host = env("POSTHOG_QUESTIRL_HOST").replace(/\/$/, "");
  const url = `${host}/api/projects/${env("POSTHOG_QUESTIRL_PROJECT_ID")}/query/`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${env("POSTHOG_QUESTIRL_PERSONAL_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`PostHog ${res.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    return { columns: json.columns ?? [], results: json.results ?? [] };
  }
}

const sqlDateTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

const SELECT_PROPS = PROP_KEYS.map((k, i) =>
  k === "device_model" ? `coalesce(properties.device_model, properties.$device_model) AS p${i}` : `properties.${k} AS p${i}`,
).join(", ");

async function fetchWindow(startMs: number, endMs: number): Promise<Ev[]> {
  const { results } = await hogql(`
    SELECT event, distinct_id, timestamp, ${SELECT_PROPS}
    FROM events
    WHERE timestamp >= toDateTime('${sqlDateTime(startMs)}') AND timestamp < toDateTime('${sqlDateTime(endMs)}')
    ORDER BY timestamp DESC
    LIMIT ${ROW_LIMIT}`);
  if (results.length >= ROW_LIMIT && endMs - startMs > 3600000) {
    // Too many rows for one call: split the window in two (newest half first, keeps DESC order).
    const mid = Math.floor((startMs + endMs) / 2);
    return [...(await fetchWindow(mid, endMs)), ...(await fetchWindow(startMs, mid))];
  }
  return results.map((row) => {
    const properties: Props = {};
    PROP_KEYS.forEach((k, i) => {
      const value = row[3 + i];
      if (value !== null && value !== undefined) properties[k] = value;
    });
    return { event: String(row[0] ?? ""), distinct_id: String(row[1] ?? ""), timestamp: String(row[2] ?? ""), properties };
  });
}

/** All events of [start, end), newest first, fetched in 7-day chunks (3 at a time). */
async function fetchEvents(startMs: number, endMs: number): Promise<Ev[]> {
  const chunks: [number, number][] = [];
  for (let e = endMs; e > startMs; e -= CHUNK_DAYS * DAY) chunks.push([Math.max(startMs, e - CHUNK_DAYS * DAY), e]);
  const out: Ev[][] = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += 3) {
    const batch = chunks.slice(i, i + 3);
    const res = await Promise.all(batch.map(([s, e]) => fetchWindow(s, e)));
    res.forEach((r, j) => (out[i + j] = r));
  }
  return out.flat();
}

/** The latest 80 events with their own (non-$) properties, for the "Events récents" table. */
async function fetchRecent(startMs: number, endMs: number) {
  const { results } = await hogql(`
    SELECT event, distinct_id, timestamp, properties
    FROM events
    WHERE timestamp >= toDateTime('${sqlDateTime(startMs)}') AND timestamp < toDateTime('${sqlDateTime(endMs)}')
    ORDER BY timestamp DESC
    LIMIT 80`);
  return results.map((row) => {
    let props: Props = {};
    try {
      props = typeof row[3] === "string" ? JSON.parse(row[3] as string) : ((row[3] as Props) ?? {});
    } catch {
      props = {};
    }
    const own = Object.fromEntries(Object.entries(props).filter(([k]) => !k.startsWith("$")));
    const page = own.page ?? own.screen ?? own.step_id ?? own.step ?? "";
    const json = JSON.stringify(own);
    return {
      timestamp: String(row[2] ?? ""),
      user: String(row[1] ?? "").slice(0, 12),
      event: String(row[0] ?? ""),
      page: String(page),
      props: json.length > 600 ? `${json.slice(0, 600)}…` : json,
    };
  });
}

/* ------------------------------------------------------------------------------------------- */
/* Aggregation: same logic as LifeQuest/analytics-dashboard/server.mjs (kept close on purpose). */
/* ------------------------------------------------------------------------------------------- */

const prop = (e: Ev, key: string): any => e.properties[key] ?? e.properties[`$${key}`] ?? null;
const numberProp = (e: Ev, key: string) => {
  const n = Number(prop(e, key));
  return Number.isFinite(n) ? n : 0;
};
const booleanProp = (e: Ev, key: string) => {
  const value = prop(e, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
  return Boolean(value);
};
const attemptID = (e: Ev) => String(prop(e, "onboarding_attempt_id") || e.distinct_id || "");
const eventTime = (e: Ev) => {
  const t = new Date(e.timestamp).getTime();
  return Number.isFinite(t) ? t : 0;
};
const eventDate = (e: Ev) => String(e.timestamp || "").slice(0, 10);
const userKey = (e: Ev) => String(e.distinct_id || prop(e, "user_id") || prop(e, "anonymous_id") || prop(e, "device_id") || attemptID(e) || "");
const normalizedReferralCode = (value: unknown) => (value ? String(value).trim().replace(/\s+/g, "").toUpperCase() : "");
const referralCodeFromEvent = (e: Ev) =>
  normalizedReferralCode(prop(e, "referral_code") || prop(e, "creator_code") || prop(e, "affiliate_code") || prop(e, "invite_code"));
const isPurchaseEvent = (e: Ev) =>
  e.event === "paywall_purchased" || e.event === "paywall_restored" || e.event === "purchase_completed" || e.event === "subscription_started";
const isSubscriptionConversionEvent = (e: Ev) => isPurchaseEvent(e) || e.event === "trial_started";
const purchaseValue = (e: Ev) => ["revenue", "price", "amount", "value", "usd"].map((k) => numberProp(e, k)).filter((x) => x > 0)[0] || 0;
const notificationCategory = (e: Ev) => String(prop(e, "notification_category") || prop(e, "category") || prop(e, "type") || "unknown");
const notificationLifecycle = (e: Ev) =>
  String(prop(e, "notification_lifecycle") || prop(e, "lifecycle") || (notificationCategory(e) === "onboarding_rescue" ? "non_converted_onboarding" : "converted_retention"));
const notificationID = (e: Ev) => String(prop(e, "notification_id") || prop(e, "notification_request_id") || `${e.event}:${userKey(e)}:${e.timestamp}`);
const isQuestKept = (e: Ev) => e.event === "quest_kept" || e.event === "quest_completed" || e.event === "mission_kept";
const isQuestPassed = (e: Ev) => e.event === "quest_passed" || e.event === "mission_passed";
const isManualTask = (e: Ev) => e.event === "manual_task_created" || e.event === "manual_task_added" || e.event === "manual_task_sheet_opened";
const isNotifOpen = (e: Ev) => e.event === "notification_opened" || e.event === "notification_action_received";
const stepOf = (e: Ev) => prop(e, "step_id") || prop(e, "step");

function uniqueCount(rows: Ev[], keyFn: (e: Ev) => string) {
  return new Set(rows.map(keyFn).filter(Boolean)).size;
}

function groupCount(rows: Ev[], keyFn: (e: Ev) => unknown): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const k = String(key);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function percentile(values: number[], ratio: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index] * 10) / 10;
}

function calculateRetention(events: Ev[]) {
  const byDate = new Map<string, Set<string>>();
  for (const e of events) {
    const date = eventDate(e);
    if (!date || !e.distinct_id) continue;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date)!.add(e.distinct_id);
  }
  const dates = [...byDate.keys()].sort();
  const latest = dates.at(-1);
  if (!latest) return { d1: 0, d7: 0, latest: null as string | null };
  const latestUsers = byDate.get(latest)!;
  const back = (n: number) => {
    const d = new Date(`${latest}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const d1Users = byDate.get(back(1)) || new Set();
  const d7Users = byDate.get(back(7)) || new Set();
  const rate = (s: Set<string>) => (latestUsers.size ? Math.round(([...latestUsers].filter((id) => s.has(id)).length / latestUsers.size) * 100) : 0);
  return { d1: rate(d1Users), d7: rate(d7Users), latest };
}

function calculateOnboardingDropoff(events: Ev[]) {
  type Row = { stepID: string; stepIndex: number; viewed: number; completed: number; users: Set<string>; attempts: Set<string>; completedAttempts: Set<string>; exits: number; backgroundExits: number; durations: number[] };
  const rows = new Map<string, Row>();
  const ensure = (stepID: unknown, stepIndex: unknown) => {
    if (!stepID) return null;
    const id = String(stepID);
    if (!rows.has(id)) {
      rows.set(id, { stepID: id, stepIndex: Number(stepIndex) || Number.MAX_SAFE_INTEGER, viewed: 0, completed: 0, users: new Set(), attempts: new Set(), completedAttempts: new Set(), exits: 0, backgroundExits: 0, durations: [] });
    }
    const row = rows.get(id)!;
    const numericIndex = Number(stepIndex);
    // Same as the old dashboard: Number(null) is 0, so a missing index pulls the step to 0.
    if (Number.isFinite(numericIndex)) row.stepIndex = Math.min(row.stepIndex, numericIndex);
    return row;
  };
  for (const e of events) {
    if (e.event === "onboarding_screen_viewed") {
      const row = ensure(stepOf(e), prop(e, "step_index"));
      if (!row) continue;
      row.viewed += 1;
      if (e.distinct_id) row.users.add(e.distinct_id);
      if (attemptID(e)) row.attempts.add(attemptID(e));
    }
  }
  for (const e of events) {
    if (e.event === "onboarding_step_completed") {
      const row = ensure(stepOf(e), prop(e, "step_index"));
      if (!row) continue;
      row.completed += 1;
      if (attemptID(e)) row.completedAttempts.add(attemptID(e));
      const d = numberProp(e, "duration_seconds");
      if (d > 0 && d < 600) row.durations.push(d);
    }
  }
  for (const e of events) {
    if (e.event === "onboarding_screen_exited") {
      const row = ensure(stepOf(e), prop(e, "step_index"));
      if (!row) continue;
      row.exits += 1;
      if (prop(e, "exit_reason") === "app_backgrounded") row.backgroundExits += 1;
      const d = numberProp(e, "duration_seconds");
      if (d > 0 && d < 1800) row.durations.push(d);
    }
  }
  const ordered = [...rows.values()].sort((a, b) => a.stepIndex - b.stepIndex || a.stepID.localeCompare(b.stepID));
  return ordered.map((row, index) => {
    const next = ordered[index + 1];
    const nextViewed = next?.attempts.size ?? 0;
    return {
      stepID: row.stepID,
      stepIndex: row.stepIndex === Number.MAX_SAFE_INTEGER ? null : row.stepIndex,
      viewed: row.viewed,
      completed: row.completed,
      users: row.users.size,
      attempts: row.attempts.size,
      completedAttempts: row.completedAttempts.size,
      nextStepID: next?.stepID ?? null,
      nextViewed,
      dropoff: next ? Math.max(0, row.attempts.size - nextViewed) : 0,
      continueRate: row.attempts.size && next ? Math.round((nextViewed / row.attempts.size) * 100) : null,
      completionRate: row.attempts.size ? Math.round((row.completedAttempts.size / row.attempts.size) * 100) : 0,
      avgDuration: row.durations.length ? Math.round((row.durations.reduce((s, x) => s + x, 0) / row.durations.length) * 10) / 10 : 0,
      medianDuration: percentile(row.durations, 0.5),
      p90Duration: percentile(row.durations, 0.9),
      exits: row.exits,
      backgroundExits: row.backgroundExits,
    };
  });
}

function conversionBreakdown(events: Ev[], key: string) {
  type A = { segment: string; started: boolean; completed: boolean; paywallReached: boolean; converted: boolean };
  const attempts = new Map<string, A>();
  const sorted = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  for (const e of sorted) {
    const id = attemptID(e);
    if (!id) continue;
    if (!attempts.has(id)) attempts.set(id, { segment: "unknown", started: false, completed: false, paywallReached: false, converted: false });
    const row = attempts.get(id)!;
    const value = key === "referral_code" ? referralCodeFromEvent(e) : prop(e, key);
    if (value !== null && value !== undefined && String(value).trim()) row.segment = String(value);
    if (e.event === "onboarding_started") row.started = true;
    if (e.event === "onboarding_completed") row.completed = true;
    if (e.event === "onboarding_paywall_reached" || e.event === "paywall_viewed") row.paywallReached = true;
    if (isSubscriptionConversionEvent(e)) row.converted = true;
  }
  const rows = new Map<string, { name: string; started: number; completed: number; paywallReached: number; converted: number }>();
  for (const a of attempts.values()) {
    if (!rows.has(a.segment)) rows.set(a.segment, { name: a.segment, started: 0, completed: 0, paywallReached: 0, converted: 0 });
    const r = rows.get(a.segment)!;
    if (a.started) r.started += 1;
    if (a.completed) r.completed += 1;
    if (a.paywallReached) r.paywallReached += 1;
    if (a.converted) r.converted += 1;
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      completionRate: r.started ? Math.round((r.completed / r.started) * 100) : 0,
      paywallRate: r.started ? Math.round((r.paywallReached / r.started) * 100) : 0,
      conversionRate: r.started ? Math.round((r.converted / r.started) * 100) : 0,
    }))
    .sort((a, b) => b.started - a.started || a.name.localeCompare(b.name))
    .slice(0, 40);
}

function calculateKeyFunnel(events: Ev[]) {
  const viewedIn = (ids: string[]) => (e: Ev) => e.event === "onboarding_screen_viewed" && ids.includes(String(stepOf(e)));
  const stages: { id: string; label: string; matches: (e: Ev) => boolean }[] = [
    { id: "start", label: "Démarrage", matches: (e) => e.event === "onboarding_started" },
    { id: "quiz_identity", label: "Quiz · identité", matches: viewedIn(["character_choice", "age_range", "heard_from"]) },
    { id: "quiz_goals", label: "Quiz · objectifs", matches: viewedIn(["first_domain", "self_description", "seventy_day_result"]) },
    { id: "quiz_heroes", label: "Quiz · héros", matches: viewedIn(["hero_questions_intro", "hero_question", "hero_questions"]) },
    { id: "prepaywall", label: "Pré-paywall", matches: viewedIn(["pre_paywall", "prepaywall", "feature_preview"]) },
    { id: "paywall", label: "Paywall vu", matches: (e) => e.event === "onboarding_paywall_reached" || (e.event === "paywall_viewed" && String(prop(e, "flow") || "").includes("onboarding")) },
    { id: "conversion", label: "Essai / achat", matches: isSubscriptionConversionEvent },
  ];
  const units = new Map<string, Set<number>>();
  for (const e of events) {
    const id = attemptID(e);
    if (!id) continue;
    if (!units.has(id)) units.set(id, new Set());
    const set = units.get(id)!;
    stages.forEach((s, i) => {
      if (s.matches(e)) set.add(i);
    });
  }
  const counts = stages.map((s, i) => ({ id: s.id, label: s.label, count: [...units.values()].filter((set) => set.has(i)).length }));
  const first = counts[0]?.count || 0;
  return counts.map((s, i) => ({
    ...s,
    fromPreviousRate: i === 0 ? 100 : counts[i - 1].count ? Math.round((s.count / counts[i - 1].count) * 100) : 0,
    absoluteRate: first ? Math.round((s.count / first) * 100) : 0,
    dropoffFromPrevious: i === 0 ? 0 : Math.max(0, counts[i - 1].count - s.count),
  }));
}

function referralBreakdown(events: Ev[]) {
  type R = { name: string; submittedUsers: Set<string>; completedUsers: Set<string>; paywallViewers: Set<string>; buyers: Set<string>; attempts: Set<string>; rawCodes: Set<string>; purchaseEvents: number; revenue: number; firstSeenAt: string; latestSeenAt: string };
  const rows = new Map<string, R>();
  const ensure = (code: string) => {
    if (!rows.has(code)) rows.set(code, { name: code, submittedUsers: new Set(), completedUsers: new Set(), paywallViewers: new Set(), buyers: new Set(), attempts: new Set(), rawCodes: new Set(), purchaseEvents: 0, revenue: 0, firstSeenAt: "", latestSeenAt: "" });
    return rows.get(code)!;
  };
  const byUser = new Map<string, Ev[]>();
  for (const e of events) {
    const u = userKey(e);
    if (!u) continue;
    if (!byUser.has(u)) byUser.set(u, []);
    byUser.get(u)!.push(e);
  }
  for (const [user, userEvents] of byUser.entries()) {
    let activeCode = "";
    const sorted = userEvents.sort((a, b) => eventTime(a) - eventTime(b));
    for (const e of sorted) {
      const directCode = referralCodeFromEvent(e);
      const timestamp = String(e.timestamp || "");
      if (directCode) {
        activeCode = directCode;
        const row = ensure(activeCode);
        const raw = prop(e, "referral_code_raw") || prop(e, "referral_code") || directCode;
        if (raw) row.rawCodes.add(String(raw));
        if (e.event === "referral_code_submitted") row.submittedUsers.add(user);
        if (attemptID(e)) row.attempts.add(attemptID(e));
        if (timestamp && (!row.firstSeenAt || timestamp < row.firstSeenAt)) row.firstSeenAt = timestamp;
        if (timestamp && (!row.latestSeenAt || timestamp > row.latestSeenAt)) row.latestSeenAt = timestamp;
      }
      if (!activeCode) continue;
      const row = ensure(activeCode);
      if (attemptID(e)) row.attempts.add(attemptID(e));
      if (timestamp && (!row.latestSeenAt || timestamp > row.latestSeenAt)) row.latestSeenAt = timestamp;
      if (e.event === "onboarding_completed") row.completedUsers.add(user);
      if (e.event === "paywall_viewed") row.paywallViewers.add(user);
      if (isPurchaseEvent(e)) {
        row.buyers.add(user);
        row.purchaseEvents += 1;
        row.revenue += purchaseValue(e);
      }
    }
  }
  return [...rows.values()]
    .map((r) => ({
      name: r.name,
      submitted: r.submittedUsers.size,
      completed: r.completedUsers.size,
      paywallViewers: r.paywallViewers.size,
      buyers: r.buyers.size,
      attempts: r.attempts.size,
      purchaseEvents: r.purchaseEvents,
      revenue: Math.round(r.revenue * 100) / 100,
      rawExamples: [...r.rawCodes].slice(0, 3),
      firstSeenAt: r.firstSeenAt,
      latestSeenAt: r.latestSeenAt,
      conversionRate: r.submittedUsers.size ? Math.round((r.buyers.size / r.submittedUsers.size) * 100) : 0,
      paywallConversionRate: r.paywallViewers.size ? Math.round((r.buyers.size / r.paywallViewers.size) * 100) : 0,
    }))
    .sort((a, b) => b.buyers - a.buyers || b.submitted - a.submitted || a.name.localeCompare(b.name))
    .slice(0, 50);
}

type Opened = { user: string; timestamp: number; category: string; lifecycle: string };

/** Opens per user, sorted, so "was there an open in the window before t" is a binary search. */
function openIndex(opened: Opened[]) {
  const byUser = new Map<string, number[]>();
  for (const o of opened) {
    if (!byUser.has(o.user)) byUser.set(o.user, []);
    byUser.get(o.user)!.push(o.timestamp);
  }
  for (const list of byUser.values()) list.sort((a, b) => a - b);
  return (user: string, t: number, windowMs: number) => {
    const list = byUser.get(user);
    if (!list) return false;
    // Largest open <= t.
    let lo = 0;
    let hi = list.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best >= 0 && t - list[best] <= windowMs;
  };
}

function assistedAfterOpen(events: Ev[], opened: Opened[], predicate: (e: Ev) => boolean, windowMs = 7 * DAY) {
  const hasOpen = openIndex(opened);
  const users = new Set<string>();
  for (const e of events) {
    const u = userKey(e);
    if (!predicate(e) || !u) continue;
    if (hasOpen(u, eventTime(e), windowMs)) users.add(u);
  }
  return users.size;
}

function notificationAnalytics(events: Ev[]) {
  const notificationEvents = events.filter((e) => String(e.event || "").startsWith("notification_") || Boolean(prop(e, "notification_category")));
  type R = { name: string; scheduled: number; opened: number; foreground: number; cancelled: number; scheduleFailures: number; scheduledIDs: Set<string>; openedIDs: Set<string>; usersOpened: Set<string>; latestOpenedAt: string | null };
  const rows = new Map<string, R>();
  const ensure = (category: string) => {
    const name = category || "unknown";
    if (!rows.has(name)) rows.set(name, { name, scheduled: 0, opened: 0, foreground: 0, cancelled: 0, scheduleFailures: 0, scheduledIDs: new Set(), openedIDs: new Set(), usersOpened: new Set(), latestOpenedAt: null });
    return rows.get(name)!;
  };
  for (const e of notificationEvents) {
    const row = ensure(notificationCategory(e));
    if (e.event === "notification_scheduled") {
      const id = notificationID(e);
      if (!row.scheduledIDs.has(id)) {
        row.scheduledIDs.add(id);
        row.scheduled += 1;
      }
    }
    if (isNotifOpen(e)) {
      const id = notificationID(e);
      if (!row.openedIDs.has(id)) {
        row.openedIDs.add(id);
        row.opened += 1;
      }
      if (userKey(e)) row.usersOpened.add(userKey(e));
      const ts = String(e.timestamp || "");
      if (!row.latestOpenedAt || ts > row.latestOpenedAt) row.latestOpenedAt = ts;
    }
    if (e.event === "notification_delivered_foreground") row.foreground += 1;
    if (e.event === "notification_cancelled") row.cancelled += numberProp(e, "cancelled_count") || 1;
    if (e.event === "notification_schedule_failed") row.scheduleFailures += 1;
  }
  const all = [...rows.values()];
  const scheduled = all.reduce((s, r) => s + r.scheduled, 0);
  const opened = all.reduce((s, r) => s + r.opened, 0);
  const foreground = notificationEvents.filter((e) => e.event === "notification_delivered_foreground").length;
  const permissionResults = notificationEvents.filter((e) => e.event === "notification_permission_result");
  const permissionGranted = permissionResults.filter((e) => booleanProp(e, "granted")).length;
  const permissionDenied = permissionResults.filter((e) => prop(e, "granted") === false || prop(e, "granted") === "false").length;
  const openedEvents: Opened[] = notificationEvents
    .filter(isNotifOpen)
    .map((e) => ({ user: userKey(e), timestamp: eventTime(e), category: notificationCategory(e), lifecycle: notificationLifecycle(e) }))
    .filter((o) => o.user && Number.isFinite(o.timestamp));
  return {
    scheduled,
    opened,
    foreground,
    openRate: scheduled ? Math.round((opened / scheduled) * 100) : 0,
    permissionRequests: notificationEvents.filter((e) => e.event === "notification_permission_requested").length,
    permissionResults: permissionResults.length,
    permissionGranted,
    permissionDenied,
    permissionOptInRate: permissionResults.length ? Math.round((permissionGranted / permissionResults.length) * 100) : 0,
    permissionDeniedRate: permissionResults.length ? Math.round((permissionDenied / permissionResults.length) * 100) : 0,
    assistedOnboardingCompleted: assistedAfterOpen(events, openedEvents, (e) => e.event === "onboarding_completed"),
    assistedPaywallPurchased: assistedAfterOpen(events, openedEvents, isPurchaseEvent),
    questCompletedWithin2h: assistedAfterOpen(events, openedEvents, isQuestKept, 2 * 3600000),
    streakProtectedWithin2h: assistedAfterOpen(events, openedEvents.filter((o) => o.category === "streak_reminder"), isQuestKept, 2 * 3600000),
    categories: all
      .map((r) => ({ name: r.name, scheduled: r.scheduled, opened: r.opened, foreground: r.foreground, cancelled: r.cancelled, scheduleFailures: r.scheduleFailures, usersOpened: r.usersOpened.size, latestOpenedAt: r.latestOpenedAt || "", openRate: r.scheduled ? Math.round((r.opened / r.scheduled) * 100) : 0 }))
      .sort((a, b) => b.scheduled - a.scheduled || b.opened - a.opened),
    lifecycleBreakdown: groupCount(notificationEvents, notificationLifecycle),
    copyVariants: groupCount(notificationEvents.filter((e) => e.event === "notification_opened" || e.event === "notification_scheduled"), (e) => prop(e, "copy_variant")).slice(0, 12),
    onboardingByStep: groupCount(notificationEvents.filter((e) => e.event === "notification_opened" && prop(e, "notification_category") === "onboarding_rescue"), (e) => prop(e, "onboarding_step_id")).slice(0, 12),
    retentionByProgramDay: groupCount(notificationEvents.filter((e) => e.event === "notification_opened" && notificationLifecycle(e) === "converted_retention"), (e) => prop(e, "program_day")).slice(0, 20),
  };
}

function notificationAssistedByDate(events: Ev[]) {
  const opened: Opened[] = events.filter(isNotifOpen).map((e) => ({ user: userKey(e), timestamp: eventTime(e), category: "", lifecycle: "" })).filter((o) => o.user && o.timestamp > 0);
  const hasOpen = openIndex(opened);
  const rows = new Map<string, { purchases: Set<string>; quests: Set<string> }>();
  for (const e of events) {
    const u = userKey(e);
    const t = eventTime(e);
    const date = eventDate(e);
    if (!u || !t || !date) continue;
    if (!(isPurchaseEvent(e) || isQuestKept(e))) continue;
    if (!hasOpen(u, t, 2 * 3600000)) continue;
    if (!rows.has(date)) rows.set(date, { purchases: new Set(), quests: new Set() });
    if (isPurchaseEvent(e)) rows.get(date)!.purchases.add(u);
    if (isQuestKept(e)) rows.get(date)!.quests.add(`${u}:${e.timestamp}:${e.event}`);
  }
  return rows;
}

function buildSummary(events: Ev[], range: { from: string; to: string; startMs: number; endMs: number }) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
  const dauDate = iso(now);
  const wauStart = iso(daysAgo(7));
  const mauStart = iso(daysAgo(30));
  const assistedDaily = notificationAssistedByDate(events);

  type D = { date: string; users: Set<string>; events: number; pageViews: number; questsKept: number; onboardingScreens: number; onboardingStarted: number; onboardingCompleted: number; paywallViewed: number; paywallPurchased: number; notificationScheduled: number; notificationOpened: number; notificationForeground: number; notificationCancelled: number };
  const byDate = new Map<string, D>();
  for (const e of events) {
    const date = eventDate(e);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, { date, users: new Set(), events: 0, pageViews: 0, questsKept: 0, onboardingScreens: 0, onboardingStarted: 0, onboardingCompleted: 0, paywallViewed: 0, paywallPurchased: 0, notificationScheduled: 0, notificationOpened: 0, notificationForeground: 0, notificationCancelled: 0 });
    const r = byDate.get(date)!;
    r.events += 1;
    if (e.distinct_id) r.users.add(e.distinct_id);
    if (e.event === "page_view") r.pageViews += 1;
    if (e.event === "onboarding_screen_viewed") r.onboardingScreens += 1;
    if (e.event === "onboarding_started") r.onboardingStarted += 1;
    if (e.event === "onboarding_completed") r.onboardingCompleted += 1;
    if (e.event === "paywall_viewed" || e.event === "onboarding_paywall_reached") r.paywallViewed += 1;
    if (isSubscriptionConversionEvent(e)) r.paywallPurchased += 1;
    if (e.event === "notification_scheduled") r.notificationScheduled += 1;
    if (isNotifOpen(e)) r.notificationOpened += 1;
    if (e.event === "notification_delivered_foreground") r.notificationForeground += 1;
    if (e.event === "notification_cancelled") r.notificationCancelled += numberProp(e, "cancelled_count") || 1;
    if (isQuestKept(e)) r.questsKept += 1;
  }
  const daily = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ users, ...r }) => ({
      ...r,
      activeUsers: users.size,
      notificationAssistedPurchases: assistedDaily.get(r.date)?.purchases.size ?? 0,
      notificationAssistedQuestCompletions: assistedDaily.get(r.date)?.quests.size ?? 0,
    }));

  const activeToday = events.filter((e) => eventDate(e) === dauDate);
  const activeWeek = events.filter((e) => eventDate(e) >= wauStart);
  const activeMonth = events.filter((e) => eventDate(e) >= mauStart);
  const schemaV2Events = events.filter((e) => Number(prop(e, "analytics_schema_version")) >= 2 && prop(e, "flow") === "lifequest_onboarding");
  const onboardingEvents = schemaV2Events.length ? schemaV2Events : events;
  const startedEvents = onboardingEvents.filter((e) => e.event === "onboarding_started");
  const completedEvents = onboardingEvents.filter((e) => e.event === "onboarding_completed" && prop(e, "completion_reason") !== "hard_paywall_reached");
  const closedEvents = onboardingEvents.filter((e) => e.event === "onboarding_closed");
  const onboardingStarted = uniqueCount(startedEvents, attemptID);
  const onboardingCompleted = uniqueCount(completedEvents, attemptID);
  const onboardingClosed = uniqueCount(closedEvents, attemptID);
  const stepDurations = events.filter((e) => e.event === "onboarding_step_completed").map((e) => numberProp(e, "duration_seconds")).filter((x) => x > 0 && x < 600);
  const avgStepDuration = stepDurations.length ? Math.round((stepDurations.reduce((s, x) => s + x, 0) / stepDurations.length) * 10) / 10 : 0;
  const completionDurations = completedEvents.map((e) => numberProp(e, "elapsed_since_first_seen_seconds")).filter((x) => x > 0 && x < 30 * 86400);
  const paywallViews = onboardingEvents.filter((e) => e.event === "paywall_viewed" || e.event === "onboarding_paywall_reached");
  const paywallPurchases = onboardingEvents.filter(isSubscriptionConversionEvent);
  const paywallViewers = uniqueCount(paywallViews, (e) => e.distinct_id);
  const paywallBuyers = uniqueCount(paywallPurchases, (e) => e.distinct_id);
  const resumedAttempts = uniqueCount(onboardingEvents.filter((e) => e.event === "onboarding_session_resumed"), attemptID);
  const returningAttempts = uniqueCount(startedEvents.filter((e) => Boolean(prop(e, "is_returning_visit"))), attemptID);
  const retention = calculateRetention(events);
  const dropoff = calculateOnboardingDropoff(onboardingEvents);
  const notifications = notificationAnalytics(events);
  const answered = onboardingEvents.filter((e) => e.event === "onboarding_question_answered");
  const worstDropoff = dropoff.filter((r) => r.nextStepID).sort((a, b) => b.dropoff - a.dropoff)[0] || null;
  const slowestStep = dropoff.filter((r) => r.medianDuration > 0).sort((a, b) => b.medianDuration - a.medianDuration)[0] || null;
  const latestEventAt = events.map((e) => String(e.timestamp || "")).filter(Boolean).sort().at(-1) || null;

  return {
    generatedAt: now.toISOString(),
    analyticsSchema: schemaV2Events.length ? "v2" : "legacy",
    range: { from: range.from, to: range.to, start: new Date(range.startMs).toISOString(), end: new Date(range.endMs).toISOString() },
    ingestion: { eventCount: events.length, latestEventAt, hasSchemaV2Events: schemaV2Events.length > 0, retentionDay: retention.latest },
    projectID: env("POSTHOG_QUESTIRL_PROJECT_ID"),
    cards: {
      dau: uniqueCount(activeToday, (e) => e.distinct_id),
      wau: uniqueCount(activeWeek, (e) => e.distinct_id),
      mau: uniqueCount(activeMonth, (e) => e.distinct_id),
      users: uniqueCount(events, (e) => e.distinct_id),
      events: events.length,
      pageViews: events.filter((e) => e.event === "page_view").length,
      onboardingStarted,
      onboardingCompleted,
      onboardingClosed,
      onboardingCompletionRate: onboardingStarted ? Math.round((onboardingCompleted / onboardingStarted) * 100) : 0,
      onboardingAbandonmentRate: onboardingStarted ? Math.round((onboardingClosed / onboardingStarted) * 100) : 0,
      returningAttemptRate: onboardingStarted ? Math.round((returningAttempts / onboardingStarted) * 100) : 0,
      resumedAttempts,
      medianCompletionMinutes: Math.round((percentile(completionDurations, 0.5) / 60) * 10) / 10,
      p90CompletionMinutes: Math.round((percentile(completionDurations, 0.9) / 60) * 10) / 10,
      paywallViewers,
      paywallBuyers,
      onboardingPaywallReached: uniqueCount(onboardingEvents.filter((e) => e.event === "onboarding_paywall_reached"), attemptID),
      trialStarted: uniqueCount(onboardingEvents.filter((e) => e.event === "trial_started"), attemptID),
      paywallConversionRate: paywallViewers ? Math.round((paywallBuyers / paywallViewers) * 100) : 0,
      notificationScheduled: notifications.scheduled,
      notificationOpened: notifications.opened,
      notificationOpenRate: notifications.openRate,
      notificationAssistedPurchases: notifications.assistedPaywallPurchased,
      questionsAnswered: events.filter((e) => e.event === "onboarding_question_answered").length,
      avgStepDuration,
      questKept: events.filter(isQuestKept).length,
      questPassed: events.filter(isQuestPassed).length,
      manualTasks: events.filter(isManualTask).length,
      d1Retention: retention.d1,
      d7Retention: retention.d7,
    },
    daily,
    eventCounts: groupCount(events, (e) => e.event).slice(0, 40),
    pages: groupCount(events, (e) => prop(e, "page") || prop(e, "screen") || stepOf(e)).slice(0, 40),
    steps: groupCount(onboardingEvents.filter((e) => e.event === "onboarding_screen_viewed"), stepOf).slice(0, 60),
    dropoff,
    questions: groupCount(answered, (e) => prop(e, "question_id")).slice(0, 40),
    answers: groupCount(answered, (e) => {
      const q = prop(e, "question_id");
      const a = prop(e, "answer");
      return q && a ? `${q} · ${a}` : null;
    }).slice(0, 60),
    heroes: groupCount(events, (e) => prop(e, "dominant_hero") || prop(e, "archetype")).slice(0, 20),
    sources: groupCount(answered.filter((e) => prop(e, "question_id") === "heard_from"), (e) => prop(e, "answer")).slice(0, 20),
    languages: conversionBreakdown(onboardingEvents, "language"),
    devices: conversionBreakdown(onboardingEvents, "device_model"),
    selectedGoals: conversionBreakdown(onboardingEvents, "selected_goal"),
    painPoints: conversionBreakdown(onboardingEvents, "main_pain_point"),
    referralSegments: conversionBreakdown(onboardingEvents, "referral_code"),
    dominantHeroes: conversionBreakdown(onboardingEvents, "dominant_hero"),
    referrals: referralBreakdown(onboardingEvents),
    notifications,
    keyFunnel: calculateKeyFunnel(onboardingEvents),
    funnelHealth: { worstDropoff, slowestStep },
  };
}

/* ------------------------------------------------------------------------------------------- */

const windowArgs = { from: v.string(), to: v.string(), force: v.optional(v.boolean()) };
type WindowArgs = { from: string; to: string; force?: boolean };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function refreshSummary(ctx: ActionCtx, { from, to, force }: WindowArgs) {
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw new Error("Période invalide");
  const missing = missingQuestirlEnv();
  if (missing.length) return { ok: false as const, error: `Variables manquantes : ${missing.join(", ")}` };
  const key = questirlCacheKey("summary", from, to);
  if (!force) {
    const existing = await ctx.runQuery(internal.questirlAnalytics.getEntry, { key });
    if (existing?.payload != null && Date.now() - existing.fetchedAt < questirlTtlMs(to)) return { ok: true as const, cached: true };
  }
  const startMs = Date.parse(`${from}T00:00:00Z`);
  const endMs = Math.min(Date.now(), Date.parse(`${to}T00:00:00Z`) + DAY);
  try {
    const [events, recentEvents] = await Promise.all([fetchEvents(startMs, endMs), fetchRecent(startMs, endMs)]);
    const payload = JSON.parse(JSON.stringify({ ...buildSummary(events, { from, to, startMs, endMs }), recentEvents }));
    await ctx.runMutation(internal.questirlAnalytics.putEntry, { key, payload, fetchedAt: Date.now() });
    return { ok: true as const, cached: false, events: events.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.questirlAnalytics.putEntry, { key, error: message.slice(0, 500), fetchedAt: Date.now() });
    return { ok: false as const, error: message };
  }
}

/** Called by the page when its cache entry is missing or older than the TTL (or on "Rafraîchir"). */
export const refresh = authAction({ args: windowArgs, handler: (ctx, args) => refreshSummary(ctx, args) });

/** CLI: npx convex run sources/questirlAnalytics:refreshInternal '{"from":"2026-09-25","to":"2026-10-24","force":true}' */
export const refreshInternal = internalAction({ args: windowArgs, handler: (ctx, args) => refreshSummary(ctx, args) });
