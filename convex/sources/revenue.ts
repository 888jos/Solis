"use node";

import crypto from "node:crypto";
import zlib from "node:zlib";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { APPS } from "../lib/apps";
import { addDays, daysBetween, isoDay } from "../lib/dates";
import { convertToEur, fetchEurRates, FX_CURRENCIES } from "../lib/fx";
import { withoutVat } from "../lib/vat";
import { ascToken, parseTsv } from "./asc";

// Apple SALES / SUMMARY / DAILY / 1_1 → appleSales (one row per report line, amounts in EUR on the report day).
// Read-only use of App Store Connect: only GET /v1/salesReports.

const SOURCE = "asc_sales";
const BACKFILL_START = "2026-01-01";
const DOWNLOAD_TYPES = new Set(["1", "1F", "1T", "F1"]);
const SUBSCRIPTION_TYPES = new Set(["IAY"]); // auto-renewable subscription

type Fetched = { kind: "ok"; rows: Record<string, string>[] } | { kind: "empty" } | { kind: "error"; message: string };

/** GET one daily SALES report. 404 "no sales" → empty; 404 "not available yet" and other failures → error. */
async function fetchSalesDay(day: string): Promise<Fetched> {
  const vendor = process.env.ASC_VENDOR_NUMBER;
  if (!vendor) return { kind: "error", message: "ASC_VENDOR_NUMBER manquant" };
  const q = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportType]": "SALES",
    "filter[reportSubType]": "SUMMARY",
    "filter[vendorNumber]": vendor,
    "filter[reportDate]": day,
    "filter[version]": "1_1",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${q}`, { headers: { Authorization: `Bearer ${ascToken()}` } });
    } catch (error) {
      // Network hiccup: retry with backoff, report on the last attempt.
      if (attempt === 2) return { kind: "error", message: `Réseau: ${String(error).slice(0, 150)}` };
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (res.ok) return { kind: "ok", rows: parseTsv(zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")) };
    const text = await res.text();
    if (res.status === 404) {
      if (/no sales/i.test(text)) return { kind: "empty" };
      return { kind: "error", message: /not available yet/i.test(text) ? "Rapport pas encore publié par Apple" : `ASC 404: ${text.slice(0, 200)}` };
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    return { kind: "error", message: `ASC ${res.status}: ${text.slice(0, 200)}` };
  }
  return { kind: "error", message: "ASC: trop de tentatives (429/5xx)" };
}

function appFor(row: Record<string, string>): string {
  const sku = row["SKU"];
  const parent = row["Parent Identifier"];
  const appleId = row["Apple Identifier"];
  const app = APPS.find((a) => a.sku === sku) ?? APPS.find((a) => a.sku === parent) ?? APPS.find((a) => a.appStoreId === appleId);
  return app?.slug ?? "other";
}

const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** EUR rates for a report day: stored rates if present, else fetch (and store), else nearest earlier stored day. */
async function ratesFor(ctx: ActionCtx, day: string, needed: Set<string>): Promise<Record<string, number>> {
  const stored = await ctx.runQuery(internal.fx.ratesOn, { day });
  const hasAll = (rates: Record<string, number>) => [...needed].every((c) => c === "EUR" || rates[c]);
  if (stored.date === day && hasAll(stored.rates)) return stored.rates;
  const fetched = await fetchEurRates(day, new Set([...FX_CURRENCIES, ...needed]));
  if (fetched) {
    await ctx.runMutation(internal.fx.upsertDay, { date: day, rates: fetched });
    return fetched;
  }
  return stored.rates;
}

/** syncDay that never throws: a failure is recorded on the day and returned as an error. */
async function syncDaySafe(ctx: ActionCtx, day: string): Promise<{ lines: number; status: "ok" | "empty" | "error"; message?: string }> {
  try {
    return await syncDay(ctx, day);
  } catch (error) {
    const message = String(error).slice(0, 300);
    await ctx.runMutation(internal.revenueData.markReportDay, { date: day, status: "error", message });
    return { lines: 0, status: "error", message };
  }
}

/** Fetch, convert and store one report day. */
async function syncDay(ctx: ActionCtx, day: string): Promise<{ lines: number; status: "ok" | "empty" | "error"; message?: string }> {
  const fetched = await fetchSalesDay(day);
  if (fetched.kind !== "ok") {
    const status = fetched.kind;
    const message = fetched.kind === "error" ? fetched.message : undefined;
    await ctx.runMutation(internal.revenueData.markReportDay, { date: day, status, message });
    return { lines: 0, status, message };
  }
  const needed = new Set<string>();
  for (const row of fetched.rows) {
    if (row["Customer Currency"]) needed.add(row["Customer Currency"].toUpperCase());
    if (row["Currency of Proceeds"]) needed.add(row["Currency of Proceeds"].toUpperCase());
  }
  const rates = await ratesFor(ctx, day, needed);

  const seen = new Map<string, number>();
  const lines = [];
  for (const row of fetched.rows) {
    const units = num(row["Units"]);
    const customerPrice = num(row["Customer Price"]);
    const proceeds = num(row["Developer Proceeds"]);
    const customerCurrency = (row["Customer Currency"] ?? "").toUpperCase();
    const proceedsCurrency = (row["Currency of Proceeds"] ?? "").toUpperCase();
    const country = (row["Country Code"] ?? "").toUpperCase();
    // Refund lines carry units < 0 AND a negative customer price (proceeds stay positive):
    // the signed units alone give the direction, prices are taken as magnitudes.
    const grossEur = convertToEur(Math.abs(customerPrice) * units, customerCurrency, rates);
    const proceedsEur = convertToEur(Math.abs(proceeds) * units, proceedsCurrency || customerCurrency, rates);
    if (grossEur == null || proceedsEur == null) {
      const message = `Taux de change manquant (${customerCurrency}/${proceedsCurrency}) pour le ${day}`;
      await ctx.runMutation(internal.revenueData.markReportDay, { date: day, status: "error", message });
      return { lines: 0, status: "error", message };
    }
    // Identical lines can appear twice in one report: the occurrence index keeps them distinct.
    const hash = crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 16);
    const occurrence = seen.get(hash) ?? 0;
    seen.set(hash, occurrence + 1);
    const productTypeId = row["Product Type Identifier"] ?? "";
    const subscriptionKind = row["Subscription"] ?? "";
    lines.push({
      appSlug: appFor(row),
      date: day,
      country,
      sku: row["SKU"] ?? "",
      title: row["Title"] ?? "",
      productTypeId,
      isSubscription: subscriptionKind !== "" || SUBSCRIPTION_TYPES.has(productTypeId),
      isDownload: DOWNLOAD_TYPES.has(productTypeId),
      units,
      customerPrice,
      customerCurrency,
      proceeds,
      proceedsCurrency,
      grossEur,
      exVatEur: withoutVat(grossEur, country),
      proceedsEur,
      lineKey: `${day}|${hash}|${occurrence}`,
      parentSku: row["Parent Identifier"] || undefined,
      appleId: row["Apple Identifier"] || undefined,
      subscriptionKind: subscriptionKind || undefined,
      period: row["Period"] || undefined,
      orderType: row["Order Type"] || undefined,
      device: row["Device"] || undefined,
      version: row["Version"] || undefined,
    });
  }
  await ctx.runMutation(internal.revenueData.writeDay, { date: day, lines });
  return { lines: lines.length, status: lines.length ? "ok" : "empty" };
}

const yesterday = () => addDays(isoDay(new Date()), -1);

type DayStatus = { date: string; status: "ok" | "empty" | "error"; rows: number };
type RunResult = { fetched?: number; processed?: number; lines?: number; remaining?: number; errors?: string[]; done?: boolean };

/** Cheap refresh for the cron: last 7 report days, only the ones not already "ok". */
export const syncRecent = internalAction({
  args: {},
  handler: async (ctx): Promise<RunResult> => {
    const to = yesterday();
    const from = addDays(to, -6);
    const statuses: DayStatus[] = await ctx.runQuery(internal.revenueData.dayStatuses, { from, to });
    const done = new Set<string>(statuses.filter((s) => s.status === "ok").map((s) => s.date));
    const todo: string[] = daysBetween(from, to).filter((d) => !done.has(d));
    if (!todo.length) return { fetched: 0 };
    const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
    let lines = 0;
    const errors: string[] = [];
    for (const day of todo) {
      const result = await syncDaySafe(ctx, day);
      lines += result.lines;
      if (result.status === "error") errors.push(`${day}: ${result.message}`);
    }
    // "Not available yet" for the latest day is normal (Apple publishes ~5 am PT): not a failure.
    const real = errors.filter((e) => !e.includes("pas encore publié"));
    await ctx.runMutation(internal.syncRuns.finish, {
      runId,
      status: real.length ? "error" : "ok",
      rows: lines,
      message: errors.length ? errors.join(" · ").slice(0, 500) : `${todo.length} jour(s) récupérés`,
    });
    return { fetched: todo.length, lines, errors };
  },
});

/**
 * Backfill every report day from `cursor` (default 2026-01-01) to yesterday, skipping days already
 * ok or empty. Processes ~3 min of work per run, then reschedules itself from where it stopped.
 */
export const backfill = internalAction({
  args: { cursor: v.optional(v.string()), refetchAll: v.optional(v.boolean()) },
  handler: async (ctx, { cursor, refetchAll }): Promise<RunResult> => {
    const started = Date.now();
    const to = yesterday();
    const from = cursor ?? BACKFILL_START;
    if (from > to) return { done: true };
    const statuses: DayStatus[] = await ctx.runQuery(internal.revenueData.dayStatuses, { from, to });
    const final = new Set<string>(refetchAll ? [] : statuses.filter((s) => s.status === "ok" || s.status === "empty").map((s) => s.date));
    const todo: string[] = daysBetween(from, to).filter((d) => !final.has(d));
    const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
    let lines = 0;
    let processed = 0;
    const errors: string[] = [];
    for (const day of todo) {
      if (Date.now() - started > 180_000) break;
      const result = await syncDaySafe(ctx, day);
      lines += result.lines;
      processed++;
      if (result.status === "error") errors.push(`${day}: ${result.message}`);
    }
    const remaining = todo.slice(processed);
    if (remaining.length) await ctx.scheduler.runAfter(1000, internal.sources.revenue.backfill, { cursor: remaining[0], refetchAll });
    await ctx.runMutation(internal.syncRuns.finish, {
      runId,
      status: errors.filter((e) => !e.includes("pas encore publié")).length ? "error" : "ok",
      rows: lines,
      message: `Backfill ${processed} jour(s)${remaining.length ? `, suite à partir du ${remaining[0]}` : ", terminé"}${errors.length ? ` · ${errors.join(" · ")}` : ""}`.slice(0, 500),
    });
    return { processed, lines, remaining: remaining.length, errors };
  },
});

/** Re-fetch one day on demand (debug / verification): `npx convex run sources/revenue:syncOne '{"day":"2026-10-20"}'`. */
export const syncOne = internalAction({
  args: { day: v.string() },
  handler: (ctx, { day }): Promise<{ lines: number; status: string; message?: string }> => syncDay(ctx, day),
});
