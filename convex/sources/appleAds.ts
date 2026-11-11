"use node";

import crypto from "node:crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { fetchRetry } from "../lib/http";

// Apple Ads Platform API (official, free with an Apple Ads account; read-only API user):
// POST /v1/insights/apps/search-term-popularity/query → Apple's popularity (1-100 across all genres,
// 1-5 tier) of the most searched terms per country and genre (top ~500, ≥ 500 searches a week).
// Auth: OAuth2 client credentials; the client secret is an ES256 JWT signed with our private key.
// Env on Convex: ASA_CLIENT_ID, ASA_TEAM_ID, ASA_KEY_ID (shown by Apple Ads after uploading the public
// key), ASA_PRIVATE_KEY_B64 (base64 of the PEM), optional ASA_AD_ACCOUNT_ID (else the first ad account).
// Docs: developer.apple.com/documentation/apple-ads-platform-api (insights endpoints, OAuth).

const SOURCE = "apple_ads";
const API = "https://api.ads.apple.com/v1";
/** App Store genres of the studio's apps (CortiFree: health; Cocorise: utilities/lifestyle; Quest IRL: productivity/lifestyle). */
const GENRES = ["HEALTH_FITNESS", "LIFESTYLE", "PRODUCTIVITY_UTILITIES"];
const FIELDS = ["week", "countryOrRegion", "genre", "searchTerm", "rankInGenre", "searchPopularityInGenre", "searchPopularity1to100", "searchPopularity1to5"];

let cachedToken: { token: string; exp: number } | null = null;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant sur Convex`);
  return value;
}

export function appleAdsConfigured(): boolean {
  return ["ASA_CLIENT_ID", "ASA_TEAM_ID", "ASA_KEY_ID", "ASA_PRIVATE_KEY_B64"].every((k) => !!process.env[k]);
}

function clientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: env("ASA_KEY_ID") });
  const body = b64({ iss: env("ASA_TEAM_ID"), sub: env("ASA_CLIENT_ID"), aud: "https://appleid.apple.com", iat: now, exp: now + 3600 });
  const key = Buffer.from(env("ASA_PRIVATE_KEY_B64"), "base64").toString("utf8");
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp - 60_000 > Date.now()) return cachedToken.token;
  const res = await fetchRetry("https://appleid.apple.com/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env("ASA_CLIENT_ID"), client_secret: clientSecret(), scope: "searchadsorg" }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) throw new Error(`Apple Ads OAuth ${res.status}: ${String(json?.error_description ?? json?.error ?? "réponse illisible").slice(0, 200)}`);
  cachedToken = { token: json.access_token, exp: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function api(path: string, init: RequestInit = {}, adAccountId?: string): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" };
  if (adAccountId) headers["X-AP-Context"] = `adAccountId=${adAccountId}`;
  const res = await fetchRetry(`${API}${path}`, { ...init, headers }, { retries: 4, baseDelayMs: 2000 });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json?.error?.details?.[0]?.message ?? json?.error?.message ?? "";
    throw Object.assign(new Error(`Apple Ads ${res.status} sur ${path}: ${String(detail).slice(0, 240)}`), { status: res.status });
  }
  return json;
}

async function adAccountId(): Promise<string> {
  if (process.env.ASA_AD_ACCOUNT_ID) return process.env.ASA_AD_ACCOUNT_ID;
  const acls = await api("/acls");
  const first = acls?.result?.acls?.find((a: any) => a?.adAccount?.id) ?? null;
  if (!first) throw new Error("Aucun compte publicitaire Apple Ads accessible avec cet utilisateur API");
  return String(first.adAccount.id);
}

type Row = { week: string; country: string; genre: string; term: string; popularity: number; popularity5?: number; popularityInGenre?: number; rankInGenre?: number };

async function queryPopularity(account: string, countries: string[], start: string, end: string): Promise<Row[]> {
  const out: Row[] = [];
  let withFields = true;
  for (let offset = 0; offset < 50_000; ) {
    const body: any = {
      timeRange: { start, end, granularity: "WEEKLY_SUN_SAT" },
      filters: [
        { field: "countryOrRegion", operator: "IN", value: countries.map((c) => c.toUpperCase()) },
        { field: "genre", operator: "IN", value: GENRES },
      ],
      pagination: { offset, pageSize: 5000 },
    };
    if (withFields) body.fields = FIELDS;
    let json: any;
    try {
      json = await api("/insights/apps/search-term-popularity/query", { method: "POST", body: JSON.stringify(body) }, account);
    } catch (err: any) {
      // The request object does not document `fields` everywhere: retry once without it.
      if (withFields && err?.status === 400) {
        withFields = false;
        continue;
      }
      throw err;
    }
    const rows: any[] = Array.isArray(json?.result) ? json.result : (json?.result?.rows ?? json?.result?.data ?? []);
    for (const r of rows) {
      const term = String(r.searchTerm ?? "").trim().toLowerCase();
      const popularity = Number(r.searchPopularity1to100);
      if (!term || !Number.isFinite(popularity)) continue;
      out.push({
        week: String(r.week ?? end),
        country: String(r.countryOrRegion ?? "").toLowerCase(),
        genre: String(r.genre ?? ""),
        term,
        popularity,
        popularity5: Number.isFinite(Number(r.searchPopularity1to5)) ? Number(r.searchPopularity1to5) : undefined,
        popularityInGenre: Number.isFinite(Number(r.searchPopularityInGenre)) ? Number(r.searchPopularityInGenre) : undefined,
        rankInGenre: Number.isFinite(Number(r.rankInGenre)) ? Number(r.rankInGenre) : undefined,
      });
    }
    const total = Number(json?.pagination?.totalCount ?? NaN);
    offset += rows.length;
    if (!rows.length || (Number.isFinite(total) ? offset >= total : rows.length < 5000)) break;
  }
  return out;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function sync(ctx: ActionCtx, weeksBack: number) {
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
  if (!appleAdsConfigured()) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "Il manque ASA_CLIENT_ID, ASA_TEAM_ID ou ASA_KEY_ID (utilisateur API Apple Ads)" });
    return { status: "skipped" };
  }
  try {
    const account = await adAccountId();
    const countries: string[] = await ctx.runQuery(internal.asoData.trackedCountries, {});
    if (!countries.length) throw new Error("Aucun pays suivi en ASO");
    // Last complete Sunday-Saturday weeks (Apple publishes them on Mondays 07:00 UTC).
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 1) % 7)); // last Saturday
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7 * weeksBack + 1); // a Sunday
    const rows = await queryPopularity(account, countries, iso(start), iso(end));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) written += await ctx.runMutation(internal.asoData.writeAppleTerms, { rows: rows.slice(i, i + 500) });
    const matched: number = await ctx.runMutation(internal.asoData.applyApplePopularity, {});
    const weeks = [...new Set(rows.map((r) => r.week))].sort();
    await ctx.runMutation(internal.syncRuns.finish, {
      runId,
      status: "ok",
      rows: written,
      message: `${rows.length} termes (${countries.length} pays, semaines ${weeks[0] ?? "—"} → ${weeks[weeks.length - 1] ?? "—"}), ${matched} mots-clés suivis ont la popularité Apple`,
    });
    return { status: "ok", rows: rows.length, matched };
  } catch (err) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String((err as Error).message ?? err).slice(0, 400) });
    return { status: "error", message: String((err as Error).message ?? err) };
  }
}

/** Cron (Mondays, after Apple's 07:00 UTC refresh): the last complete week. */
export const syncRecent = internalAction({ args: {}, handler: (ctx) => sync(ctx, 1) });

/** First run or catch-up: several weeks (retention: 65 weeks). */
export const backfill = internalAction({ args: { weeks: v.optional(v.number()) }, handler: (ctx, { weeks }) => sync(ctx, Math.max(1, Math.min(65, weeks ?? 8))) });
