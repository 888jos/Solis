import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { addDays, isoDay } from "../lib/dates";
import { fetchRetry } from "../lib/http";

// Meta Ads (Marketing API, read-only `ads_read`): daily insights per campaign → spend, impressions,
// clicks, app installs. Env on Convex: META_ACCESS_TOKEN (system user token), META_AD_ACCOUNT_ID
// (digits, without "act_"), optional META_GRAPH_VERSION (default v23.0) and META_APP_SLUG (default
// cortifree: the app the account advertises). The ad account must bill in EUR.

const SOURCE = "meta_ads";

type Insight = {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

const INSTALL_ACTIONS = new Set(["mobile_app_install", "app_install", "omni_app_install"]);

async function graph(url: string): Promise<any> {
  const res = await fetchRetry(url);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Meta ${res.status}: ${String(json?.error?.message ?? "réponse illisible").slice(0, 200)}`);
  return json;
}

async function syncFrom(ctx: ActionCtx, from: string) {
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID?.replace(/^act_/, "");
  if (!token || !account) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "Il manque META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID" });
    return "skipped";
  }
  try {
    const base = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
    const auth = `access_token=${encodeURIComponent(token)}`;
    const acct = await graph(`${base}/act_${account}?fields=currency&${auth}`);
    if (acct.currency && acct.currency !== "EUR") throw new Error(`Compte publicitaire en ${acct.currency}, EUR attendu`);
    const q = new URLSearchParams({
      level: "campaign",
      time_increment: "1",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      time_range: JSON.stringify({ since: from, until: isoDay(new Date()) }),
      limit: "500",
    });
    const rows: Insight[] = [];
    let url: string | null = `${base}/act_${account}/insights?${q}&${auth}`;
    for (let page = 0; url && page < 40; page++) {
      const json: { data: Insight[]; paging?: { next?: string } } = await graph(url);
      rows.push(...json.data);
      url = json.paging?.next ?? null;
    }
    const app = process.env.META_APP_SLUG || "cortifree";
    const out = rows.map((r) => ({
      appSlug: app,
      day: r.date_start,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      spendEur: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      installs: (r.actions ?? []).filter((a) => INSTALL_ACTIONS.has(a.action_type)).reduce((t, a) => Math.max(t, Number(a.value)), 0),
    }));
    const written: number = await ctx.runMutation(internal.paid.upsertAdDays, { channel: "meta", rows: out });
    const spend = out.reduce((t, r) => t + r.spendEur, 0);
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: written, message: `${out.length} lignes campagne×jour depuis le ${from}, ${spend.toFixed(2)} €` });
    return "ok";
  } catch (err) {
    // Never echo the URL: it carries the token.
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String((err as Error).message ?? err).replace(/access_token=[^&\s]+/g, "access_token=…").slice(0, 300) });
    return "error";
  }
}

/** Cron: last 7 days (Meta restates recent days as conversions come in). */
export const syncRecent = internalAction({ args: {}, handler: (ctx) => syncFrom(ctx, addDays(isoDay(new Date()), -7)) });

export const backfill = internalAction({ args: { from: v.optional(v.string()) }, handler: (ctx, { from }) => syncFrom(ctx, from ?? "2026-10-01") });
