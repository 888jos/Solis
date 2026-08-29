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
  assert.doesNotMatch(html, /Studio operating view/);
  assert.doesNotMatch(html, /Live portfolio, revenue and acquisition health\./);
  assert.doesNotMatch(html, /\+ Add Data/);
  assert.doesNotMatch(html, /Landing/);
  assert.doesNotMatch(html, /Onboarding/);
  assert.doesNotMatch(html, /Apps Portfolio/);
  assert.doesNotMatch(html, /Action Center/);
  assert.doesNotMatch(html, />Overview</);
  assert.doesNotMatch(html, /No revenue found/);
  assert.doesNotMatch(html, /Category/);
  assert.match(html, /Revenue/);
  assert.match(html, /Connect an app/);
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

  assert.match(page, /Use CortiFree/);
  assert.match(page, /6758314805/);
  assert.match(page, /com\.solstys\.cortifree/);
  assert.match(page, /CortiFreeIOS001/);
  assert.match(page, /credentialPreset/);
  assert.match(page, /Server preset/);
  assert.doesNotMatch(page, /AuthKey_BUJ22BWQ5F\.p8/);
  assert.doesNotMatch(page, /c6d73ae8-2d47-4964-92ed-771ec137f6d0/);
  assert.doesNotMatch(page, /93962715/);
  assert.doesNotMatch(page, /\/Users\/jos\/Documents\/Perso\/Admin\/Dev Keys/);
  assert.match(page, /privateKeyPath/);
  assert.match(page, /vendorNumber/);
  assert.match(page, /driftos\.v2\.appStoreMetrics/);
  assert.match(page, /Sync Apple/);
  assert.match(page, /DEFAULT_DATE_RANGE/);
  assert.match(page, /customRangeKey/);
  assert.match(page, /applyCustomDateRange/);
  assert.match(page, /MAX_CUSTOM_RANGE_DAYS = 3650/);
  assert.match(page, /autoSyncAttempts/);
  assert.match(page, /AnalyticsSkeleton/);
  assert.match(page, /aria-busy="true"/);
  assert.match(page, /option value="today">Today/);
  assert.match(page, /option value="yesterday">Yesterday/);
  assert.match(page, /option value="180d">Last 180 Days/);
  assert.match(page, /option value="365d">Last 365 Days/);
  assert.match(page, /option value="all">All Time/);
  assert.doesNotMatch(page, /Preparing Apple reports/);
  assert.doesNotMatch(page, /Synced App Store KPIs/);
  assert.doesNotMatch(page, /function AppStoreMetricTable/);
  assert.doesNotMatch(page, /Synthetic data/);
  assert.doesNotMatch(page, /Run Apple sync to populate this page/);
  assert.match(page, /normalizeCurrency/);
  assert.match(page, /try\s*\{\s*return new Intl\.NumberFormat/);
  assert.match(page, /Add a @handle/);
  assert.match(page, /exportWorkspace/);
  assert.match(page, /LandingPage/);
  assert.match(page, /OnboardingPage/);
  assert.match(page, /appWizardBackdrop/);
  assert.match(page, /Skip for now/);
  assert.match(page, /Step \$\{step \+ 1\} of 3/);
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
  assert.match(page, /IntegrationsPage/);
  assert.match(page, /IntegrationCard/);
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
  assert.match(page, /hasDetailedSocialMetrics/);
  assert.match(page, /videoMetricsReady/);
  assert.match(page, /inFlightLookups/);
  assert.match(page, /socialMetricSkeleton/);
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
  assert.match(page, /aggregateArpuTrend/);
  assert.match(page, /title="ARPU"/);
  assert.match(page, /averageRevenuePerUser/);
  assert.match(page, /formatUnitCurrency/);
  assert.match(page, /currency: "USD"/);
  assert.doesNotMatch(page, /currency:\s*normalizeCurrency\(currency\)/);
  assert.match(page, /Revenue \/ downloads/);
  assert.match(page, /portfolioScope/);
  assert.match(page, /PORTFOLIO_SCOPE_STORAGE/);
  assert.match(page, /appDisplayName/);
  assert.match(page, />Delete app</);
  assert.doesNotMatch(page, />Clear data</i);
  assert.match(page, /resolvedApps\.length > 1 \? "overall" : resolvedApps\[0\]\?\.id \?\? "overall"/);
  assert.match(page, /effectivePortfolioScope/);
  assert.match(page, /apps combined/);
  assert.match(css, /\.appSwitcher/);
  assert.match(css, /\.appWizard/);
  assert.match(page, /xAxisTick/);
  assert.match(page, /yAxisTick/);
  assert.match(page, /formatAxisValue/);
  assert.match(page, /formatDateLabel/);
  assert.match(page, /weekLabel/);
  assert.match(page, /countryFlag/);
  assert.match(page, /react-globe\.gl/);
  assert.match(page, /InteractiveGlobe/);
  assert.match(page, /geoMetricTabs/);
  assert.match(page, /"revenue", "downloads", "cvr"/);
  assert.match(css, /\.worldGlobe/);
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
  assert.match(page, /commandPaletteBackdrop/);
  assert.match(page, /workspaceSearchScore/);
  assert.match(page, /aria-keyshortcuts="Meta\+K Control\+K"/);
  assert.match(page, /Search pages, apps, metrics or actions/);
  assert.match(page, /<button type="button" onClick=\{\(\) => setAiOpen\(true\)\}><Sparkles/);
  assert.match(page, /mobileTabBar/);
  assert.match(page, /countryBreakdown/);
  assert.match(page, /\/globe\/countries\.geojson/);
  assert.match(page, /\/globe\/earth-dark\.jpg/);
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
  assert.match(css, /\.commandPaletteBackdrop/);
  assert.match(css, /backdrop-filter:\s*blur\(8px\) brightness\(0\.52\)/);
  assert.match(css, /\.aiDockPanel/);
  assert.match(css, /\.aiComposer/);
  assert.match(css, /\.aiMessage/);
  assert.match(css, /\.asoCommandBar/);
  assert.match(css, /\.asoTable/);
  assert.match(css, /\.scoreBar/);
  assert.match(css, /\.chartHit/);
  assert.match(css, /\.chartTooltip/);
  assert.doesNotMatch(css, /cursor:\s*crosshair/);
  assert.doesNotMatch(css, /transform:\s*scale\(1\.18\)/);
  assert.match(css, /\.trendPanel \.axisLine/);
  assert.match(css, /\.trendPanel \.chartButton,[\s\S]*background:\s*transparent/);
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

  assert.match(route, /SERVER_CREDENTIAL_PRESETS/);
  assert.match(route, /withServerCredentialPreset/);
  assert.match(route, /readFile\(privateKeyPath/);
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
  assert.match(route, /parserVersion:\s*13/);
  assert.match(route, /selectPrimaryCurrencySalesRows/);
  assert.match(route, /byCurrency\.get\("USD"\)/);
  assert.match(route, /convertSalesRowsToUsd/);
  assert.match(route, /ECB_DAILY_RATES_URL/);
  assert.match(route, /return "other"/);
  assert.match(route, /revenueInDisplayCurrency/);
  assert.match(route, /grossBeforeAppleCommissionAndVat/);
  assert.match(route, /Customer Price/);
  assert.match(route, /VAT Amount/);
  assert.match(route, /developerProceeds/);
  assert.match(route, /resolveDateRange/);
  assert.match(route, /MAX_CUSTOM_RANGE_DAYS = 3650/);
  assert.match(route, /today:\s*\{ count: 1/);
  assert.match(route, /yesterday:\s*\{ count: 1/);
  assert.match(route, /"180d":\s*\{ count: 180/);
  assert.match(route, /"365d":\s*\{ count: 365/);
  assert.match(route, /all:\s*\{ count: MAX_CUSTOM_RANGE_DAYS/);
  assert.match(route, /financeMonthsForPeriod/);
  assert.match(route, /fields\[apps\]/);
  assert.match(route, /Bundle Identifier/);
  assert.match(route, /Product SKU/);
  assert.match(route, /Partner Share/);
  assert.match(route, /Developer Proceeds/);
  assert.match(route, /timeSeries/);
  assert.match(route, /countryBreakdown/);
  assert.match(route, /row\.revenue > 0 && row\.units > 0/);
  assert.match(route, /Vendor Number/);
  assert.match(route, /normalizeCurrency/);
  assert.match(route, /mapWithConcurrency/);
  assert.match(route, /salesReportCache/);
  assert.match(route, /const \[aso, release, salesReport, financeReport\] = await Promise\.all/);
  assert.doesNotMatch(route, /console\.log\(privateKey|return json\(\{\s*privateKey/);
});

test("backend foundation exposes persistent SaaS resources", async () => {
  const [schema, db, appsRoute, appRoute, socialRoute, revenueRoute, expensesRoute, syncRoute, integrationsRoute, integrationHelpers, integrationConnectRoute, healthRoute, hosting] =
    await Promise.all([
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/apps/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/apps/[id]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/social-accounts/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/metrics/revenue/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/expenses/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/sync-jobs/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/integrations/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../server/backend/integrations.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/integrations/connect/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/backend/health/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    ]);

  assert.match(hosting, /"d1":\s*"DB"/);
  assert.doesNotMatch(db, /import \{ env \} from "cloudflare:workers"/);
  assert.match(db, /await import\("cloudflare:workers"\)/);
  assert.match(schema, /syncJobs/);
  assert.match(schema, /integrationConnections/);
  assert.match(schema, /manualExpenses/);
  assert.match(schema, /creators/);
  assert.match(schema, /creatorVideos/);
  assert.match(schema, /campaigns/);
  assert.match(schema, /creatives/);
  assert.match(schema, /asoKeywords/);
  assert.match(schema, /asoKeywordSnapshots/);
  assert.match(schema, /dailyBriefs/);
  assert.match(schema, /uniqueIndex\("social_accounts_unique_handle"/);
  assert.match(schema, /grossRevenue/);
  assert.match(schema, /paidUnits/);
  assert.match(schema, /engagementRate/);
  assert.match(appsRoute, /export async function POST/);
  assert.match(appsRoute, /appStoreCredentials/);
  assert.match(appRoute, /export async function DELETE/);
  assert.match(appRoute, /deletedAt/);
  assert.match(socialRoute, /normalizeHandle/);
  assert.match(socialRoute, /duplicate: true/);
  assert.match(revenueRoute, /grossRevenue/);
  assert.match(revenueRoute, /profit: proceeds - expensesTotal/);
  assert.match(expensesRoute, /creators", "ads", "software", "other"/);
  assert.match(syncRoute, /recordsRead/);
  assert.match(syncRoute, /recordsWritten/);
  assert.match(integrationsRoute, /allowedProviders/);
  assert.match(integrationHelpers, /app_store_connect/);
  assert.match(integrationHelpers, /revenuecat/);
  assert.match(integrationHelpers, /superwall/);
  assert.match(integrationHelpers, /tiktok_public/);
  assert.match(integrationHelpers, /delete config\.apiKey/);
  assert.match(integrationsRoute, /sanitizeIntegration/);
  assert.match(integrationConnectRoute, /api\.revenuecat\.com\/v2\/projects/);
  assert.match(integrationConnectRoute, /api\.superwall\.com\/v2\/projects/);
  assert.match(integrationConnectRoute, /apiKeyPreview/);
  assert.match(integrationConnectRoute, /secretRef/);
  assert.match(healthRoute, /database:\s*"ready"/);
});
