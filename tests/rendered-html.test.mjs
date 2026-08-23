import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the DriftOS workspace without fake metrics", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>DriftOS<\/title>/i);
  assert.match(html, /Studio operating view/);
  assert.doesNotMatch(html, /Live portfolio, revenue and acquisition health\./);
  assert.doesNotMatch(html, /\+ Add Data/);
  assert.doesNotMatch(html, /Landing/);
  assert.doesNotMatch(html, /Onboarding/);
  assert.doesNotMatch(html, /Apps Portfolio/);
  assert.doesNotMatch(html, /Action Center/);
  assert.doesNotMatch(html, /No revenue found/);
  assert.doesNotMatch(html, /Category/);
  assert.match(html, /Revenue/);
  assert.match(html, /Downloads/);
  assert.match(html, /Revenue Analytics/);
  assert.match(html, /Monetization/);
  assert.match(html, /Paywall/);
  assert.match(html, /Geo Revenue/);
  assert.match(html, /ASO/);
  assert.match(html, /Campaigns/);
  assert.match(html, /Social Tracking/);
  assert.match(html, /Product Analytics/);
  assert.match(html, /Releases/);
  assert.match(html, /Quality/);
  assert.match(html, /Roadmap/);
  assert.match(html, /Tasks/);
  assert.match(html, /Integrations/);
  assert.match(html, /Open DriftOS AI assistant/);
  assert.doesNotMatch(html, /€70,200|1\.9M|12 posts|LifeQuest|Berry|Rakib/i);
});

test("source keeps local setup configurable and icon-based", async () => {
  const [page, css, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /accept="\.p8"/);
  assert.match(page, /AuthKey_BUJ22BWQ5F\.p8/);
  assert.match(page, /privateKeyPath/);
  assert.match(page, /vendorNumber/);
  assert.match(page, /driftos\.v2\.appStoreMetrics/);
  assert.match(page, /Sync Apple/);
  assert.match(page, /DEFAULT_DATE_RANGE/);
  assert.match(page, /normalizeCurrency/);
  assert.match(page, /try\s*\{\s*return new Intl\.NumberFormat/);
  assert.match(page, /Add a @handle/);
  assert.match(page, /exportWorkspace/);
  assert.match(page, /LandingPage/);
  assert.match(page, /OnboardingPage/);
  assert.match(page, /Start setup/);
  assert.match(page, /Bring the studio online/);
  assert.doesNotMatch(page, /buildDemoWorkspace/);
  assert.doesNotMatch(page, /Load demo/);
  assert.doesNotMatch(page, /demo-cocorise/);
  assert.doesNotMatch(page, /Demo data/);
  assert.match(page, /MonetizationPage/);
  assert.match(page, /PaywallPage/);
  assert.match(page, /GeoRevenuePage/);
  assert.match(page, /AsoPage/);
  assert.match(page, /CampaignsPage/);
  assert.match(page, /ReleasesPage/);
  assert.match(page, /QualityPage/);
  assert.match(page, /RoadmapPage/);
  assert.match(page, /TasksPage/);
  assert.match(page, /operationsAnalytics/);
  assert.match(page, /roadmapItems/);
  assert.match(page, /asoAnalytics/);
  assert.match(page, /marketingAnalytics/);
  assert.match(page, /asoWorkspace/);
  assert.match(page, /api\/apple-search/);
  assert.match(page, /AsoSearchResult/);
  assert.match(page, /AsoSparkline/);
  assert.match(page, /release\?:/);
  assert.match(page, /Release Train/);
  assert.match(page, /Quality Gates/);
  assert.match(page, /Prioritized bets/);
  assert.match(page, /Operational tasks/);
  assert.doesNotMatch(page, /page:\s*"development"/);
  assert.doesNotMatch(page, /page:\s*"finance"/);
  assert.doesNotMatch(page, /page:\s*"pricing"/);
  assert.match(page, /marketingViews/);
  assert.match(page, /expenses/);
  assert.match(page, /aria-current/);
  assert.match(page, /MiniChart/);
  assert.match(page, /RevenueMap/);
  assert.match(page, /function LiquidGlass/);
  assert.match(page, /liquidClass/);
  assert.match(page, /function TrendBadge/);
  assert.match(page, /trendSignal/);
  assert.match(page, /function AiDock/);
  assert.match(page, /function SidebarAssistant/);
  assert.match(page, /function AiComposer/);
  assert.match(page, /buildWorkspaceAnswer/);
  assert.match(page, /SpeechRecognition/);
  assert.match(page, /webkitSpeechRecognition/);
  assert.match(page, /aggregateTrendPoints/);
  assert.match(page, /formatDateLabel/);
  assert.match(page, /weekLabel/);
  assert.match(page, /countryFlag/);
  assert.match(page, /keywordRows/);
  assert.match(page, /Add Keywords/);
  assert.match(page, /Suggestions/);
  assert.match(page, /Popularity/);
  assert.match(page, /Difficulty/);
  assert.match(page, /rankingApps/);
  assert.match(page, /Ask about revenue, ASO, marketing/);
  assert.match(page, /Voice input is not available/);
  assert.match(page, /sidebarCollapsed/);
  assert.match(page, /sidebarToggle/);
  assert.match(page, /mobileTabBar/);
  assert.match(page, /countryBreakdown/);
  assert.match(page, /world-atlas@2\/countries-110m\.json/);
  assert.match(page, /decodeWorldTopology/);
  assert.match(page, /clickableCard/);
  assert.match(page, /timeSeries/);
  assert.doesNotMatch(page, /function Spark/);
  assert.doesNotMatch(page, /icon="A"|icon="K"|icon="@"/);
  assert.match(css, /grid-template-columns:\s*320px minmax\(0,\s*1fr\)/);
  assert.match(css, /\.appShell\.sidebarCollapsed/);
  assert.match(css, /\.liquidGlass/);
  assert.match(css, /\.metricTrend/);
  assert.match(css, /\.mobileTabBar/);
  assert.match(css, /\.aiDockHandle/);
  assert.match(css, /\.aiOverlay/);
  assert.match(css, /\.aiBackdrop/);
  assert.match(css, /\.sidebarAssistant/);
  assert.match(css, /\.aiDockPanel/);
  assert.match(css, /\.aiComposer/);
  assert.match(css, /\.aiMessage/);
  assert.match(css, /\.asoCommandBar/);
  assert.match(css, /\.asoTable/);
  assert.match(css, /\.scoreBar/);
  assert.match(css, /\.chartHit/);
  assert.match(css, /\.miniChartHit/);
  assert.match(css, /100dvh/);
  assert.match(css, /background:\s*#000/);
  assert.match(css, /\.navGroupHeader/);
  assert.match(css, /\.miniChart/);
  assert.match(schema, /appStoreCredentials/);
  assert.match(schema, /socialAccounts/);
  assert.match(schema, /dailyAppMetrics/);
  assert.match(schema, /dailySocialMetrics/);
});

test("every sidebar page has copy and a render route", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const pages = [
    "landing",
    "onboarding",
    "apps",
    "actions",
    "revenue",
    "monetization",
    "subscriptions",
    "paywall",
    "geoRevenue",
    "acquisition",
    "aso",
    "social",
    "creatives",
    "campaigns",
    "creators",
    "product",
    "releases",
    "quality",
    "roadmap",
    "tasks",
    "integrations",
    "settings",
  ];

  for (const route of pages) {
    assert.match(page, new RegExp(`${route}: \\{ eyebrow:`), `${route} is missing page copy`);
  }

  for (const route of pages.filter((route) => route !== "settings")) {
    assert.match(page, new RegExp(`activePage === "${route}"`), `${route} is missing render route`);
  }
});

test("app store sync endpoint keeps Apple credentials server-side", async () => {
  const route = await readFile(new URL("../app/api/app-store-connect/sync/route.ts", import.meta.url), "utf8");

  assert.match(route, /readFile\(app\.privateKeyPath/);
  assert.match(route, /createSign\("SHA256"\)/);
  assert.match(route, /aud:\s*"appstoreconnect-v1"/);
  assert.match(route, /salesReports/);
  assert.match(route, /financeReports/);
  assert.match(route, /fetchAsoSnapshot/);
  assert.match(route, /fetchReleaseSnapshot/);
  assert.match(route, /emptySalesReport/);
  assert.match(route, /syncMessage/);
  assert.match(route, /readyForSale/);
  assert.match(route, /appInfoLocalizations/);
  assert.match(route, /appStoreVersionLocalizations/);
  assert.match(route, /keywords/);
  assert.match(route, /parserVersion:\s*6/);
  assert.match(route, /fields\[apps\]/);
  assert.match(route, /Bundle Identifier/);
  assert.match(route, /Product SKU/);
  assert.match(route, /Partner Share/);
  assert.match(route, /Developer Proceeds/);
  assert.match(route, /timeSeries/);
  assert.match(route, /countryBreakdown/);
  assert.match(route, /Vendor Number/);
  assert.match(route, /normalizeCurrency/);
  assert.doesNotMatch(route, /console\.log\(privateKey|return json\(\{\s*privateKey/);
});
