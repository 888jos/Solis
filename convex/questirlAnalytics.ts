import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery } from "./lib/auth";

// Quest IRL analytics (page "Apps > Quest IRL"). Live PostHog results are computed by
// sources/questirlAnalytics.ts ("use node") and cached in analyticsCache; this file reads the cache.

export const QUESTIRL_SLUG = "questirl";
/** Bump when the summary shape or its computation changes: old cache entries are then ignored. */
export const QUESTIRL_SUMMARY_VERSION = 1;
export const QUESTIRL_REQUIRED_ENV = ["POSTHOG_QUESTIRL_HOST", "POSTHOG_QUESTIRL_PROJECT_ID", "POSTHOG_QUESTIRL_PERSONAL_KEY"] as const;

/** FNV-1a 32-bit, hex. Stable across the V8 and Node runtimes (no crypto needed). */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Cache key: hash of query kind + version + period + app. */
export function questirlCacheKey(kind: string, from: string, to: string): string {
  const raw = `${QUESTIRL_SLUG}|${kind}|v${QUESTIRL_SUMMARY_VERSION}|${from}|${to}`;
  return `${QUESTIRL_SLUG}:${kind}:${fnv1a(raw)}`;
}

/** 15 min while the window includes today, 24 h for a closed window. */
export function questirlTtlMs(to: string, now = Date.now()): number {
  const today = new Date(now).toISOString().slice(0, 10);
  return to >= today ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

export function missingQuestirlEnv(): string[] {
  return QUESTIRL_REQUIRED_ENV.filter((name) => !process.env[name]);
}

export const getEntry = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

export const putEntry = internalMutation({
  args: { key: v.string(), payload: v.optional(v.any()), error: v.optional(v.string()), fetchedAt: v.number() },
  handler: async (ctx, { key, payload, error, fetchedAt }) => {
    const existing = await ctx.db.query("analyticsCache").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (error !== undefined && existing && existing.payload != null) {
      // Keep the last good payload, only record the error.
      await ctx.db.patch(existing._id, { error });
      return;
    }
    const doc = { key, appSlug: QUESTIRL_SLUG, payload: payload ?? null, fetchedAt, error };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("analyticsCache", doc);
  },
});

/** Cached PostHog summary for a window [from, to] (UTC days, inclusive). */
export const summary = authQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const missing = missingQuestirlEnv();
    if (missing.length) return { missingEnv: missing, payload: null, fetchedAt: null, error: null, ttlMs: 0 };
    const entry = await ctx.db
      .query("analyticsCache")
      .withIndex("by_key", (q) => q.eq("key", questirlCacheKey("summary", from, to)))
      .unique();
    return {
      missingEnv: [] as string[],
      payload: entry?.payload ?? null,
      fetchedAt: entry?.payload != null ? entry.fetchedAt : null,
      error: entry?.error ?? null,
      ttlMs: questirlTtlMs(to),
    };
  },
});
