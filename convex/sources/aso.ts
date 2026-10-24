"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { APPS, appBySlug } from "../lib/apps";
import { isoDay } from "../lib/dates";
import { ascGetAll } from "./asc";

// ASO sync. Metadata: App Store Connect (GET only). Ranks: public iTunes Search API, throttled.

const LIVE_STATES = new Set(["READY_FOR_SALE", "READY_FOR_DISTRIBUTION"]);
const DEAD_STATES = new Set(["REPLACED_WITH_NEW_VERSION", "REMOVED_FROM_SALE", "DEVELOPER_REMOVED_FROM_SALE"]);
const CHUNK = 25; // keywords per action run
const SPACING_MS = 3200; // ~19 requests per minute
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Channel = "live" | "draft";
type LocRow = {
  locale: string;
  channel: Channel;
  versionString?: string;
  versionState?: string;
  name?: string;
  subtitle?: string;
  keywords?: string;
  promotionalText?: string;
  descriptionLength?: number;
};

const stateOf = (attrs: any): string => attrs?.appVersionState ?? attrs?.appStoreState ?? attrs?.state ?? "";
const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s : undefined);

async function fetchAppLocalizations(appStoreId: string): Promise<LocRow[]> {
  const versions = await ascGetAll<any>(`/v1/apps/${appStoreId}/appStoreVersions?filter[platform]=IOS&limit=20`, 2);
  const sorted = versions
    .filter((ver) => !DEAD_STATES.has(stateOf(ver.attributes)))
    .sort((a, b) => String(b.attributes.createdDate).localeCompare(String(a.attributes.createdDate)));
  const live = sorted.find((ver) => LIVE_STATES.has(stateOf(ver.attributes)));
  const newest = sorted[0];
  const draft = newest && newest !== live && (!live || newest.attributes.createdDate > live.attributes.createdDate) ? newest : undefined;

  const infos = await ascGetAll<any>(`/v1/apps/${appStoreId}/appInfos?limit=10`, 1);
  const liveInfo = infos.find((i) => LIVE_STATES.has(stateOf(i.attributes))) ?? (live ? infos[0] : undefined);
  const draftInfo = infos.find((i) => i !== liveInfo && !LIVE_STATES.has(stateOf(i.attributes))) ?? liveInfo ?? infos[0];

  const rows: LocRow[] = [];
  const add = async (channel: Channel, version: any, info: any) => {
    if (!version) return;
    const vLocs = await ascGetAll<any>(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`, 2);
    const iLocs = info ? await ascGetAll<any>(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`, 2) : [];
    const locales = new Set([...vLocs.map((l) => l.attributes.locale), ...iLocs.map((l) => l.attributes.locale)]);
    for (const locale of locales) {
      const vl = vLocs.find((l) => l.attributes.locale === locale)?.attributes ?? {};
      const il = iLocs.find((l) => l.attributes.locale === locale)?.attributes ?? {};
      rows.push({
        locale,
        channel,
        versionString: clean(version.attributes.versionString),
        versionState: clean(stateOf(version.attributes)),
        name: clean(il.name),
        subtitle: clean(il.subtitle),
        keywords: clean(vl.keywords),
        promotionalText: clean(vl.promotionalText),
        descriptionLength: typeof vl.description === "string" ? [...vl.description].length : undefined,
      });
    }
  };
  await add("live", live, liveInfo);
  await add("draft", draft, draftInfo);
  return rows;
}

async function syncMetadata(ctx: ActionCtx) {
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: "aso_metadata" });
  let rows = 0;
  let seeded = 0;
  const errors: string[] = [];
  for (const app of APPS) {
    try {
      const locs = await fetchAppLocalizations(app.appStoreId);
      const res = await ctx.runMutation(internal.asoData.replaceLocalizations, { appSlug: app.slug, rows: locs });
      rows += res.rows;
      seeded += res.seeded;
    } catch (err) {
      errors.push(`${app.name}: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`);
    }
  }
  await ctx.runMutation(internal.syncRuns.finish, {
    runId,
    status: errors.length === APPS.length ? "error" : "ok",
    rows,
    message: [seeded ? `${seeded} mots-clés ajoutés au suivi` : "", ...errors].filter(Boolean).join(" · ") || undefined,
  });
}

type RankResult = { rank: number | null; topCompetitor?: string; resultCount: number } | { blocked: number };

async function fetchRank(appStoreId: string, keyword: string, country: string): Promise<RankResult> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: keyword, country, entity: "software", limit: "200" })}`;
  const res = await fetch(url, { headers: { "User-Agent": "Solis/2 (Drift Studio)" } });
  if (res.status === 403 || res.status === 429 || res.status >= 500) return { blocked: res.status };
  if (!res.ok) throw new Error(`iTunes ${res.status} for "${keyword}" (${country})`);
  const json: any = await res.json();
  const results: any[] = json.results ?? [];
  const index = results.findIndex((r) => String(r.trackId) === appStoreId);
  const competitor = results.find((r) => String(r.trackId) !== appStoreId);
  return { rank: index >= 0 ? index + 1 : null, topCompetitor: competitor?.trackName, resultCount: results.length };
}

/** Fetches ranks for up to CHUNK pending keywords today, then schedules itself until none remain. */
export const rankChunk = internalAction({
  args: { runId: v.optional(v.id("syncRuns")), done: v.optional(v.number()), retries: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const date = isoDay(new Date());
    const runId = args.runId ?? (await ctx.runMutation(internal.syncRuns.start, { source: "aso_ranks" }));
    let done = args.done ?? 0;
    const { batch, remaining } = await ctx.runQuery(internal.asoData.pendingKeywords, { date, limit: CHUNK });
    if (!batch.length) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: done });
      return;
    }
    for (let i = 0; i < batch.length; i++) {
      const k = batch[i];
      const app = appBySlug(k.appSlug);
      if (!app) continue;
      let result: RankResult;
      try {
        result = await fetchRank(app.appStoreId, k.keyword, k.country);
      } catch (err) {
        result = { blocked: 0 };
        console.warn(String(err));
      }
      if ("blocked" in result) {
        const retries = (args.retries ?? 0) + 1;
        if (retries > 6) {
          await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", rows: done, message: `iTunes Search refuse les requêtes (HTTP ${result.blocked}), ${remaining + batch.length - i} mots-clés non mesurés` });
          return;
        }
        await ctx.scheduler.runAfter(retries * 120_000, internal.sources.aso.rankChunk, { runId, done, retries });
        return;
      }
      await ctx.runMutation(internal.asoData.upsertRanking, { ...k, date, rank: result.rank, topCompetitor: result.topCompetitor, resultCount: result.resultCount });
      done++;
      if (i < batch.length - 1) await sleep(SPACING_MS);
    }
    if (remaining > 0) await ctx.scheduler.runAfter(SPACING_MS, internal.sources.aso.rankChunk, { runId, done, retries: 0 });
    else await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: done });
  },
});

/** Immediate snapshot for one keyword (after it is added from the UI). */
export const rankOne = internalAction({
  args: { appSlug: v.string(), keyword: v.string(), country: v.string() },
  handler: async (ctx, k) => {
    const app = appBySlug(k.appSlug);
    if (!app) return;
    const result = await fetchRank(app.appStoreId, k.keyword, k.country);
    if ("blocked" in result) return; // the daily run will pick it up
    await ctx.runMutation(internal.asoData.upsertRanking, { ...k, date: isoDay(new Date()), rank: result.rank, topCompetitor: result.topCompetitor, resultCount: result.resultCount });
  },
});

export const syncMetadataNow = internalAction({ args: {}, handler: (ctx) => syncMetadata(ctx) });

/** Cron entry point: refresh metadata (and seed keywords), then start today's rank snapshot. */
export const syncRecent = internalAction({
  args: {},
  handler: async (ctx) => {
    await syncMetadata(ctx);
    if (await ctx.runQuery(internal.asoData.rankRunActive, {})) return;
    await ctx.scheduler.runAfter(0, internal.sources.aso.rankChunk, {});
  },
});
