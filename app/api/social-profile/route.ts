import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { creatorVideos, creators, socialAccounts } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { now, normalizeHandle } from "@/server/backend/http";
import { fetchSocialProfile, type SocialProfileMetrics } from "@/server/backend/social-providers";

type SocialProfilePayload = {
  followers?: number;
  views?: number;
  avgViews?: number;
  likes?: number;
  comments?: number;
  favorites?: number;
  posts?: number;
  shares?: number;
  engagementRate?: number;
  status: "No public metrics" | "Ready for public tracking";
  videoMetricsReady: boolean;
  source: string;
  videos?: SocialProfileMetrics["videos"];
};

function cleanHandle(value: string) {
  return value.trim().replace(/^@+/, "").replace(/[^a-zA-Z0-9._-]/g, "");
}

function searchableHtml(html: string) {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\\u0022/g, '"')
    .replace(/\\"/g, '"');
}

function parseMetricValue(raw: string) {
  const suffix = raw.slice(-1).toUpperCase();
  const value = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value)) return 0;
  if (suffix === "B") return value * 1_000_000_000;
  if (suffix === "M") return value * 1_000_000;
  if (suffix === "K") return value * 1_000;
  return value;
}

function parseCount(html: string, keys: string[]) {
  const source = searchableHtml(html);
  for (const key of keys) {
    const patterns = [
      new RegExp(`"${key}"\\s*:\\s*"?([\\d.,]+[KMB]?)"?`, "i"),
      new RegExp(`"${key}"\\s*:\\s*\\{[^}]*"value"\\s*:\\s*"?([\\d.,]+[KMB]?)"?`, "i"),
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) return parseMetricValue(match[1]);
    }
  }
  return 0;
}

function parseVideoCounts(html: string, keys: string[]) {
  const source = searchableHtml(html);
  const counts = keys.flatMap((key) => Array.from(
    source.matchAll(new RegExp(`"${key}"\\s*:\\s*"?([\\d.,]+[KMB]?)"?`, "gi")),
    (match) => parseMetricValue(match[1] ?? "0")
  ))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 24);
  return counts;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function extractSecUid(html: string) {
  const source = searchableHtml(html);
  return source.match(/"secUid"\s*:\s*"([^"]+)"/)?.[1] ?? "";
}

type TikwmVideo = {
  video_id?: number | string;
  aweme_id?: number | string;
  title?: string;
  play?: string;
  play_count?: number | string;
  digg_count?: number | string;
  comment_count?: number | string;
  share_count?: number | string;
  collect_count?: number | string;
};

type TikwmPayload = {
  data?: {
    videos?: TikwmVideo[];
  };
};

type TikTokPostApiItem = {
  stats?: {
    playCount?: number | string;
    diggCount?: number | string;
    commentCount?: number | string;
    shareCount?: number | string;
    collectCount?: number | string;
  };
  statsV2?: {
    playCount?: number | string;
    diggCount?: number | string;
    commentCount?: number | string;
    shareCount?: number | string;
    collectCount?: number | string;
  };
};

type TikTokPostApiPayload = {
  itemList?: TikTokPostApiItem[];
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseMetricValue(value);
  return 0;
}

function stableKey(parts: string[]) {
  const input = parts.join(":").toLowerCase();
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function compactVideoUrl(platform: string, handle: string, videoId: string) {
  const normalizedPlatform = platform.trim().toLowerCase();
  if (normalizedPlatform === "tiktok") return `https://www.tiktok.com/@${handle}/video/${videoId}`;
  if (normalizedPlatform === "instagram") return `https://www.instagram.com/p/${videoId}/`;
  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchTikwmVideos(handle: string) {
  const timeout = withTimeout(8_000);
  try {
    const response = await fetch(`https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(handle)}&count=30`, {
      headers: {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
      signal: timeout.controller.signal,
    });
    if (!response.ok) return [];
    const payload = await response.json() as TikwmPayload;
    return Array.isArray(payload.data?.videos) ? payload.data.videos : [];
  } catch {
    return [];
  } finally {
    timeout.done();
  }
}

async function fetchTikTokPostApiVideos(handle: string, secUid: string) {
  if (!secUid) return [];
  const timeout = withTimeout(12_000);
  try {
    const params = new URLSearchParams({
      aid: "1988",
      app_language: "en",
      browser_language: "en-US",
      browser_name: "Mozilla",
      browser_online: "true",
      browser_platform: "MacIntel",
      count: "30",
      cursor: "0",
      device_platform: "web_pc",
      focus_state: "true",
      from_page: "user",
      history_len: "2",
      is_fullscreen: "false",
      is_page_visible: "true",
      language: "en",
      os: "mac",
      region: "US",
      screen_height: "1080",
      screen_width: "1920",
      secUid,
      tz_name: "Europe/Paris",
      webcast_language: "en",
    });
    const response = await fetch(`https://www.tiktok.com/api/post/item_list/?${params.toString()}`, {
      headers: {
        "accept": "application/json,text/plain,*/*",
        "accept-language": "en-US,en;q=0.9",
        "referer": `https://www.tiktok.com/@${handle}`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
      signal: timeout.controller.signal,
    });
    if (!response.ok) return [];
    const text = await response.text();
    if (!text.trim().startsWith("{")) return [];
    const payload = JSON.parse(text) as TikTokPostApiPayload;
    return Array.isArray(payload.itemList)
      ? payload.itemList.map((item) => {
        const stats = item.stats ?? item.statsV2 ?? {};
        return {
          play_count: stats.playCount,
          digg_count: stats.diggCount,
          comment_count: stats.commentCount,
          share_count: stats.shareCount,
          collect_count: stats.collectCount,
        };
      })
      : [];
  } catch {
    return [];
  } finally {
    timeout.done();
  }
}

async function fetchTikTokPublic(handle: string): Promise<SocialProfilePayload> {
  const timeout = withTimeout(8_000);
  try {
    const response = await fetch(`https://www.tiktok.com/@${handle}`, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
      signal: timeout.controller.signal,
    });
    if (!response.ok) throw new Error(`TikTok responded ${response.status}`);
    const html = await response.text();
    const secUid = extractSecUid(html);
    const followers = parseCount(html, ["followerCount", "follower_count"]);
    const posts = parseCount(html, ["videoCount", "video_count"]);
    const profileLikes = parseCount(html, ["heartCount", "heart_count"]);
    const viewCounts = parseVideoCounts(html, ["playCount", "play_count", "viewCount", "view_count"]);
    const videoLikes = parseVideoCounts(html, ["diggCount", "digg_count", "likeCount", "like_count"]);
    const comments = sum(parseVideoCounts(html, ["commentCount", "comment_count"]));
    const shares = sum(parseVideoCounts(html, ["shareCount", "share_count"]));
    const favorites = sum(parseVideoCounts(html, ["collectCount", "collect_count", "favoriteCount", "favorite_count"]));
    const postApiVideos = viewCounts.length ? [] : await fetchTikTokPostApiVideos(handle, secUid);
    const fallbackVideos = viewCounts.length || postApiVideos.length ? [] : await fetchTikwmVideos(handle);
    const publicVideos = postApiVideos.length ? postApiVideos : fallbackVideos;
    const fallbackViews = publicVideos.map((video) => numberFromUnknown(video.play_count)).filter((value) => value > 0);
    const fallbackLikes = publicVideos.map((video) => numberFromUnknown(video.digg_count)).filter((value) => value > 0);
    const fallbackComments = publicVideos.map((video) => numberFromUnknown(video.comment_count)).filter((value) => value > 0);
    const fallbackShares = publicVideos.map((video) => numberFromUnknown(video.share_count)).filter((value) => value > 0);
    const fallbackFavorites = publicVideos.map((video) => numberFromUnknown(video.collect_count)).filter((value) => value > 0);
    const resolvedViews = viewCounts.length ? viewCounts : fallbackViews;
    const views = sum(resolvedViews);
    const likes = sum(videoLikes) || sum(fallbackLikes) || profileLikes;
    const resolvedComments = comments || sum(fallbackComments);
    const resolvedShares = shares || sum(fallbackShares);
    const resolvedFavorites = favorites || sum(fallbackFavorites);
    const avgViews = resolvedViews.length ? views / resolvedViews.length : undefined;
    const engagementRate = views ? (likes / views) * 100 : undefined;
    const videoMetricsReady = Boolean(views || resolvedComments || resolvedShares || resolvedFavorites || resolvedViews.length);
    const source = postApiVideos.length
      ? "TikTok public post API"
      : fallbackVideos.length
        ? "TikTok public posts mirror"
        : videoMetricsReady
          ? "TikTok public profile posts"
          : "TikTok public profile partial";

    return {
      followers: followers || undefined,
      posts: posts || resolvedViews.length || undefined,
      views: views || undefined,
      avgViews,
      likes: likes || undefined,
      comments: resolvedComments || undefined,
      shares: resolvedShares || undefined,
      favorites: resolvedFavorites || undefined,
      engagementRate,
      status: videoMetricsReady ? "Ready for public tracking" : "No public metrics",
      videoMetricsReady,
      source,
      videos: publicVideos.map((video, index) => {
        const id = String(video.video_id ?? video.aweme_id ?? `${handle}-${index}`);
        return {
          id,
          comments: numberFromUnknown(video.comment_count) || undefined,
          favorites: numberFromUnknown(video.collect_count) || undefined,
          likes: numberFromUnknown(video.digg_count) || undefined,
          shares: numberFromUnknown(video.share_count) || undefined,
          title: typeof video.title === "string" ? video.title : undefined,
          url: typeof video.play === "string" ? video.play : compactVideoUrl("tiktok", handle, id),
          views: numberFromUnknown(video.play_count) || undefined,
        };
      }).filter((video) => video.views || video.likes || video.comments || video.shares || video.favorites),
    };
  } finally {
    timeout.done();
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "";
  const handle = cleanHandle(url.searchParams.get("handle") ?? "");
  const accountId = url.searchParams.get("accountId") ?? "";

  if (!handle) return Response.json({ error: "Missing handle" }, { status: 400 });
  if (!accountId) return Response.json({ error: "Missing accountId" }, { status: 400 });

  try {
    const session = await getOrCreateLocalSession();
    const db = await getDb();
    const [account] = await db.select().from(socialAccounts).where(and(
      eq(socialAccounts.id, accountId),
      eq(socialAccounts.workspaceId, session.workspaceId),
    )).limit(1);
    if (!account) return Response.json({ error: "Social account not found" }, { status: 404 });
    if (account.status === "syncing") return Response.json({ error: "Sync already running" }, { status: 409 });
    const lastSyncedAt = Number(account.lastSyncedAt || 0) * 1000;
    if (lastSyncedAt && Date.now() - lastSyncedAt < 15 * 60 * 1000) {
      return Response.json({ error: "This account was synced less than 15 minutes ago" }, { status: 429 });
    }
    await db.update(socialAccounts).set({ status: "syncing", updatedAt: now() }).where(and(
      eq(socialAccounts.id, accountId),
      eq(socialAccounts.workspaceId, session.workspaceId),
    ));
    const fallback = platform.toLowerCase() === "tiktok"
      ? () => fetchTikTokPublic(handle)
      : async (): Promise<SocialProfilePayload> => ({
        source: "Apify token required",
        status: "No public metrics",
        videoMetricsReady: false,
      });
    const profile = await fetchSocialProfile(platform, handle, fallback);
    const filteredProfile = accountId ? await applyAccountTrackingRules(accountId, profile) : profile;
    if (accountId) await persistSocialProfile(accountId, platform, handle, filteredProfile);
    return Response.json(filteredProfile);
  } catch (error) {
    if (accountId) {
      try {
        const session = await getOrCreateLocalSession();
        const db = await getDb();
        await db.update(socialAccounts).set({ status: "no_public_metrics", lastError: error instanceof Error ? error.message : "Social lookup failed", updatedAt: now() }).where(and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.workspaceId, session.workspaceId),
        ));
      } catch {
        // Preserve the original provider error response if status persistence fails.
      }
    }
    return Response.json({
      error: error instanceof Error ? error.message : "Social lookup failed",
      status: "No public metrics",
      videoMetricsReady: false,
      source: "TikTok public profile",
    });
  }
}

export async function GET() {
  return Response.json({ error: "Social sync requires an explicit POST action" }, { status: 405, headers: { Allow: "POST" } });
}

async function applyAccountTrackingRules(accountId: string, profile: SocialProfileMetrics): Promise<SocialProfileMetrics> {
  const session = await getOrCreateLocalSession();
  const db = await getDb();
  const [account] = await db.select().from(socialAccounts).where(and(
    eq(socialAccounts.id, accountId),
    eq(socialAccounts.workspaceId, session.workspaceId),
  )).limit(1);
  if (!account) return profile;

  const hashtags = account.trackingHashtags.split(",").map((value) => value.trim().replace(/^#+/, "")).filter(Boolean);
  const keywords = account.trackingKeywords.split(",").map((value) => value.trim()).filter(Boolean);
  const conditions = [
    ...hashtags.map((tag) => (title: string) => title.includes(`#${tag}`) || new RegExp(`(^|\\s)${escapeRegExp(tag)}(\\s|$)`, "i").test(title)),
    ...keywords.map((keyword) => (title: string) => title.includes(keyword)),
  ];
  if (!conditions.length) return profile;

  const videos = (profile.videos ?? []).filter((video) => {
    const title = String(video.title || "").toLowerCase();
    const results = conditions.map((condition) => condition(title));
    return account.trackingMatch === "all" ? results.every(Boolean) : results.some(Boolean);
  });
  const views = videos.reduce((sum, video) => sum + (video.views ?? 0), 0);
  const likes = videos.reduce((sum, video) => sum + (video.likes ?? 0), 0);
  const comments = videos.reduce((sum, video) => sum + (video.comments ?? 0), 0);
  const shares = videos.reduce((sum, video) => sum + (video.shares ?? 0), 0);
  const favorites = videos.reduce((sum, video) => sum + (video.favorites ?? 0), 0);
  return {
    ...profile,
    avgViews: videos.length ? views / videos.length : 0,
    comments,
    engagementRate: views ? (likes / views) * 100 : 0,
    favorites,
    likes,
    posts: videos.length,
    shares,
    source: `${profile.source} · filtered`,
    videos,
    videoMetricsReady: profile.videoMetricsReady,
    views,
  };
}

async function persistSocialProfile(accountId: string, platform: string, handle: string, profile: SocialProfileMetrics) {
  const session = await getOrCreateLocalSession();
  const db = await getDb();
  const timestamp = now();
  const normalizedPlatform = platform.trim().toLowerCase();
  const normalizedHandle = normalizeHandle(handle);
  await db.update(socialAccounts).set({
    avgViews: Math.round(profile.avgViews ?? 0),
    comments: Math.round(profile.comments ?? 0),
    engagementRate: profile.engagementRate ?? 0,
    favorites: Math.round(profile.favorites ?? 0),
    followers: Math.round(profile.followers ?? 0),
    lastError: profile.videoMetricsReady ? null : "No public video metrics available from configured providers.",
    lastSyncedAt: timestamp,
    likes: Math.round(profile.likes ?? 0),
    posts: Math.round(profile.posts ?? 0),
    shares: Math.round(profile.shares ?? 0),
    source: profile.source,
    status: profile.videoMetricsReady ? "ready" : "no_public_metrics",
    updatedAt: timestamp,
    views: Math.round(profile.views ?? 0),
  }).where(and(
    eq(socialAccounts.id, accountId),
    eq(socialAccounts.workspaceId, session.workspaceId),
    eq(socialAccounts.platform, normalizedPlatform),
    eq(socialAccounts.handle, normalizedHandle),
  ));

  const [socialAccount] = await db.select().from(socialAccounts).where(and(
    eq(socialAccounts.id, accountId),
    eq(socialAccounts.workspaceId, session.workspaceId),
    eq(socialAccounts.platform, normalizedPlatform),
    eq(socialAccounts.handle, normalizedHandle),
  )).limit(1);
  if (!socialAccount) return;

  const [existingCreator] = await db.select().from(creators).where(and(
    eq(creators.workspaceId, session.workspaceId),
    eq(creators.platform, normalizedPlatform),
    eq(creators.handle, normalizedHandle),
  )).limit(1);
  const creatorId = existingCreator?.id ?? `creator-${stableKey([session.workspaceId, normalizedPlatform, normalizedHandle])}`;
  const creatorValues = {
    workspaceId: session.workspaceId,
    name: socialAccount.creatorName || normalizedHandle,
    handle: normalizedHandle,
    platform: normalizedPlatform,
    email: socialAccount.email || null,
    status: profile.videoMetricsReady ? "tracked" : "source_limited",
    updatedAt: timestamp,
  };
  if (existingCreator) {
    await db.update(creators).set(creatorValues).where(eq(creators.id, existingCreator.id));
  } else {
    await db.insert(creators).values({
      id: creatorId,
      ...creatorValues,
      createdAt: timestamp,
    });
  }

  await db.delete(creatorVideos).where(and(
    eq(creatorVideos.workspaceId, session.workspaceId),
    eq(creatorVideos.socialAccountId, accountId),
  ));

  for (const video of profile.videos ?? []) {
    const remoteVideoId = String(video.id || video.url || crypto.randomUUID());
    const videoId = `video-${stableKey([session.workspaceId, accountId, remoteVideoId])}`;
    const videoValues = {
      workspaceId: session.workspaceId,
      creatorId,
      socialAccountId: accountId,
      campaignId: null,
      appId: socialAccount.appId,
      platform: normalizedPlatform,
      url: video.url || compactVideoUrl(normalizedPlatform, normalizedHandle, remoteVideoId),
      title: video.title || null,
      thumbnailUrl: video.thumbnailUrl || null,
      publishedAt: video.publishedAt || null,
      cost: 0,
      views: Math.round(video.views ?? 0),
      likes: Math.round(video.likes ?? 0),
      comments: Math.round(video.comments ?? 0),
      shares: Math.round(video.shares ?? 0),
      favorites: Math.round(video.favorites ?? 0),
      attributedInstalls: 0,
      updatedAt: timestamp,
    };
    await db.insert(creatorVideos).values({
      id: videoId,
      ...videoValues,
      createdAt: timestamp,
    });
  }
}
