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

async function fetchTikTok(handle: string): Promise<SocialProfilePayload> {
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
    };
  } finally {
    timeout.done();
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "";
  const handle = cleanHandle(url.searchParams.get("handle") ?? "");

  if (!handle) return Response.json({ error: "Missing handle" }, { status: 400 });
  if (platform.toLowerCase() !== "tiktok") {
    return Response.json({ status: "No public metrics", videoMetricsReady: false, source: "Public no-auth lookup unavailable for this platform" });
  }

  try {
    return Response.json(await fetchTikTok(handle));
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Social lookup failed",
      status: "No public metrics",
      videoMetricsReady: false,
      source: "TikTok public profile",
    });
  }
}
