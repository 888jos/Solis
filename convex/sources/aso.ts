"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { APPS, appBySlug } from "../lib/apps";
import { isoDay } from "../lib/dates";
import { ascGetAll } from "./asc";

// ASO sync, independent of any Mac app:
//   - metadata: App Store Connect (GET only)
//   - ranks: the App Store's own search order per storefront (public endpoint, ~250 results), iTunes Search
//     API as fallback; throttled, one measure per keyword per day
//   - popularity (estimated from App Store search suggestions) and difficulty (strength of the top 10),
//     recomputed every 14 days per keyword

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

type RankResult = { rank: number | null; topCompetitor?: string; resultCount: number; source: "appstore" | "itunes" } | { blocked: number };

/** App Store storefront ids (X-Apple-Store-Front), from Apple's storefront list. */
const STOREFRONTS: Record<string, number> = {
  us: 143441, fr: 143442, de: 143443, gb: 143444, at: 143445, be: 143446, fi: 143447, gr: 143448, ie: 143449, it: 143450,
  lu: 143451, nl: 143452, pt: 143453, es: 143454, ca: 143455, se: 143456, no: 143457, dk: 143458, ch: 143459, au: 143460,
  nz: 143461, jp: 143462, kr: 143466, mx: 143468, pl: 143478, br: 143503, in: 143467, sg: 143464, cn: 143465, tr: 143480,
};

const UA = "Solis/2 (Drift Studio)";

/**
 * Real App Store search order for a term in a storefront (the endpoint the App Store itself uses, public,
 * no account): up to ~250 app ids in display order, plus the names of the first few.
 */
async function appStoreSearch(term: string, country: string): Promise<{ ids: string[]; names: Record<string, string> } | { blocked: number } | null> {
  const sf = STOREFRONTS[country];
  if (!sf) return null;
  const url = `https://search.itunes.apple.com/WebObjects/MZStore.woa/wa/search?${new URLSearchParams({ clientApplication: "Software", media: "software", term })}`;
  const res = await fetch(url, { headers: { "X-Apple-Store-Front": `${sf},29`, Accept: "application/json", "User-Agent": UA } });
  if (res.status === 403 || res.status === 429 || res.status >= 500) return { blocked: res.status };
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  const bubble = json?.pageData?.bubbles?.find((b: any) => Array.isArray(b?.results));
  if (!bubble) return { ids: [], names: {} };
  const ids: string[] = bubble.results.filter((r: any) => r?.entity === "software" || r?.type === 0).map((r: any) => String(r.id));
  const lockups = json?.storePlatformData?.["native-search-lockup"]?.results ?? {};
  const names: Record<string, string> = {};
  for (const [id, l] of Object.entries<any>(lockups)) if (l?.name) names[id] = l.name;
  return { ids, names };
}

/** Public iTunes Search API (top 200): fallback for storefronts without a known id. */
async function itunesSearch(appStoreId: string, keyword: string, country: string): Promise<RankResult> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: keyword, country, entity: "software", limit: "200" })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 403 || res.status === 429 || res.status >= 500) return { blocked: res.status };
  if (!res.ok) throw new Error(`iTunes ${res.status} for "${keyword}" (${country})`);
  const json: any = await res.json();
  const results: any[] = json.results ?? [];
  const index = results.findIndex((r) => String(r.trackId) === appStoreId);
  const competitor = results.find((r) => String(r.trackId) !== appStoreId);
  return { rank: index >= 0 ? index + 1 : null, topCompetitor: competitor?.trackName, resultCount: results.length, source: "itunes" };
}

async function fetchRank(appStoreId: string, keyword: string, country: string): Promise<RankResult> {
  const found = await appStoreSearch(keyword, country);
  if (found && "blocked" in found) return found;
  if (!found) return itunesSearch(appStoreId, keyword, country);
  const index = found.ids.indexOf(appStoreId);
  const competitorId = found.ids.find((id) => id !== appStoreId);
  return { rank: index >= 0 ? index + 1 : null, topCompetitor: competitorId ? found.names[competitorId] : undefined, resultCount: found.ids.length, source: "appstore" };
}

/* ---------- Popularity and difficulty, computed by Solis ---------- */

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}

/** App Store search suggestions for a prefix (what people see while typing), in display order. */
async function searchHints(prefix: string, country: string): Promise<string[] | { blocked: number }> {
  const sf = STOREFRONTS[country] ?? STOREFRONTS.us;
  const url = `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?${new URLSearchParams({ clientApplication: "Software", term: prefix })}`;
  const res = await fetch(url, { headers: { "X-Apple-Store-Front": `${sf},29`, "User-Agent": UA } });
  if (res.status === 403 || res.status === 429 || res.status >= 500) return { blocked: res.status };
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<key>term<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => decodeXml(m[1]).trim().toLowerCase());
}

/** Prefix lengths tried, shortest first (stops at the first one that suggests the keyword). */
function prefixLengths(len: number): number[] {
  const steps = [1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32];
  return [...new Set([...steps.filter((n) => n < len), len])];
}

/** Lowercase without accents: the App Store suggests "reveil" for "réveil". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
}

/** Score by number of letters typed before the App Store suggests the keyword (1 letter = searched a lot). */
const LETTER_SCORE: [number, number][] = [[1, 100], [2, 85], [3, 70], [4, 58], [5, 48], [6, 40], [8, 30], [10, 22], [13, 15], [16, 10]];

/**
 * Estimated popularity, 5 to 100: how few letters must be typed before the App Store suggests the exact
 * keyword, and how high it sits in the list. 5 = never suggested (Apple Search Ads' floor). An estimate
 * from public signals, not Apple's own number.
 */
async function estimatePopularity(keyword: string, country: string): Promise<number | { blocked: number }> {
  const target = fold(keyword);
  const chars = [...keyword];
  for (const len of prefixLengths(chars.length)) {
    const hints = await searchHints(chars.slice(0, len).join(""), country);
    if (!Array.isArray(hints)) return hints;
    const pos = hints.map(fold).indexOf(target);
    if (pos >= 0) {
      const base = LETTER_SCORE.find(([n]) => len <= n)?.[1] ?? 8;
      return Math.max(5, Math.min(100, Math.round(base * (1 - 0.03 * pos))));
    }
    await sleep(700);
  }
  return 5;
}

/** Difficulty, 0 to 100: strength of the top 10 apps (median number of ratings, log scale: 100 000 ratings = 100). */
async function estimateDifficulty(ids: string[], country: string, ownId: string): Promise<number | null> {
  const top = ids.filter((id) => id !== ownId).slice(0, 10);
  if (!top.length) return 0;
  const res = await fetch(`https://itunes.apple.com/lookup?id=${top.join(",")}&country=${country}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  const counts: number[] = (json?.results ?? []).map((r: any) => Number(r.userRatingCount ?? 0)).sort((a: number, b: number) => a - b);
  if (!counts.length) return null;
  const median = counts[Math.floor(counts.length / 2)];
  return Math.max(0, Math.min(100, Math.round((Math.log10(median + 1) / 5) * 100)));
}

const STATS_CHUNK = 8;

/** Computes popularity, difficulty and number of competing apps for keywords not refreshed for 14 days. */
export const statsChunk = internalAction({
  args: { runId: v.optional(v.id("syncRuns")), done: v.optional(v.number()), retries: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const runId = args.runId ?? (await ctx.runMutation(internal.syncRuns.start, { source: "aso_stats" }));
    let done = args.done ?? 0;
    const { batch, remaining } = await ctx.runQuery(internal.asoData.pendingStats, { limit: STATS_CHUNK });
    if (!batch.length) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: done, message: `${done} mots-clés recalculés` });
      return;
    }
    for (const k of batch) {
      const app = appBySlug(k.appSlug);
      if (!app) continue;
      const popularity = await estimatePopularity(k.keyword, k.country);
      const search = await appStoreSearch(k.keyword, k.country);
      const blocked = typeof popularity !== "number" ? popularity : search && "blocked" in search ? search : null;
      if (blocked) {
        const retries = (args.retries ?? 0) + 1;
        if (retries > 6) {
          await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", rows: done, message: `App Store refuse les requêtes (HTTP ${blocked.blocked}), ${remaining + batch.length} mots-clés non recalculés` });
          return;
        }
        await ctx.scheduler.runAfter(retries * 120_000, internal.sources.aso.statsChunk, { runId, done, retries });
        return;
      }
      const ids = search && !("blocked" in search) ? search.ids : [];
      const difficulty = await estimateDifficulty(ids, k.country, app.appStoreId);
      await ctx.runMutation(internal.asoData.writeStats, { id: k.id, popularity: popularity as number, difficulty, competitors: ids.length });
      done++;
      await sleep(SPACING_MS);
    }
    if (remaining > 0) await ctx.scheduler.runAfter(SPACING_MS, internal.sources.aso.statsChunk, { runId, done, retries: 0 });
    else await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: done, message: `${done} mots-clés recalculés` });
  },
});

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
      await ctx.runMutation(internal.asoData.upsertRanking, { ...k, date, rank: result.rank, topCompetitor: result.topCompetitor, resultCount: result.resultCount, source: result.source });
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
    await ctx.runMutation(internal.asoData.upsertRanking, { ...k, date: isoDay(new Date()), rank: result.rank, topCompetitor: result.topCompetitor, resultCount: result.resultCount, source: result.source });
  },
});

export const syncMetadataNow = internalAction({ args: {}, handler: (ctx) => syncMetadata(ctx) });

/** Cron entry point: refresh metadata (and seed keywords), then start today's rank snapshot. */
export const syncRecent = internalAction({
  args: {},
  handler: async (ctx) => {
    await syncMetadata(ctx);
    if (!(await ctx.runQuery(internal.asoData.statsRunActive, {}))) await ctx.scheduler.runAfter(60_000, internal.sources.aso.statsChunk, {});
    if (await ctx.runQuery(internal.asoData.rankRunActive, {})) return;
    await ctx.scheduler.runAfter(0, internal.sources.aso.rankChunk, {});
  },
});
