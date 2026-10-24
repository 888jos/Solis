"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { APPS, appByAppleId, type AppSlug } from "../lib/apps";
import { addDays, isoDay } from "../lib/dates";
import { fetchEurRates } from "../lib/fx";
import { ascSalesReport } from "./asc";

// Subscription syncs:
//  - Apple SUBSCRIPTION (SUMMARY, DAILY, 1_4)       → appleSubscriptionDaily
//  - Apple SUBSCRIPTION_EVENT (SUMMARY, DAILY, 1_4) → appleSubscriptionEvents
//  - RevenueCat v2 charts (mrr / actives / trials) + metrics/overview (CortiFree) → revenuecatSnapshots
// Every call to Apple and RevenueCat is a GET (read-only).

const BACKFILL_START = "2026-01-01";
const VERSION = "1_4";

const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function appFor(row: Record<string, string>): AppSlug | null {
  const byId = appByAppleId(row["App Apple ID"] ?? "");
  if (byId) return byId.slug;
  const name = (row["App Name"] ?? "").toLowerCase();
  return APPS.find((a) => name.startsWith(a.name.toLowerCase()))?.slug ?? null;
}

/** Download one day of the SUBSCRIPTION report and aggregate it per app × product × country. */
async function fetchDaily(date: string) {
  const raw = await ascSalesReport({ reportType: "SUBSCRIPTION", reportSubType: "SUMMARY", frequency: "DAILY", reportDate: date, version: VERSION, notAvailableAsError: true });
  if (!raw) return null;
  const agg = new Map<string, any>();
  for (const r of raw) {
    const appSlug = appFor(r);
    if (!appSlug) continue;
    const key = `${appSlug}|${r["Subscription Apple ID"]}|${r["Country"]}`;
    const row =
      agg.get(key) ??
      {
        appSlug,
        subscriptionName: r["Subscription Name"] ?? "",
        subscriptionAppleId: r["Subscription Apple ID"] ?? "",
        durationLabel: r["Standard Subscription Duration"] ?? "",
        country: r["Country"] ?? "",
        activeStandard: 0,
        activeIntroTrial: 0,
        activeIntroPaid: 0,
        activePromo: 0,
        activeFreeOffer: 0,
        billingRetry: 0,
        gracePeriod: 0,
      };
    row.activeStandard += num(r["Active Standard Price Subscriptions"]);
    row.activeIntroTrial += num(r["Active Free Trial Introductory Offer Subscriptions"]);
    row.activeIntroPaid += num(r["Active Pay Up Front Introductory Offer Subscriptions"]) + num(r["Active Pay As You Go Introductory Offer Subscriptions"]);
    row.activePromo +=
      num(r["Pay Up Front Promotional Offer Subscriptions"]) +
      num(r["Pay As You Go Promotional Offer Subscriptions"]) +
      num(r["Pay Up Front Offer Code Subscriptions"]) +
      num(r["Pay As You Go Offer Code Subscriptions"]) +
      num(r["Pay Up Front Win-back Offers"]) +
      num(r["Pay As You Go Win-back Offers"]);
    row.activeFreeOffer += num(r["Free Trial Promotional Offer Subscriptions"]) + num(r["Free Trial Offer Code Subscriptions"]) + num(r["Free Trial Win-back Offers"]);
    row.billingRetry += num(r["Billing Retry"]);
    row.gracePeriod += num(r["Grace Period"]);
    agg.set(key, row);
  }
  return [...agg.values()];
}

/** Download one day of the SUBSCRIPTION_EVENT report and aggregate Quantity per distinct line. */
async function fetchEvents(date: string) {
  const raw = await ascSalesReport({ reportType: "SUBSCRIPTION_EVENT", reportSubType: "SUMMARY", frequency: "DAILY", reportDate: date, version: VERSION, notAvailableAsError: true });
  if (!raw) return null;
  const agg = new Map<string, any>();
  for (const r of raw) {
    const appSlug = appFor(r);
    if (!appSlug) continue;
    const line = {
      appSlug,
      date: r["Event Date"] || date,
      event: r["Event"] ?? "",
      offerType: r["Subscription Offer Type"] ?? "",
      offerDuration: r["Subscription Offer Duration"] ?? "",
      durationLabel: r["Standard Subscription Duration"] ?? "",
      originalStartDate: r["Original Start Date"] ?? "",
      subscriptionName: r["Subscription Name"] ?? "",
      subscriptionAppleId: r["Subscription Apple ID"] ?? "",
      country: r["Country"] ?? "",
    };
    const key = Object.values(line).join("|");
    const row = agg.get(key) ?? { ...line, count: 0 };
    row.count += num(r["Quantity"]) || 1;
    agg.set(key, row);
  }
  return [...agg.values()];
}

// A day Apple has not published yet is recorded as "error" (not "empty": that would claim the day had
// no data) and is not counted as a failure: the next run fetches it again.
const notYet = (error: unknown) => String(error).includes("NOT_AVAILABLE_YET");

async function syncAppleDay(ctx: ActionCtx, date: string) {
  let rows = 0;
  let errors = 0;
  try {
    rows += await ctx.runMutation(internal.subscriptionsData.replaceDailyDay, { date, rows: await fetchDaily(date) });
  } catch (error) {
    if (!notYet(error)) {
      errors++;
      console.error(`SUBSCRIPTION ${date}: ${error}`);
    }
    await ctx.runMutation(internal.subscriptionsData.markError, { reportType: "SUBSCRIPTION", date });
  }
  try {
    rows += await ctx.runMutation(internal.subscriptionsData.replaceEventsDay, { reportDate: date, rows: await fetchEvents(date) });
  } catch (error) {
    if (!notYet(error)) {
      errors++;
      console.error(`SUBSCRIPTION_EVENT ${date}: ${error}`);
    }
    await ctx.runMutation(internal.subscriptionsData.markError, { reportType: "SUBSCRIPTION_EVENT", date });
  }
  return { rows, errors };
}

/* ---------- RevenueCat (CortiFree) ---------- */

async function rcGet(path: string): Promise<any> {
  const key = process.env.REVENUECAT_CORTIFREE_SECRET_KEY;
  const project = process.env.REVENUECAT_CORTIFREE_PROJECT_ID;
  if (!key || !project) throw new Error("REVENUECAT_CORTIFREE_SECRET_KEY / REVENUECAT_CORTIFREE_PROJECT_ID missing");
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${project}/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`RevenueCat ${res.status} on ${path.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** chart name → { "YYYY-MM-DD": value } (end-of-day values, measure 0). */
async function rcChart(chart: string, from: string, to: string): Promise<Record<string, number>> {
  const json = await rcGet(`charts/${chart}?start_date=${from}&end_date=${to}&resolution=day`);
  if (json.yaxis_currency && json.yaxis_currency !== "USD") throw new Error(`RevenueCat ${chart} currency ${json.yaxis_currency}`);
  const out: Record<string, number> = {};
  for (const point of json.values ?? []) {
    if (point.measure !== 0 || typeof point.cohort !== "number") continue;
    out[isoDay(new Date(point.cohort * 1000))] = point.value;
  }
  return out;
}

/**
 * 1 EUR = x USD for each day. Uses fxRates; a day missing there is fetched from the currency API
 * (and stored through fx.upsertDay); a day not published yet falls back to the latest earlier rate.
 */
async function usdRatesFor(ctx: ActionCtx, days: string[]): Promise<Record<string, { usdPerEur: number; fxDate: string }>> {
  if (!days.length) return {};
  const sorted = [...days].sort();
  const stored: Record<string, number> = await ctx.runQuery(internal.subscriptionsData.usdRates, { from: addDays(sorted[0], -7), to: sorted[sorted.length - 1] });
  const missing = sorted.filter((d) => stored[d] == null);
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(
      missing.slice(i, i + 8).map(async (day) => {
        const rates = await fetchEurRates(day);
        if (!rates?.USD) return;
        stored[day] = rates.USD;
        await ctx.runMutation(internal.fx.upsertDay, { date: day, rates });
      }),
    );
  }
  const known = Object.keys(stored).sort();
  const out: Record<string, { usdPerEur: number; fxDate: string }> = {};
  for (const day of sorted) {
    const fxDate = stored[day] != null ? day : [...known].reverse().find((d) => d < day);
    if (fxDate) out[day] = { usdPerEur: stored[fxDate], fxDate };
  }
  return out;
}

type RcDay = { date: string; mrrUsd: number; activeSubscriptions: number; activeTrials: number; revenue28dUsd?: number; newCustomers28d?: number; activeUsers28d?: number };

async function writeRevenuecat(ctx: ActionCtx, days: RcDay[]) {
  if (!days.length) return 0;
  const fx = await usdRatesFor(ctx, days.map((d) => d.date));
  const ready = days.filter((d) => fx[d.date]).map((d) => ({ ...d, ...fx[d.date] }));
  if (ready.length < days.length) throw new Error(`Pas de taux USD pour ${days.length - ready.length} jour(s)`);
  let written = 0;
  for (let i = 0; i < ready.length; i += 100) written += await ctx.runMutation(internal.subscriptionsData.upsertRevenuecat, { appSlug: "cortifree", days: ready.slice(i, i + 100) });
  return written;
}

async function syncRevenuecat(ctx: ActionCtx, from: string, to: string) {
  const days: RcDay[] = [];
  for (let start = from; start <= to; start = addDays(start, 90)) {
    const end = addDays(start, 89) < to ? addDays(start, 89) : to;
    const [mrr, actives, trials] = await Promise.all([rcChart("mrr", start, end), rcChart("actives", start, end), rcChart("trials", start, end)]);
    for (const date of Object.keys(mrr).sort()) {
      if (date < start || date > end || actives[date] == null || trials[date] == null) continue;
      days.push({ date, mrrUsd: mrr[date], activeSubscriptions: actives[date], activeTrials: trials[date] });
    }
  }
  // Current values + 28-day figures from the overview, stored on today's (UTC) row.
  const overview = await rcGet("metrics/overview");
  if (overview.currency && overview.currency !== "USD") throw new Error(`RevenueCat overview currency ${overview.currency}`);
  const metric = (id: string) => overview.metrics?.find((m: any) => m.id === id)?.value as number | undefined;
  const today = isoDay(new Date());
  // The overview rounds MRR to whole dollars: keep the chart's value for today when it has one.
  const chartToday = days.find((d) => d.date === today);
  const current: RcDay = {
    date: today,
    mrrUsd: chartToday?.mrrUsd ?? metric("mrr") ?? 0,
    activeSubscriptions: metric("active_subscriptions") ?? chartToday?.activeSubscriptions ?? 0,
    activeTrials: metric("active_trials") ?? chartToday?.activeTrials ?? 0,
    revenue28dUsd: metric("revenue"),
    newCustomers28d: metric("new_customers"),
    activeUsers28d: metric("active_users"),
  };
  return writeRevenuecat(ctx, [...days.filter((d) => d.date !== today), current]);
}

/* ---------- Entry points ---------- */

/** Cron: last 7 days of both Apple reports + RevenueCat (last 7 days of charts + overview). */
export const syncRecent = internalAction({
  args: {},
  handler: async (ctx) => {
    const today = isoDay(new Date());
    const apple = await ctx.runMutation(internal.syncRuns.start, { source: "asc_subscriptions" });
    let rows = 0;
    let errors = 0;
    for (let i = 1; i <= 7; i++) {
      const r = await syncAppleDay(ctx, addDays(today, -i));
      rows += r.rows;
      errors += r.errors;
    }
    await ctx.runMutation(internal.syncRuns.finish, { runId: apple, status: errors ? "error" : "ok", rows, message: errors ? `${errors} rapport(s) en erreur` : undefined });

    const rc = await ctx.runMutation(internal.syncRuns.start, { source: "revenuecat" });
    try {
      const written = await syncRevenuecat(ctx, addDays(today, -7), today);
      await ctx.runMutation(internal.syncRuns.finish, { runId: rc, status: "ok", rows: written });
    } catch (error) {
      await ctx.runMutation(internal.syncRuns.finish, { runId: rc, status: "error", message: String(error).slice(0, 500) });
    }
  },
});

/**
 * Backfill from 2026-01-01 (or `from`) to yesterday, `chunk` days per run; each run schedules the next.
 * RevenueCat history is fetched once, on the first run.
 */
export const backfill = internalAction({
  args: { from: v.optional(v.string()), to: v.optional(v.string()), chunk: v.optional(v.number()), runId: v.optional(v.id("syncRuns")), rows: v.optional(v.number()), errors: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const from = args.from ?? BACKFILL_START;
    const to = args.to ?? addDays(isoDay(new Date()), -1);
    const chunk = args.chunk ?? 10;
    let rows = args.rows ?? 0;
    let errors = args.errors ?? 0;
    const runId = args.runId ?? (await ctx.runMutation(internal.syncRuns.start, { source: "asc_subscriptions" }));

    if (!args.runId) {
      const rc = await ctx.runMutation(internal.syncRuns.start, { source: "revenuecat" });
      try {
        const written = await syncRevenuecat(ctx, from, isoDay(new Date()));
        await ctx.runMutation(internal.syncRuns.finish, { runId: rc, status: "ok", rows: written, message: "backfill" });
      } catch (error) {
        await ctx.runMutation(internal.syncRuns.finish, { runId: rc, status: "error", message: String(error).slice(0, 500) });
      }
    }

    const end = addDays(from, chunk - 1) < to ? addDays(from, chunk - 1) : to;
    for (let day = from; day <= end; day = addDays(day, 1)) {
      const r = await syncAppleDay(ctx, day);
      rows += r.rows;
      errors += r.errors;
    }
    if (end < to) {
      await ctx.scheduler.runAfter(0, internal.sources.subscriptions.backfill, { from: addDays(end, 1), to, chunk, runId, rows, errors });
    } else {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: errors ? "error" : "ok", rows, message: `backfill ${BACKFILL_START}→${to}${errors ? `, ${errors} rapport(s) en erreur` : ""}` });
    }
  },
});

// Debug helper: the raw lines of one report day (used to cross-check the stored aggregates).
export const rawReport = internalAction({
  args: { reportType: v.union(v.literal("SUBSCRIPTION"), v.literal("SUBSCRIPTION_EVENT")), date: v.string() },
  handler: async (_ctx, { reportType, date }) => {
    const rows = await ascSalesReport({ reportType, reportSubType: "SUMMARY", frequency: "DAILY", reportDate: date, version: VERSION });
    return rows ?? [];
  },
});
