"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { eurRates, toEur } from "../expensesData";
import { addDays, isoDay } from "../lib/dates";

// AI provider spend from the official admin cost APIs (read-only GETs). Activates by itself as soon
// as OPENAI_ADMIN_KEY / ANTHROPIC_ADMIN_KEY exist on the deployment; until then each run records a
// "skipped" syncRun saying which key is missing.
//   OpenAI:    GET https://api.openai.com/v1/organization/costs (daily buckets, amount.value in USD)
//   Anthropic: GET https://api.anthropic.com/v1/organizations/cost_report (daily buckets, amount in cents as a decimal string)
type DayCost = { date: string; usd: number };

async function openaiCosts(key: string, from: string): Promise<DayCost[]> {
  const byDay = new Map<string, number>();
  let page: string | null = null;
  const start = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
  for (let i = 0; i < 40; i++) {
    const q = new URLSearchParams({ start_time: String(start), bucket_width: "1d", limit: "31" });
    if (page) q.set("page", page);
    const res = await fetch(`https://api.openai.com/v1/organization/costs?${q}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json: any = await res.json();
    for (const bucket of json.data ?? []) {
      const date = isoDay(new Date(bucket.start_time * 1000));
      let sum = 0;
      for (const r of bucket.results ?? []) {
        const cur = String(r.amount?.currency ?? "usd").toLowerCase();
        if (cur !== "usd") throw new Error(`OpenAI: devise inattendue ${cur}`);
        sum += Number(r.amount?.value ?? 0);
      }
      byDay.set(date, (byDay.get(date) ?? 0) + sum);
    }
    if (!json.has_more || !json.next_page || !(json.data ?? []).length) break;
    page = json.next_page;
  }
  return [...byDay].map(([date, usd]) => ({ date, usd: Math.round(usd * 10000) / 10000 }));
}

async function anthropicCosts(key: string, from: string): Promise<DayCost[]> {
  const byDay = new Map<string, number>();
  let page: string | null = null;
  for (let i = 0; i < 40; i++) {
    const q = new URLSearchParams({ starting_at: `${from}T00:00:00Z`, bucket_width: "1d", limit: "31" });
    if (page) q.set("page", page);
    const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json: any = await res.json();
    for (const bucket of json.data ?? []) {
      const date = String(bucket.starting_at).slice(0, 10);
      let cents = 0;
      for (const r of bucket.results ?? []) {
        if (String(r.currency ?? "USD").toUpperCase() !== "USD") throw new Error(`Anthropic: devise inattendue ${r.currency}`);
        cents += Number(r.amount ?? 0);
      }
      byDay.set(date, (byDay.get(date) ?? 0) + cents / 100);
    }
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return [...byDay].map(([date, usd]) => ({ date, usd: Math.round(usd * 10000) / 10000 }));
}

const PROVIDERS = [
  { source: "openai_api", env: "OPENAI_ADMIN_KEY", vendor: "OpenAI API", label: "OpenAI · coût API du jour", fetch: openaiCosts },
  { source: "anthropic_api", env: "ANTHROPIC_ADMIN_KEY", vendor: "Anthropic API", label: "Anthropic · coût API du jour", fetch: anthropicCosts },
] as const;

async function syncFrom(ctx: ActionCtx, from: string) {
  const out: Record<string, string> = {};
  for (const p of PROVIDERS) {
    const runId = await ctx.runMutation(internal.syncRuns.start, { source: p.source });
    const key = process.env[p.env];
    if (!key) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: `${p.env} manquante sur Convex` });
      out[p.source] = "skipped";
      continue;
    }
    try {
      const days = (await p.fetch(key, from)).filter((d) => d.date <= isoDay(new Date()));
      const rates = await eurRates(ctx, days.filter((d) => d.usd > 0).map((d) => ({ date: d.date, currency: "USD" })));
      const rows = days.map((d) => ({ date: d.date, amountUsd: d.usd, amountEur: d.usd > 0 ? toEur(rates, d.date, "USD", d.usd) : 0, label: p.label }));
      const written: number = await ctx.runMutation(internal.expensesData.upsertApiCosts, { source: p.source, vendor: p.vendor, days: rows });
      const totalUsd = days.reduce((s, d) => s + d.usd, 0);
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: written, message: `${days.length} jours depuis le ${from}, ${totalUsd.toFixed(2)} USD` });
      out[p.source] = "ok";
    } catch (err) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String((err as Error).message ?? err).slice(0, 300) });
      out[p.source] = "error";
    }
  }
  return out;
}

/** Cron: last 10 days (provider cost reports settle with a delay). */
export const syncRecent = internalAction({
  args: {},
  handler: (ctx) => syncFrom(ctx, addDays(isoDay(new Date()), -10)),
});

/** Full history since a date (default: studio start). */
export const backfill = internalAction({
  args: { from: v.optional(v.string()) },
  handler: (ctx, { from }) => syncFrom(ctx, from ?? "2026-01-01"),
});
