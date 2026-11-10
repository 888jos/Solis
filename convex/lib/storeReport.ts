import type { StudioApp } from "./apps";

// Pure parsing of App Store Analytics Reports files (shared by convex/sources/ascAnalytics.ts and the tests).
// Column names and values from Apple's documentation of the standard reports.

export const REPORTS = {
  discovery: "App Store Discovery and Engagement Standard",
  downloads: "App Downloads Standard",
} as const;

export type Row = Record<string, string>;
export type Agg = { appSlug: string; day: string; sourceType: string; impressions: number; uniqueImpressions: number; pageViews: number; uniquePageViews: number; firstDownloads: number; redownloads: number };

export function parseTsv(text: string): Row[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  if (lines.length < 2) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((l) => {
    const cells = l.split(delim);
    const row: Row = {};
    head.forEach((h, i) => (row[h] = (cells[i] ?? "").trim().replace(/^"|"$/g, "")));
    return row;
  });
}

export function aggregateStoreReport(kind: keyof typeof REPORTS, rows: Row[], app: Pick<StudioApp, "slug" | "appStoreId">): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const appId = r["App Apple Identifier"];
    if (appId && appId !== app.appStoreId) continue;
    const day = (r["Date"] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const sourceType = r["Source Type"] || "Unavailable";
    const key = `${day}|${sourceType}`;
    const a = map.get(key) ?? { appSlug: app.slug, day, sourceType, impressions: 0, uniqueImpressions: 0, pageViews: 0, uniquePageViews: 0, firstDownloads: 0, redownloads: 0 };
    const counts = Number(r["Counts"] ?? 0) || 0;
    const unique = Number(r["Unique Counts"] ?? 0) || 0;
    if (kind === "discovery") {
      if (r["Event"] === "Impression") {
        a.impressions += counts;
        a.uniqueImpressions += unique;
      } else if (r["Event"] === "Page view" && r["Page Type"] === "Product page") {
        a.pageViews += counts;
        a.uniquePageViews += unique;
      }
    } else {
      if (r["Download Type"] === "First-time Download") a.firstDownloads += counts;
      else if (r["Download Type"] === "Redownload") a.redownloads += counts;
    }
    map.set(key, a);
  }
  return [...map.values()];
}
