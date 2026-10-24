import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { addDays, isoDay } from "./lib/dates";

// CortiFree analytics model (page "Apps > CortiFree"). Live Amplitude (EU) + RevenueCat v2 results are
// computed by convex/sources/cortifreeAnalytics.ts ("use node" action) one widget at a time and cached in
// analyticsCache. The page reads the cache through `read` (reactive) and asks the action to refresh what is
// missing or expired. A widget request is { w: widget id, p: params, from/to: period }.

export const APP_SLUG = "cortifree";
/** Bump when a widget's computation changes: old cached payloads are then ignored. */
export const WIDGET_VERSION = 4;

export const requestValidator = v.object({
  w: v.string(),
  p: v.optional(v.any()),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
});
export type WidgetRequest = Infer<typeof requestValidator>;

/** JSON with sorted keys, so equal requests give equal keys whatever the property order. */
function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

/** 64-bit FNV-1a (two 32-bit halves), hex. */
function hash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function requestKey(req: WidgetRequest): string {
  return `${APP_SLUG}:${req.w}:${hash(stable({ v: WIDGET_VERSION, w: req.w, p: req.p ?? null, from: req.from ?? null, to: req.to ?? null }))}`;
}

const MIN = 60_000;
/** 15 min while the period touches the last two days, 6 h for a closed period; errors retry after 2 min. */
export function ttlFor(req: WidgetRequest, error?: boolean, payload?: unknown): number {
  // Partial results (some Amplitude queries were rate-limited) are retried like errors.
  if (error || (typeof payload === "string" && payload.endsWith(',"partial":true}'))) return 2 * MIN;
  const yesterday = addDays(isoDay(new Date()), -1);
  if (req.to && req.to < addDays(yesterday, -1)) return 6 * 60 * MIN;
  return 15 * MIN;
}

/** Cached widget payloads for the page (reactive: cells fill in as the action writes them). */
export const read = authQuery({
  args: { requests: v.array(requestValidator) },
  handler: async (ctx, { requests }) => {
    return Promise.all(
      requests.map(async (req) => {
        const key = requestKey(req);
        const row = await ctx.db
          .query("analyticsCache")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique();
        if (!row) return { key, payload: null as string | null, error: null as string | null, fetchedAt: null as number | null, expiresAt: 0 };
        return {
          key,
          // JSON text written by sources/cortifreeAnalytics:refresh (parsed by the page).
          payload: row.error ? null : typeof row.payload === "string" ? row.payload : null,
          error: row.error ?? null,
          fetchedAt: row.fetchedAt,
          expiresAt: row.fetchedAt + ttlFor(req, !!row.error, row.payload),
        };
      }),
    );
  },
});

/** Keys still fresh (the action skips them unless forced). */
export const freshKeys = internalQuery({
  args: { requests: v.array(requestValidator) },
  handler: async (ctx, { requests }) => {
    const now = Date.now();
    const fresh: string[] = [];
    for (const req of requests) {
      const key = requestKey(req);
      const row = await ctx.db
        .query("analyticsCache")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (row && row.fetchedAt + ttlFor(req, !!row.error, row.payload) > now) fresh.push(key);
    }
    return fresh;
  },
});

export const writeCache = internalMutation({
  args: { key: v.string(), payload: v.optional(v.string()), error: v.optional(v.string()), fetchedAt: v.number() },
  handler: async (ctx, { key, payload, error, fetchedAt }) => {
    const existing = await ctx.db
      .query("analyticsCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    // An error never replaces a good payload: the page keeps showing the last real numbers.
    if (error && existing && !existing.error) return;
    const doc = { key, appSlug: APP_SLUG, payload: error ? null : payload, fetchedAt, error };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("analyticsCache", doc);
  },
});
