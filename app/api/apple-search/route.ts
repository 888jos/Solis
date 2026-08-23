type AppleSearchItem = {
  artistName?: string;
  artworkUrl100?: string;
  averageUserRating?: number;
  bundleId?: string;
  trackId?: number;
  trackName?: string;
  userRatingCount?: number;
};

type AppleSearchResponse = {
  resultCount?: number;
  results?: AppleSearchItem[];
};

const APPLE_SEARCH_TIMEOUT_MS = 6_000;
const APPLE_SEARCH_URL = "https://itunes.apple.com/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const term = (url.searchParams.get("term") || "").trim();
    const country = normalizeCountry(url.searchParams.get("country") || "US");
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 24)));

    if (!term) return json({ ok: false, message: "Missing search term.", results: [] }, 400);

    const searchUrl = new URL(APPLE_SEARCH_URL);
    searchUrl.searchParams.set("term", term);
    searchUrl.searchParams.set("country", country);
    searchUrl.searchParams.set("entity", "software");
    searchUrl.searchParams.set("limit", String(limit));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APPLE_SEARCH_TIMEOUT_MS);
    const response = await fetch(searchUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return json({ ok: false, message: `Apple Search returned ${response.status}.`, results: [] }, 502);

    const payload = await response.json() as AppleSearchResponse;
    const results = (payload.results ?? []).map((item, index) => ({
      appId: item.trackId ? String(item.trackId) : "",
      artistName: item.artistName || "",
      artworkUrl: item.artworkUrl100 || "",
      bundleId: item.bundleId || "",
      name: item.trackName || "Untitled app",
      rank: index + 1,
      rating: Number.isFinite(item.averageUserRating) ? Number(item.averageUserRating) : 0,
      ratingCount: Number.isFinite(item.userRatingCount) ? Number(item.userRatingCount) : 0,
    })).filter((item) => item.appId);

    return json({ ok: true, country, source: "Apple iTunes Search API", term, results });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Apple Search timed out." : "Apple Search unavailable.";
    return json({ ok: false, message, results: [] }, 504);
  }
}

function normalizeCountry(country: string) {
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "US";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}
