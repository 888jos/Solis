export type SocialProfileMetrics = {
  avgViews?: number;
  comments?: number;
  engagementRate?: number;
  favorites?: number;
  followers?: number;
  likes?: number;
  posts?: number;
  shares?: number;
  source: string;
  status: "No public metrics" | "Ready for public tracking";
  videos?: SocialVideo[];
  videoMetricsReady: boolean;
  views?: number;
};

export type SocialVideo = {
  comments?: number;
  favorites?: number;
  id: string;
  likes?: number;
  publishedAt?: string;
  shares?: number;
  title?: string;
  thumbnailUrl?: string;
  url?: string;
  views?: number;
};

type ApifyItem = Record<string, unknown>;

const APIFY_BASE_URL = "https://api.apify.com/v2";

function cleanBareHandle(value: string) {
  return value.trim().replace(/^@+/, "").replace(/[^a-zA-Z0-9._-]/g, "");
}

function metricNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  const suffix = trimmed.slice(-1).toUpperCase();
  const number = Number(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) return 0;
  if (suffix === "B") return number * 1_000_000_000;
  if (suffix === "M") return number * 1_000_000;
  if (suffix === "K") return number * 1_000;
  return number;
}

function firstMetric(item: ApifyItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    const metric = metricNumber(value);
    if (metric > 0) return metric;
  }
  return 0;
}

function nestedMetric(item: ApifyItem, parents: string[], keys: string[]) {
  for (const parentKey of parents) {
    const parent = item[parentKey];
    if (!parent || typeof parent !== "object") continue;
    const metric = firstMetric(parent as ApifyItem, keys);
    if (metric > 0) return metric;
  }
  return firstMetric(item, keys);
}

function itemUrl(item: ApifyItem) {
  return String(item.url ?? item.webVideoUrl ?? item.videoUrl ?? item.shortCode ?? "");
}

function videoIdFromItem(item: ApifyItem) {
  return String(item.id ?? item.videoId ?? item.awemeId ?? item.shortCode ?? itemUrl(item) ?? crypto.randomUUID());
}

function itemTitle(item: ApifyItem) {
  return String(item.text ?? item.caption ?? item.title ?? item.description ?? "").trim();
}

function itemThumbnail(item: ApifyItem) {
  const videoMeta = item.videoMeta && typeof item.videoMeta === "object" ? item.videoMeta as ApifyItem : {};
  const images = Array.isArray(item.images) ? item.images : [];
  return String(
    item.coverUrl ?? item.thumbnailUrl ?? item.displayUrl ?? item.imageUrl ??
    videoMeta.coverUrl ?? videoMeta.originalCoverUrl ?? images[0] ?? ""
  ).trim();
}

function itemPublishedAt(item: ApifyItem) {
  const raw = item.createTimeISO ?? item.takenAtTimestamp ?? item.timestamp ?? item.createdAt ?? item.createTime;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw > 10_000_000_000 ? raw : raw * 1000).toISOString();
  }
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function isVideoItem(item: ApifyItem) {
  const url = itemUrl(item);
  return Boolean(url.includes("/video/") || url.includes("/reel/") || url.includes("/p/") || item.id || item.shortCode);
}

function normalizeVideos(items: ApifyItem[]): SocialVideo[] {
  return items
    .filter(isVideoItem)
    .map((item) => ({
      comments: nestedMetric(item, ["stats", "statsV2", "counts"], ["commentCount", "commentsCount", "comment_count", "comments"]),
      favorites: nestedMetric(item, ["stats", "statsV2", "counts"], ["collectCount", "favoriteCount", "favoritesCount", "saves", "savedCount"]),
      id: videoIdFromItem(item),
      likes: nestedMetric(item, ["stats", "statsV2", "counts"], ["diggCount", "likeCount", "likesCount", "likes", "heartCount"]),
      publishedAt: itemPublishedAt(item),
      shares: nestedMetric(item, ["stats", "statsV2", "counts"], ["shareCount", "sharesCount", "share_count", "shares"]),
      title: itemTitle(item),
      thumbnailUrl: itemThumbnail(item) || undefined,
      url: itemUrl(item),
      views: nestedMetric(item, ["stats", "statsV2", "counts"], ["playCount", "viewCount", "viewsCount", "videoViewCount", "plays", "views"]),
    }))
    .filter((video) => video.views || video.likes || video.comments || video.shares || video.favorites);
}

function summarizeVideos(videos: SocialVideo[], source: string, profile?: ApifyItem): SocialProfileMetrics {
  const posts = videos.length || firstMetric(profile ?? {}, ["videoCount", "postsCount", "posts", "mediaCount"]);
  const views = videos.reduce((sum, video) => sum + (video.views ?? 0), 0);
  const likes = videos.reduce((sum, video) => sum + (video.likes ?? 0), 0) || firstMetric(profile ?? {}, ["heartCount", "likesCount", "likes"]);
  const comments = videos.reduce((sum, video) => sum + (video.comments ?? 0), 0);
  const shares = videos.reduce((sum, video) => sum + (video.shares ?? 0), 0);
  const favorites = videos.reduce((sum, video) => sum + (video.favorites ?? 0), 0);
  const followers = firstMetric(profile ?? {}, ["followerCount", "followersCount", "followers", "fans"]);
  const avgViews = posts && views ? views / posts : 0;
  const engagementRate = views ? (likes / views) * 100 : 0;
  const videoMetricsReady = Boolean(posts || views || likes || comments || shares || favorites);

  return {
    avgViews: avgViews || undefined,
    comments: comments || undefined,
    engagementRate: engagementRate || undefined,
    favorites: favorites || undefined,
    followers: followers || undefined,
    likes: likes || undefined,
    posts: posts || undefined,
    shares: shares || undefined,
    source,
    status: videoMetricsReady ? "Ready for public tracking" : "No public metrics",
    videos,
    videoMetricsReady,
    views: views || undefined,
  };
}

async function runtimeEnv(name: string) {
  if (process.env[name]) return process.env[name] ?? "";
  try {
    const cloudflare = await import("cloudflare:workers");
    const env = (cloudflare as { env?: Record<string, string | undefined> }).env;
    return env?.[name] || "";
  } catch {
    return "";
  }
}

async function callApifyActor(actorId: string, input: Record<string, unknown>, timeoutSeconds = 90): Promise<ApifyItem[]> {
  const token = await runtimeEnv("APIFY_TOKEN");
  if (!token) return [];
  const actorPath = actorId.replace("/", "~");
  const response = await fetch(`${APIFY_BASE_URL}/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSeconds}`, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Apify ${actorId} responded ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload as ApifyItem[] : [];
}

async function fetchTikTokViaApify(handle: string): Promise<SocialProfileMetrics | null> {
  const actor = await runtimeEnv("APIFY_TIKTOK_ACTOR") || "clockworks/tiktok-scraper";
  const bareHandle = cleanBareHandle(handle);
  const items = await callApifyActor(actor, {
    profiles: [bareHandle],
    profileScrapeSections: ["videos"],
    profileSorting: "latest",
    resultsPerPage: 30,
    excludePinnedPosts: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadSubtitles: false,
    shouldDownloadVideos: false,
  });
  if (!items.length) return null;
  return summarizeVideos(normalizeVideos(items), `Apify ${actor}`, items.find((item) => !isVideoItem(item)));
}

async function fetchInstagramViaApify(handle: string): Promise<SocialProfileMetrics | null> {
  const actor = await runtimeEnv("APIFY_INSTAGRAM_ACTOR") || "apify/instagram-scraper";
  const bareHandle = cleanBareHandle(handle);
  const items = await callApifyActor(actor, {
    directUrls: [`https://www.instagram.com/${bareHandle}/`],
    resultsLimit: 30,
    resultsType: "posts",
  });
  if (!items.length) return null;
  return summarizeVideos(normalizeVideos(items), `Apify ${actor}`, items.find((item) => !isVideoItem(item)));
}

export async function fetchSocialProfile(platform: string, handle: string, fallback: () => Promise<SocialProfileMetrics>) {
  const normalizedPlatform = platform.trim().toLowerCase();
  try {
    const apifyResult = normalizedPlatform === "tiktok"
      ? await fetchTikTokViaApify(handle)
      : normalizedPlatform === "instagram"
        ? await fetchInstagramViaApify(handle)
        : null;
    if (apifyResult?.videoMetricsReady) return apifyResult;
  } catch {
    // Public fallback below keeps the UI usable when an actor is temporarily blocked.
  }
  return fallback();
}
