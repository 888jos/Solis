import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { fetchRetry } from "../lib/http";

// Post for Me → Solis (page Performance). Server-side, every 3 h:
//   GET /v1/social-accounts                      every connected account (TikTok, Instagram, ...)
//   GET /v1/social-account-feeds/{id}?expand=metrics   its posts with views, likes, comments, shares
// Env on Convex: POSTFORME_API_KEY (never logged, never sent anywhere else).
// Same reading as Otto's "Vigie" stats (brandon/convex/studioStats.ts), for every project.

const SOURCE = "postforme";
const API = "https://api.postforme.dev/v1";
const MAX_PAGES = 12; // 50 posts per page
const PLATFORMS = new Set(["tiktok", "instagram", "facebook", "youtube", "x", "threads", "linkedin", "pinterest", "bluesky"]);

const HANDLE = /^[A-Za-z0-9._]{2,40}$/;

/** Handle from a post: its URL (tiktok.com/@handle/...) or the account id the feed gives. */
function handleOf(p: any): string | null {
  const fromUrl = /tiktok\.com\/@([^/?#]+)/.exec(String(p.platform_url ?? ""))?.[1];
  if (fromUrl && HANDLE.test(fromUrl)) return fromUrl;
  const ext = String(p.external_account_id ?? "").replace(/^@/, "");
  return HANDLE.test(ext) && !/^\d+$/.test(ext) ? ext : null;
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : 0);
const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);

async function get(key: string, path: string, query: Record<string, string> = {}): Promise<any> {
  const u = new URL(API + path);
  for (const [k, val] of Object.entries(query)) u.searchParams.set(k, val);
  const res = await fetchRetry(u.toString(), { headers: { Authorization: `Bearer ${key}` } }, { retries: 3, baseDelayMs: 2000 });
  if (!res.ok) throw new Error(`Post for Me ${res.status} sur ${path}`);
  return res.json();
}

function parisDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

async function sync(ctx: ActionCtx) {
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
  const key = process.env.POSTFORME_API_KEY;
  if (!key) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "Il manque POSTFORME_API_KEY" });
    return { status: "skipped" };
  }
  try {
    const now = Date.now();
    const day = parisDay(now);
    const accounts: any[] = (await get(key, "/social-accounts", { limit: "100" })).data ?? [];
    let posts = 0;
    const errors: string[] = [];
    for (const a of accounts) {
      const platform = String(a.platform ?? "").toLowerCase();
      if (typeof a.id !== "string" || !PLATFORMS.has(platform)) continue;
      // Post for Me gives TikTok accounts their display name ("Lola"): the handle comes from the posts.
      const displayName = String(a.username ?? a.external_id ?? a.id).replace(/^@/, "").slice(0, 80);
      let username = platform !== "tiktok" && HANDLE.test(displayName) ? displayName : "";
      const rows = [];
      let cursor: string | undefined;
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const r = await get(key, `/social-account-feeds/${a.id}`, { expand: "metrics", limit: "50", ...(cursor ? { cursor } : {}) });
          for (const p of (r.data ?? []) as any[]) {
            if (!username) username = handleOf(p) ?? "";
            const m = p.metrics ?? {};
            const postedAt = Date.parse(String(p.posted_at ?? ""));
            if (typeof p.platform_post_id !== "string" || Number.isNaN(postedAt)) continue;
            const media = Array.isArray(p.media) ? p.media[0] ?? {} : {};
            rows.push({
              postId: p.platform_post_id,
              platform,
              account: "",
              url: str(p.platform_url)?.split("?")[0],
              caption: str(p.caption)?.slice(0, 300),
              postedAt,
              thumbnailUrl: str(media.thumbnail_url) ?? str(media.preview_url) ?? str(p.thumbnail_url),
              mediaUrl: str(media.url),
              views: num(m.view_count ?? m.views ?? m.play_count),
              likes: num(m.like_count ?? m.likes),
              comments: num(m.comment_count ?? m.comments),
              shares: num(m.share_count ?? m.shares),
              saves: num(m.save_count ?? m.saved ?? m.saves) || undefined,
            });
          }
          const meta = r.meta ?? {};
          cursor = meta.has_more === true && typeof meta.cursor === "string" ? meta.cursor : undefined;
          if (!cursor) break;
        }
      } catch (err) {
        errors.push(`@${username || displayName} (${platform}) : ${(err as Error).message}`);
      }
      if (!username) username = displayName;
      for (const row of rows) row.account = username;
      await ctx.runMutation(internal.marketingData.upsertAccount, {
        pfmId: a.id,
        platform,
        username,
        displayName,
        avatarUrl: str(a.profile_photo_url) ?? str(a.avatar_url),
        status: str(a.status),
      });
      for (let i = 0; i < rows.length; i += 100) {
        await ctx.runMutation(internal.marketingData.upsertPosts, { pfmAccountId: a.id, day, rows: rows.slice(i, i + 100) });
      }
      posts += rows.length;
    }
    await ctx.runMutation(internal.marketingData.cleanupSeeds, {});
    await ctx.runMutation(internal.syncRuns.finish, {
      runId,
      status: errors.length && !posts ? "error" : "ok",
      rows: posts,
      message: [`${accounts.length} comptes, ${posts} publications`, ...errors].join(" · ").slice(0, 400),
    });
    return { status: "ok", accounts: accounts.length, posts };
  } catch (err) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String((err as Error).message ?? err).slice(0, 300) });
    return { status: "error" };
  }
}

export const syncRecent = internalAction({ args: {}, handler: (ctx) => sync(ctx) });
export const syncNow = internalAction({ args: { note: v.optional(v.string()) }, handler: (ctx) => sync(ctx) });
