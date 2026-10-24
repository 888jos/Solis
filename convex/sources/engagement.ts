"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { addDays, isoDay } from "../lib/dates";

// Engagement sync: daily active / new users, sessions, rolling 30-day actives and daily retention cohorts.
// CortiFree → Amplitude Dashboard REST API (GET only). Quest IRL → PostHog HogQL query API (read-only query).
// Cocorise sends its events to Google Analytics for Firebase (GA4); no GA4 Data API access is configured.

type DailyRow = { date: string; activeUsers: number; newUsers: number; sessions?: number; activeUsers30d?: number };
type CohortRow = { cohortStart: string; cohortSize: number; d1Users?: number; d7Users?: number; d30Users?: number };
type Result = { daily: DailyRow[]; cohorts: CohortRow[] };

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquante sur Convex`);
  return value;
}

const compact = (day: string) => day.replaceAll("-", "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Amplitude (CortiFree) ---------------- */

async function amplitudeGet(path: string, params: Record<string, string>): Promise<any> {
  const base = (process.env.AMPLITUDE_API_BASE_URL || "https://amplitude.com").replace(/\/$/, "");
  const auth = Buffer.from(`${env("AMPLITUDE_CORTIFREE_API_KEY")}:${env("AMPLITUDE_CORTIFREE_SECRET_KEY")}`).toString("base64");
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (res.status === 429 && attempt < 4) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Amplitude ${res.status} sur ${path}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}

/** Map of day → value from a Dashboard API series response (first segment). */
function seriesByDay(json: any): Map<string, number> {
  const data = json?.data ?? {};
  const xs: string[] = data.xValues ?? [];
  const values: number[] = data.series?.[0] ?? [];
  return new Map(xs.map((x, i) => [String(x).slice(0, 10), Number(values[i] ?? 0)]));
}

async function fetchAmplitude(from: string, to: string): Promise<Result> {
  const range = { start: compact(from), end: compact(to) };
  // Sequential on purpose: Amplitude rejects concurrent Dashboard API queries with 429.
  const active = seriesByDay(await amplitudeGet("/api/2/users", { m: "active", i: "1", ...range }));
  const fresh = seriesByDay(await amplitudeGet("/api/2/users", { m: "new", i: "1", ...range }));
  const sessions = seriesByDay(
    await amplitudeGet("/api/2/events/segmentation", { e: JSON.stringify({ event_type: "session_start" }), m: "totals", i: "1", ...range }),
  );
  const rolling = seriesByDay(
    await amplitudeGet("/api/2/events/segmentation", { e: JSON.stringify({ event_type: "_active" }), m: "uniques", i: "1", rollingWindow: "30", ...range }),
  );
  const daily: DailyRow[] = [...active.keys()].sort().map((date) => ({
    date,
    activeUsers: active.get(date) ?? 0,
    newUsers: fresh.get(date) ?? 0,
    sessions: sessions.get(date),
    activeUsers30d: rolling.get(date),
  }));

  // N-day retention of new users (any activity), one cohort per acquisition day.
  // Cells: [0] = cohort size, [n + 1] = day n. A cell counts only once Amplitude marks it complete.
  const ret = await amplitudeGet("/api/2/retention", {
    se: JSON.stringify({ event_type: "_new" }),
    re: JSON.stringify({ event_type: "_active" }),
    ...range,
  });
  const series = ret?.data?.series?.[0] ?? {};
  const labels: string[] = series.dates ?? [];
  const days: string[] = series.datetimes ?? [];
  const cohorts: CohortRow[] = [];
  labels.forEach((label, i) => {
    const cells: { count: number; outof: number; incomplete: boolean }[] = series.values?.[label] ?? [];
    const size = cells[0]?.outof ?? 0;
    if (!size) return;
    const dayN = (n: number) => {
      const cell = cells[n + 1];
      return cell && !cell.incomplete ? cell.count : undefined;
    };
    cohorts.push({ cohortStart: String(days[i]).slice(0, 10), cohortSize: size, d1Users: dayN(1), d7Users: dayN(7), d30Users: dayN(30) });
  });
  return { daily, cohorts };
}

/* ---------------- PostHog (Quest IRL) ---------------- */

const POSTHOG_LIMIT = 10000;
// Only the iOS app's events (the project also holds a one-off manual probe event).
const PH_FILTER = "properties.$lib = 'posthog-ios'";

async function hogql(query: string): Promise<any[][]> {
  const host = env("POSTHOG_QUESTIRL_HOST").replace(/\/$/, "");
  const res = await fetch(`${host}/api/projects/${env("POSTHOG_QUESTIRL_PROJECT_ID")}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("POSTHOG_QUESTIRL_PERSONAL_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: `${query} LIMIT ${POSTHOG_LIMIT}` } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json: any = await res.json();
  const rows: any[][] = json.results ?? [];
  if (rows.length >= POSTHOG_LIMIT) throw new Error("PostHog: résultat tronqué (limite de lignes atteinte)");
  return rows;
}

async function fetchPosthog(from: string, to: string): Promise<Result> {
  const activeDays = `select distinct person_id, toDate(timestamp) as day from events where ${PH_FILTER}`;
  const [activity, firsts, rolling, retention] = await Promise.all([
    hogql(
      `select toDate(timestamp) as d, count(distinct person_id), count(distinct nullIf($session_id, '')) from events
       where ${PH_FILTER} and toDate(timestamp) >= toDate('${from}') and toDate(timestamp) <= toDate('${to}') group by d`,
    ),
    // New user = first day the person ever sent an event (all history, not only the window).
    hogql(`select f, count() from (select person_id, min(toDate(timestamp)) as f from events where ${PH_FILTER} group by person_id) group by f`),
    hogql(
      `select addDays(day, k) as d, count(distinct person_id) from (${activeDays} and toDate(timestamp) >= toDate('${addDays(from, -29)}'))
       array join range(30) as k group by d`,
    ),
    // Day N counts only once it is over (cohort + N < today in the project time zone).
    hogql(
      `select f, count(),
         if(addDays(f, 1) < today(), countIf(has(days, addDays(f, 1))), null),
         if(addDays(f, 7) < today(), countIf(has(days, addDays(f, 7))), null),
         if(addDays(f, 30) < today(), countIf(has(days, addDays(f, 30))), null)
       from (select person_id, min(day) as f, groupUniqArray(day) as days from (${activeDays}) group by person_id)
       where f >= toDate('${from}') and f <= toDate('${to}') group by f`,
    ),
  ]);
  const byDay = new Map<string, DailyRow>();
  const row = (date: string) => {
    let r = byDay.get(date);
    if (!r) byDay.set(date, (r = { date, activeUsers: 0, newUsers: 0, sessions: 0, activeUsers30d: 0 }));
    return r;
  };
  for (let d = from; d <= to; d = addDays(d, 1)) row(d);
  for (const [d, users, sessions] of activity) if (byDay.has(d)) Object.assign(row(d), { activeUsers: users, sessions });
  for (const [d, count] of firsts) if (byDay.has(d)) row(d).newUsers = count;
  for (const [d, count] of rolling) if (byDay.has(d)) row(d).activeUsers30d = count;
  const num = (x: unknown) => (x == null ? undefined : Number(x));
  const cohorts: CohortRow[] = retention.map(([f, size, d1, d7, d30]) => ({
    cohortStart: String(f),
    cohortSize: Number(size),
    d1Users: num(d1),
    d7Users: num(d7),
    d30Users: num(d30),
  }));
  return { daily: [...byDay.values()], cohorts };
}

/* ---------------- Runner ---------------- */

const PROVIDERS = [
  { appSlug: "cortifree", source: "amplitude", envs: ["AMPLITUDE_CORTIFREE_API_KEY", "AMPLITUDE_CORTIFREE_SECRET_KEY"], fetch: fetchAmplitude },
  { appSlug: "questirl", source: "posthog", envs: ["POSTHOG_QUESTIRL_HOST", "POSTHOG_QUESTIRL_PROJECT_ID", "POSTHOG_QUESTIRL_PERSONAL_KEY"], fetch: fetchPosthog },
];

async function run(ctx: ActionCtx, days: number) {
  const to = isoDay(new Date());
  const from = addDays(to, -(days - 1));
  const out: Record<string, string> = {};
  for (const p of PROVIDERS) {
    const runId = await ctx.runMutation(internal.syncRuns.start, { source: p.source });
    const missing = p.envs.filter((name) => !process.env[name]);
    if (missing.length) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: `${missing.join(", ")} manquante(s) sur Convex` });
      out[p.source] = "skipped";
      continue;
    }
    try {
      const { daily, cohorts } = await p.fetch(from, to);
      let written = 0;
      for (let i = 0; i < daily.length; i += 200) {
        written += await ctx.runMutation(internal.engagementData.upsertDaily, { appSlug: p.appSlug, source: p.source, rows: daily.slice(i, i + 200) });
      }
      for (let i = 0; i < cohorts.length; i += 200) {
        written += await ctx.runMutation(internal.engagementData.upsertCohorts, { appSlug: p.appSlug, source: p.source, rows: cohorts.slice(i, i + 200) });
      }
      const message = `${daily.length} jours et ${cohorts.length} cohortes du ${from} au ${to}`;
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: written, message });
      out[p.source] = message;
    } catch (err) {
      const message = String((err as Error).message ?? err).slice(0, 300);
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message });
      out[p.source] = `error: ${message}`;
    }
  }
  return out;
}

/** Cron: last 40 days (refreshes D30 of recent cohorts and today's partial day). */
export const syncRecent = internalAction({
  args: {},
  handler: (ctx) => run(ctx, 40),
});

/** Last 12 months (default 366 days). */
export const backfill = internalAction({
  args: { days: v.optional(v.number()) },
  handler: (ctx, { days }) => run(ctx, days ?? 366),
});
