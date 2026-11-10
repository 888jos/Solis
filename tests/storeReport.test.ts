// App Store Analytics Reports parsing (column names and values from Apple's documentation).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateStoreReport, parseTsv } from "../convex/lib/storeReport.ts";

const app = { slug: "cocorise", appStoreId: "6760921524" };

test("Discovery report: impressions and product page views by source", () => {
  const tsv = [
    "Date\tApp Name\tApp Apple Identifier\tEvent\tPage Type\tSource Type\tEngagement Type\tDevice\tPlatform Version\tTerritory\tCounts\tUnique Counts",
    "2026-11-08\tCocorise\t6760921524\tImpression\tNo page\tApp Store search\t\tiPhone\tiOS 26.1\tFR\t120\t90",
    "2026-11-08\tCocorise\t6760921524\tImpression\tNo page\tApp Store search\t\tiPad\tiOS 26.1\tUS\t30\t20",
    "2026-11-08\tCocorise\t6760921524\tPage view\tProduct page\tApp Store search\t\tiPhone\tiOS 26.1\tFR\t25\t22",
    "2026-11-08\tCocorise\t6760921524\tPage view\tApp privacy\tApp Store search\t\tiPhone\tiOS 26.1\tFR\t3\t3",
    "2026-11-08\tCocorise\t6760921524\tTap\tProduct page\tApp Store search\tGet\tiPhone\tiOS 26.1\tFR\t9\t9",
    "2026-11-08\tCocorise\t6760921524\tPage view\tProduct page\tWeb referrer\t\tiPhone\tiOS 26.1\tFR\t7\t7",
    "2026-11-08\tOther\t111\tImpression\tNo page\tApp Store search\t\tiPhone\tiOS 26.1\tFR\t999\t999",
  ].join("\n");
  const agg = aggregateStoreReport("discovery", parseTsv(tsv), app);
  const search = agg.find((a) => a.sourceType === "App Store search")!;
  assert.equal(search.impressions, 150);
  assert.equal(search.uniqueImpressions, 110);
  assert.equal(search.pageViews, 25);
  assert.equal(agg.find((a) => a.sourceType === "Web referrer")!.pageViews, 7);
  assert.equal(agg.length, 2);
});

test("Downloads report: first-time downloads and redownloads", () => {
  const tsv = [
    "Date\tApp Name\tApp Apple Identifier\tDownload Type\tApp Version\tDevice\tPlatform Version\tSource Type\tPage Type\tPre-Order\tTerritory\tCounts",
    "2026-11-08\tCocorise\t6760921524\tFirst-time Download\t1.1.3\tiPhone\tiOS 26.1\tApp Store search\tProduct page\tNo\tFR\t4",
    "2026-11-08\tCocorise\t6760921524\tRedownload\t1.1.3\tiPhone\tiOS 26.1\tApp Store search\tProduct page\tNo\tFR\t2",
    "2026-11-08\tCocorise\t6760921524\tManual update\t1.1.3\tiPhone\tiOS 26.1\tApp Store search\tProduct page\tNo\tFR\t50",
  ].join("\n");
  const [row] = aggregateStoreReport("downloads", parseTsv(tsv), app);
  assert.equal(row.firstDownloads, 4);
  assert.equal(row.redownloads, 2);
});
