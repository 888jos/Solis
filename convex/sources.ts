import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { authAction, authQuery } from "./lib/auth";

// Sources page model: registry of every data source, its sync job, freshness from syncRuns and the
// presence (never the value) of the env vars it needs.

export type JobId = "revenue" | "subscriptions" | "reviews" | "versions" | "aso" | "engagement" | "aiCosts" | "airtable" | "fx" | "brief";

type SyncRef = FunctionReference<"action", "internal", Record<string, never>>;

const JOBS: Record<JobId, { ref: SyncRef; label: string }> = {
  revenue: { ref: internal.sources.revenue.syncRecent as SyncRef, label: "Ventes App Store" },
  subscriptions: { ref: internal.sources.subscriptions.syncRecent as SyncRef, label: "Abonnements" },
  reviews: { ref: internal.sources.reviews.syncRecent as SyncRef, label: "Avis et notes" },
  versions: { ref: internal.sources.versions.syncRecent as SyncRef, label: "Versions" },
  aso: { ref: internal.sources.aso.syncRecent as SyncRef, label: "ASO" },
  engagement: { ref: internal.sources.engagement.syncRecent as SyncRef, label: "Engagement" },
  aiCosts: { ref: internal.sources.aiCosts.syncRecent as SyncRef, label: "Coûts IA" },
  airtable: { ref: internal.sources.airtable.syncRecent as SyncRef, label: "UGC" },
  fx: { ref: internal.fx.syncRecent as SyncRef, label: "Taux de change" },
  brief: { ref: internal.brief.sendDailyNow as SyncRef, label: "Brief Telegram" },
};

type SourceDef = {
  source: string; // syncRuns.source
  name: string;
  feeds: string;
  job: JobId | null;
  envs: string[];
  cadence: string; // shown in the UI
  staleAfterHours: number; // last success older than this → "en retard"
};

const ASC = ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY_B64", "ASC_VENDOR_NUMBER"];

export const SOURCES: SourceDef[] = [
  { source: "asc_sales", name: "App Store Connect · ventes", feeds: "Revenus, Pays, Rentabilité", job: "revenue", envs: ASC, cadence: "toutes les 6 h", staleAfterHours: 36 },
  { source: "asc_subscriptions", name: "App Store Connect · abonnements", feeds: "Abonnements", job: "subscriptions", envs: ASC, cadence: "toutes les 3 h", staleAfterHours: 12 },
  { source: "revenuecat", name: "RevenueCat · CortiFree", feeds: "Abonnements (MRR, essais)", job: "subscriptions", envs: ["REVENUECAT_CORTIFREE_SECRET_KEY", "REVENUECAT_CORTIFREE_PROJECT_ID"], cadence: "toutes les 3 h", staleAfterHours: 12 },
  { source: "asc_reviews", name: "App Store Connect · avis", feeds: "Avis & notes", job: "reviews", envs: ASC, cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "itunes_ratings", name: "iTunes Lookup · notes par pays", feeds: "Avis & notes", job: "reviews", envs: [], cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "asc_versions", name: "App Store Connect · versions", feeds: "Versions", job: "versions", envs: ASC, cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "aso_metadata", name: "App Store Connect · fiches", feeds: "ASO", job: "aso", envs: ASC, cadence: "chaque jour", staleAfterHours: 50 },
  { source: "aso_ranks", name: "iTunes Search · positions", feeds: "ASO", job: "aso", envs: [], cadence: "chaque jour", staleAfterHours: 50 },
  { source: "amplitude", name: "Amplitude · CortiFree", feeds: "Engagement", job: "engagement", envs: ["AMPLITUDE_CORTIFREE_API_KEY", "AMPLITUDE_CORTIFREE_SECRET_KEY"], cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "amplitude_questirl", name: "Amplitude · Quest IRL", feeds: "Engagement", job: "engagement", envs: ["AMPLITUDE_QUESTIRL_API_KEY", "AMPLITUDE_QUESTIRL_SECRET_KEY"], cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "amplitude_cocorise", name: "Amplitude · Cocorise", feeds: "Engagement", job: "engagement", envs: ["AMPLITUDE_COCORISE_API_KEY", "AMPLITUDE_COCORISE_SECRET_KEY"], cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "posthog", name: "PostHog · Quest IRL", feeds: "Engagement", job: "engagement", envs: ["POSTHOG_QUESTIRL_HOST", "POSTHOG_QUESTIRL_PROJECT_ID", "POSTHOG_QUESTIRL_PERSONAL_KEY"], cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "openai_api", name: "OpenAI · coûts API", feeds: "Dépenses", job: "aiCosts", envs: ["OPENAI_ADMIN_KEY"], cadence: "chaque jour", staleAfterHours: 50 },
  { source: "anthropic_api", name: "Anthropic · coûts API", feeds: "Dépenses", job: "aiCosts", envs: ["ANTHROPIC_ADMIN_KEY"], cadence: "chaque jour", staleAfterHours: 50 },
  { source: "airtable_ugc", name: "Airtable · base UGC", feeds: "Créateurs UGC, Acquisition", job: "airtable", envs: ["AIRTABLE_TOKEN"], cadence: "toutes les 6 h", staleAfterHours: 18 },
  { source: "fx", name: "Taux de change EUR", feeds: "Conversions en euros", job: "fx", envs: [], cadence: "chaque jour", staleAfterHours: 50 },
  { source: "telegram_brief", name: "Telegram · brief", feeds: "Brief du matin, récap du lundi", job: "brief", envs: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], cadence: "chaque jour 06:30 UTC", staleAfterHours: 50 },
];

/** A "running" row older than this was killed (timeout, redeploy): not running any more. */
const STALE_RUNNING_MS = 30 * 60 * 1000;

export type SourceState = "ok" | "late" | "error" | "running" | "interrupted" | "notConfigured" | "never";

type Run = Doc<"syncRuns">;

function stateOf(def: Pick<SourceDef, "staleAfterHours">, latest: Run | null, lastOkAt: number | null, missingEnv: string[], now: number): SourceState {
  if (!latest) return missingEnv.length ? "notConfigured" : "never";
  if (latest.status === "running") return now - latest.startedAt > STALE_RUNNING_MS ? "interrupted" : "running";
  if (latest.status === "skipped") return "notConfigured";
  if (latest.status === "error") return "error";
  if (lastOkAt && now - lastOkAt > def.staleAfterHours * 3600 * 1000) return "late";
  return "ok";
}

async function sourceStatus(ctx: QueryCtx, def: SourceDef, now: number) {
  const runs = await ctx.db
    .query("syncRuns")
    .withIndex("by_source_started", (q) => q.eq("source", def.source))
    .order("desc")
    .take(60);
  const latest = runs[0] ?? null;
  // The run in progress says nothing about health: judge on the latest finished run.
  const finished = runs.find((r) => r.status !== "running") ?? null;
  const lastOk = runs.find((r) => r.status === "ok") ?? null;
  const lastError = runs.find((r) => r.status === "error") ?? null;
  const missingEnv = def.envs.filter((name) => !process.env[name]);
  const lastOkAt = lastOk ? (lastOk.finishedAt ?? lastOk.startedAt) : null;
  const state = stateOf(def, latest, lastOkAt, missingEnv, now);
  const health = finished ? stateOf(def, finished, lastOkAt, missingEnv, now) : state;
  return {
    source: def.source,
    name: def.name,
    feeds: def.feeds,
    job: def.job,
    cadence: def.cadence,
    state,
    health,
    missingEnv,
    lastRunAt: latest ? latest.startedAt : null,
    lastOkAt,
    lastOkRows: lastOk?.rows ?? null,
    lastOkMessage: lastOk?.message ?? null,
    lastErrorAt: lastError ? (lastError.finishedAt ?? lastError.startedAt) : null,
    // Only an error that is still the latest outcome matters; an old one is history.
    lastErrorMessage: lastError?.message ?? null,
    errorIsCurrent: !!finished && finished.status === "error",
    skippedMessage: latest?.status === "skipped" ? (latest.message ?? null) : null,
    runs24h: runs.filter((r) => now - r.startedAt < 86400000).length,
  };
}

export type SourceStatusRow = Awaited<ReturnType<typeof sourceStatus>>;

async function allStatuses(ctx: QueryCtx): Promise<SourceStatusRow[]> {
  const now = Date.now();
  const rows: SourceStatusRow[] = [];
  for (const def of SOURCES) rows.push(await sourceStatus(ctx, def, now));
  return rows;
}

/** Shared with the daily brief (sync errors section). */
export const statusesInternal = internalQuery({
  args: {},
  handler: (ctx): Promise<SourceStatusRow[]> => allStatuses(ctx),
});

export const overview = authQuery({
  args: {},
  handler: async (ctx) => {
    const sources = await allStatuses(ctx);
    // Sources nobody registered here yet (a new sync written by another module) still show up.
    const known = new Set(SOURCES.map((s) => s.source));
    const recent = await ctx.db.query("syncRuns").order("desc").take(300);
    const unknown = [...new Set(recent.map((r) => r.source).filter((s) => !known.has(s)))].sort();
    const now = Date.now();
    for (const source of unknown) {
      sources.push(await sourceStatus(ctx, { source, name: source, feeds: "—", job: null, envs: [], cadence: "—", staleAfterHours: 1e9 }, now));
    }
    const batches = await ctx.db.query("importBatches").order("desc").take(50);
    const done = batches.filter((b) => b.status !== "running");
    const lastBatch = done[0] ?? null;
    return {
      sources,
      bank: {
        imports: done.length,
        lastImportAt: lastBatch?.importedAt ?? null,
        lastFileName: lastBatch?.fileName ?? null,
        lastRows: lastBatch?.rowsImported ?? null,
        lastRange: lastBatch?.dateFrom && lastBatch?.dateTo ? { from: lastBatch.dateFrom, to: lastBatch.dateTo } : null,
      },
      jobs: Object.entries(JOBS).map(([id, j]) => ({ id: id as JobId, label: j.label })),
      generatedAt: now,
    };
  },
});

const jobArg = v.union(...(Object.keys(JOBS) as JobId[]).map((id) => v.literal(id)));

/** "Synchroniser": schedules that job's cheap sync now (the page follows syncRuns reactively). */
export const syncNow = authAction({
  args: { job: jobArg },
  handler: async (ctx, { job }): Promise<{ scheduled: JobId[] }> => {
    await ctx.scheduler.runAfter(0, JOBS[job].ref, {});
    return { scheduled: [job] };
  },
});

/** "Tout synchroniser": every data job (not the Telegram brief, which sends a message). Staggered a bit. */
export const syncAll = authAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: JobId[] }> => {
    const ids = (Object.keys(JOBS) as JobId[]).filter((id) => id !== "brief");
    let delay = 0;
    for (const id of ids) {
      await ctx.scheduler.runAfter(delay, JOBS[id].ref, {});
      delay += 2000;
    }
    return { scheduled: ids };
  },
});

/* ---------- Settings: env presence (names + booleans only, never values) ---------- */

const ENV_GROUPS: { group: string; names: string[]; optional: boolean }[] = [
  { group: "Accès", names: ["SOLIS_ACCESS_TOKEN"], optional: false },
  { group: "App Store Connect", names: ASC, optional: false },
  { group: "RevenueCat", names: ["REVENUECAT_CORTIFREE_SECRET_KEY", "REVENUECAT_CORTIFREE_PROJECT_ID", "REVENUECAT_COCORISE_SECRET_KEY", "REVENUECAT_COCORISE_PROJECT_ID", "REVENUECAT_QUESTIRL_SECRET_KEY", "REVENUECAT_QUESTIRL_PROJECT_ID"], optional: true },
  { group: "Amplitude", names: ["AMPLITUDE_CORTIFREE_API_KEY", "AMPLITUDE_CORTIFREE_SECRET_KEY", "AMPLITUDE_API_BASE_URL"], optional: true },
  { group: "PostHog", names: ["POSTHOG_QUESTIRL_HOST", "POSTHOG_QUESTIRL_PROJECT_ID", "POSTHOG_QUESTIRL_PERSONAL_KEY"], optional: true },
  { group: "Coûts IA", names: ["OPENAI_ADMIN_KEY", "ANTHROPIC_ADMIN_KEY"], optional: true },
  { group: "Airtable", names: ["AIRTABLE_TOKEN"], optional: true },
  { group: "Telegram", names: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], optional: true },
];

export const envPresence = authQuery({
  args: {},
  handler: async (ctx) => {
    const batches = await ctx.db.query("importBatches").take(1);
    return {
      groups: ENV_GROUPS.map((g) => ({ ...g, vars: g.names.map((name) => ({ name, present: !!process.env[name] })) })),
      hasBankImport: batches.length > 0,
    };
  },
});
