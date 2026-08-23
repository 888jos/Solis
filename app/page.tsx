"use client";

import { ChangeEvent, ElementType, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  BadgeAlert,
  CalendarRange,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clapperboard,
  Database,
  Download,
  GitBranch,
  Globe2,
  LucideIcon,
  Megaphone,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Percent,
  Plug,
  Repeat,
  Search,
  Send,
  SettingsIcon,
  Sparkles,
  Target,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type PageKey =
  | "landing"
  | "onboarding"
  | "overview"
  | "apps"
  | "actions"
  | "revenue"
  | "monetization"
  | "subscriptions"
  | "paywall"
  | "geoRevenue"
  | "acquisition"
  | "aso"
  | "creatives"
  | "campaigns"
  | "social"
  | "creators"
  | "product"
  | "releases"
  | "quality"
  | "roadmap"
  | "tasks"
  | "integrations"
  | "settings";

type StudioApp = {
  id: string;
  isDemo?: boolean;
  name: string;
  platform: string;
  bundleId: string;
  appStoreId: string;
  keyId: string;
  issuerId: string;
  vendorNumber: string;
  privateKeyName: string;
  privateKeyPath: string;
  status: "Ready to sync" | "Missing credentials";
  createdAt: string;
};

type AppStoreMetric = {
  appId: string;
  parserVersion: number;
  appName: string;
  bundleId: string;
  dateRange?: string;
  sku: string;
  state: string;
  syncedAt: string;
  reportStartDate: string | null;
  reportEndDate: string | null;
  financeReportStartDate?: string | null;
  financeReportEndDate?: string | null;
  currency: string;
  revenue: number;
  revenueRows: number;
  revenueSource?: "Financial" | "Sales" | "None";
  financeRows?: number;
  downloads: number;
  units: number;
  subscriptions: number;
  inAppPurchases: number;
  countries: number;
  countryBreakdown?: {
    country: string;
    downloads: number;
    revenue: number;
    units: number;
  }[];
  timeSeries: {
    date: string;
    downloads: number;
    inAppPurchases: number;
    revenue: number;
    subscriptions: number;
    units: number;
  }[];
  rows: number;
  marketingViews?: number;
  marketingPosts?: number;
  marketingEngagement?: number;
  expenses?: number;
  profit?: number;
  aso?: {
    fetchedAt: string;
    status: string;
    primaryLocale: string;
    latestVersion: string;
    localizations: number;
    locales: string[];
    keywordCount: number;
    keywords: string[];
    titleCoverage: number;
    subtitleCoverage: number;
    descriptionCoverage: number;
    metadataScore: number;
  };
  release?: {
    fetchedAt: string;
    latestVersion: string;
    platform: string;
    state: string;
    versionCount: number;
    readyForSale: boolean;
    editable: boolean;
  };
  status: "synced" | "no_report";
  message: string;
};

type SocialAccount = {
  id: string;
  isDemo?: boolean;
  handle: string;
  platform: "TikTok" | "Instagram" | "YouTube";
  appId: string;
  followers?: number;
  avgViews?: number;
  posts?: number;
  engagementRate?: number;
  status: "Ready for public tracking";
  createdAt: string;
};

type ActionItem = {
  title: string;
  text: string;
  page: PageKey;
  priority: "Critical" | "High" | "Medium";
};

type AiMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type VoiceRecognitionEvent = {
  results: { transcript?: string }[][];
};

type VoiceRecognition = {
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
};

type WorldGeometry = {
  id?: string;
  properties?: { name?: string };
  type: "Polygon" | "MultiPolygon";
  arcs: number[][] | number[][][];
};

type WorldTopology = {
  arcs: number[][][];
  objects: {
    countries: {
      geometries: WorldGeometry[];
    };
  };
  transform?: {
    scale: [number, number];
    translate: [number, number];
  };
};

type MapCountry = {
  id: string;
  name: string;
  path: string;
};

type TrendPoint = {
  label: string;
  value: number;
};

type AsoSearchResult = {
  appId: string;
  artistName: string;
  artworkUrl: string;
  bundleId: string;
  name: string;
  rank: number;
  rating: number;
  ratingCount: number;
};

type AsoKeywordRow = {
  difficulty: number;
  keyword: string;
  popularity: number;
  source: "apple" | "manual";
  store: string;
  trend: number;
};

const APP_STORAGE = "driftos.v2.apps";
const SOCIAL_STORAGE = "driftos.v2.socials";
const METRIC_STORAGE = "driftos.v2.appStoreMetrics";
const ASO_KEYWORD_STORAGE = "driftos.v2.asoKeywords";
const DEFAULT_DATE_RANGE = "30d";
const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const detectedPrivateKey = {
  keyId: "BUJ22BWQ5F",
  name: "AuthKey_BUJ22BWQ5F.p8",
  path: "/Users/jos/Documents/Perso/Admin/Dev Keys/AuthKey_BUJ22BWQ5F.p8",
};

type LiquidGlassProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>;

function liquidClass(className = "") {
  return ["liquidGlass", className].filter(Boolean).join(" ");
}

function LiquidGlass({ as: Component = "section", className = "", children, ...props }: LiquidGlassProps) {
  return <Component className={liquidClass(className)} {...props}>{children}</Component>;
}

const navSections: { label: string; icon: LucideIcon; items: { page: PageKey; name: string; icon: LucideIcon }[] }[] = [
  { label: "Revenue Analytics", icon: CircleDollarSign, items: [{ page: "revenue", name: "Revenue", icon: CircleDollarSign }, { page: "monetization", name: "Monetization", icon: Percent }, { page: "subscriptions", name: "Subscriptions", icon: Repeat }, { page: "paywall", name: "Paywall", icon: WalletCards }, { page: "geoRevenue", name: "Geo Revenue", icon: Globe2 }] },
  { label: "Marketing", icon: Megaphone, items: [{ page: "acquisition", name: "Acquisition", icon: Megaphone }, { page: "aso", name: "ASO", icon: Search }, { page: "social", name: "Social Tracking", icon: AtSign }, { page: "creatives", name: "Creatives", icon: Clapperboard }, { page: "campaigns", name: "Campaigns", icon: Target }, { page: "creators", name: "Creators CRM", icon: Users }] },
  { label: "Operations", icon: GitBranch, items: [{ page: "product", name: "Product Analytics", icon: ChartNoAxesCombined }, { page: "releases", name: "Releases", icon: GitBranch }, { page: "quality", name: "Quality", icon: BadgeAlert }, { page: "roadmap", name: "Roadmap", icon: ClipboardList }, { page: "tasks", name: "Tasks", icon: Target }] },
  { label: "System", icon: Plug, items: [{ page: "integrations", name: "Integrations", icon: Plug }, { page: "settings", name: "Settings", icon: SettingsIcon }] },
];

const pageCopy: Record<PageKey, { eyebrow: string; title: string; subline: string }> = {
  landing: { eyebrow: "DriftOS", title: "Mobile studio command center", subline: "Revenue, ASO, releases and marketing intelligence in one local cockpit." },
  onboarding: { eyebrow: "Setup", title: "Connect your studio", subline: "Add apps, Apple credentials and public handles in a guided flow." },
  overview: { eyebrow: "Command Center", title: "Studio operating view", subline: "Live portfolio, revenue and acquisition health." },
  apps: { eyebrow: "Portfolio", title: "Apps portfolio", subline: "Manage connected apps and sync status." },
  actions: { eyebrow: "Action Center", title: "Setup actions", subline: "Prioritized fixes for incomplete sources." },
  revenue: { eyebrow: "Revenue Analytics", title: "Revenue", subline: "Net proceeds, monetized rows and subscription revenue." },
  monetization: { eyebrow: "Revenue Analytics", title: "Monetization", subline: "Paid conversion, ARPD and monetized product quality." },
  subscriptions: { eyebrow: "Revenue Analytics", title: "Subscriptions", subline: "Subscription activity across connected apps." },
  paywall: { eyebrow: "Revenue Analytics", title: "Paywall", subline: "Offer readiness, paid starts and conversion bottlenecks." },
  geoRevenue: { eyebrow: "Revenue Analytics", title: "Geo Revenue", subline: "Country-level revenue concentration and demand gaps." },
  acquisition: { eyebrow: "Marketing", title: "Acquisition", subline: "Downloads and install-side demand signals." },
  aso: { eyebrow: "Marketing", title: "ASO", subline: "Store metadata, keyword coverage and localization quality." },
  creatives: { eyebrow: "Marketing", title: "Creatives", subline: "Creative performance from connected public sources." },
  campaigns: { eyebrow: "Marketing", title: "Campaigns", subline: "Spend, return and channel execution." },
  social: { eyebrow: "Marketing", title: "Social tracking", subline: "Public handles mapped to your app portfolio." },
  creators: { eyebrow: "Marketing", title: "Creators CRM", subline: "Creator records built from tracked handles." },
  product: { eyebrow: "Analytics", title: "Product analytics", subline: "Product funnels and retention sources." },
  releases: { eyebrow: "Operations", title: "Releases", subline: "App Store versions, release state and rollout readiness." },
  quality: { eyebrow: "Operations", title: "Quality", subline: "Crash, rating and support readiness for shipping apps." },
  roadmap: { eyebrow: "Operations", title: "Roadmap", subline: "Prioritized bets tied to revenue, acquisition and quality." },
  tasks: { eyebrow: "Operations", title: "Tasks", subline: "Operational actions generated from connected sources." },
  integrations: { eyebrow: "System", title: "Integrations", subline: "Connect apps, credentials and public sources." },
  settings: { eyebrow: "System", title: "Settings", subline: "Workspace configuration and local data." },
};

const demoAppId = "demo-cocorise";

const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
const formatCurrency = (value: number, currency = "EUR") => {
  try {
    return new Intl.NumberFormat("en-US", { currency: normalizeCurrency(currency), maximumFractionDigits: 0, style: "currency" }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat("en-US", { currency: "EUR", maximumFractionDigits: 0, style: "currency" }).format(Number.isFinite(value) ? value : 0);
  }
};

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeApps(apps: StudioApp[]) {
  return apps.map((app) => ({
    ...app,
    keyId: app.keyId || detectedPrivateKey.keyId,
    vendorNumber: (app as StudioApp & { vendorNumber?: string }).vendorNumber ?? "",
    privateKeyName: app.privateKeyName || detectedPrivateKey.name,
    privateKeyPath: app.privateKeyPath || detectedPrivateKey.path,
    status: (app.keyId || detectedPrivateKey.keyId) && app.issuerId && app.appStoreId && ((app as StudioApp & { vendorNumber?: string }).vendorNumber ?? "") && (app.privateKeyName || app.privateKeyPath || detectedPrivateKey.path) ? "Ready to sync" as const : "Missing credentials" as const,
  }));
}

function normalizeCurrency(currency: string | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "EUR";
}

function normalizeMetric(metric: AppStoreMetric): AppStoreMetric {
  return {
    ...metric,
    dateRange: metric.dateRange || "30d",
    parserVersion: Number.isFinite(metric.parserVersion) ? metric.parserVersion : 0,
    currency: normalizeCurrency(metric.currency),
    downloads: Number.isFinite(metric.downloads) ? metric.downloads : 0,
    financeRows: Number.isFinite(metric.financeRows) ? metric.financeRows : 0,
    inAppPurchases: Number.isFinite(metric.inAppPurchases) ? metric.inAppPurchases : 0,
    revenue: Number.isFinite(metric.revenue) ? metric.revenue : 0,
    revenueRows: Number.isFinite(metric.revenueRows) ? metric.revenueRows : 0,
    revenueSource: ["Financial", "Sales", "None"].includes(metric.revenueSource ?? "") ? metric.revenueSource : metric.revenueRows ? "Sales" : "None",
    rows: Number.isFinite(metric.rows) ? metric.rows : 0,
    marketingEngagement: Number.isFinite(metric.marketingEngagement) ? metric.marketingEngagement : 0,
    marketingPosts: Number.isFinite(metric.marketingPosts) ? metric.marketingPosts : 0,
    marketingViews: Number.isFinite(metric.marketingViews) ? metric.marketingViews : 0,
    expenses: Number.isFinite(metric.expenses) ? metric.expenses : 0,
    profit: Number.isFinite(metric.profit) ? metric.profit : (Number.isFinite(metric.revenue) && Number.isFinite(metric.expenses) ? metric.revenue - (metric.expenses ?? 0) : 0),
    subscriptions: Number.isFinite(metric.subscriptions) ? metric.subscriptions : 0,
    countryBreakdown: Array.isArray(metric.countryBreakdown) ? metric.countryBreakdown.map((country) => ({
      country: String(country.country ?? "").trim().toUpperCase(),
      downloads: Number.isFinite(country.downloads) ? country.downloads : 0,
      revenue: Number.isFinite(country.revenue) ? country.revenue : 0,
      units: Number.isFinite(country.units) ? country.units : 0,
    })).filter((country) => country.country) : [],
    timeSeries: Array.isArray(metric.timeSeries) ? metric.timeSeries.map((point) => ({
      date: point.date,
      downloads: Number.isFinite(point.downloads) ? point.downloads : 0,
      inAppPurchases: Number.isFinite(point.inAppPurchases) ? point.inAppPurchases : 0,
      revenue: Number.isFinite(point.revenue) ? point.revenue : 0,
      subscriptions: Number.isFinite(point.subscriptions) ? point.subscriptions : 0,
      units: Number.isFinite(point.units) ? point.units : 0,
    })) : [],
    units: Number.isFinite(metric.units) ? metric.units : 0,
    aso: metric.aso ? {
      fetchedAt: metric.aso.fetchedAt || metric.syncedAt,
      status: metric.aso.status || "Synced",
      primaryLocale: metric.aso.primaryLocale || "Unknown",
      latestVersion: metric.aso.latestVersion || "Unknown",
      localizations: Number.isFinite(metric.aso.localizations) ? metric.aso.localizations : 0,
      locales: Array.isArray(metric.aso.locales) ? metric.aso.locales.filter(Boolean) : [],
      keywordCount: Number.isFinite(metric.aso.keywordCount) ? metric.aso.keywordCount : 0,
      keywords: Array.isArray(metric.aso.keywords) ? metric.aso.keywords.filter(Boolean).slice(0, 24) : [],
      titleCoverage: Number.isFinite(metric.aso.titleCoverage) ? metric.aso.titleCoverage : 0,
      subtitleCoverage: Number.isFinite(metric.aso.subtitleCoverage) ? metric.aso.subtitleCoverage : 0,
      descriptionCoverage: Number.isFinite(metric.aso.descriptionCoverage) ? metric.aso.descriptionCoverage : 0,
      metadataScore: Number.isFinite(metric.aso.metadataScore) ? metric.aso.metadataScore : 0,
    } : undefined,
    release: metric.release ? {
      fetchedAt: metric.release.fetchedAt || metric.syncedAt,
      latestVersion: metric.release.latestVersion || "Unknown",
      platform: metric.release.platform || "Unknown",
      state: metric.release.state || metric.state || "Unknown",
      versionCount: Number.isFinite(metric.release.versionCount) ? metric.release.versionCount : 0,
      readyForSale: Boolean(metric.release.readyForSale),
      editable: Boolean(metric.release.editable),
    } : undefined,
  };
}

function buildDemoWorkspace(dateRange: string) {
  const app: StudioApp = {
    id: demoAppId,
    isDemo: true,
    name: "Cocorise: Anti-Snooze Alarm",
    platform: "iOS",
    bundleId: "com.wrap.cocorise",
    appStoreId: "6758314805",
    keyId: detectedPrivateKey.keyId,
    issuerId: "demo-issuer-id",
    vendorNumber: "demo-vendor",
    privateKeyName: detectedPrivateKey.name,
    privateKeyPath: detectedPrivateKey.path,
    status: "Ready to sync",
    createdAt: new Date().toISOString(),
  };
  const countryBreakdown = [
    { country: "US", downloads: 8420, revenue: 18420, units: 9510 },
    { country: "FR", downloads: 5360, revenue: 12780, units: 6030 },
    { country: "GB", downloads: 3210, revenue: 8940, units: 3650 },
    { country: "DE", downloads: 2890, revenue: 7520, units: 3320 },
    { country: "CA", downloads: 2140, revenue: 4810, units: 2400 },
    { country: "AU", downloads: 1680, revenue: 3890, units: 1900 },
    { country: "JP", downloads: 1420, revenue: 3320, units: 1600 },
    { country: "BR", downloads: 2140, revenue: 1680, units: 2300 },
    { country: "IN", downloads: 3250, revenue: 1540, units: 3500 },
  ];
  const timeSeries = buildDemoTimeSeries(dateRange);
  const metric: AppStoreMetric = {
    appId: app.id,
    parserVersion: 5,
    appName: app.name,
    bundleId: app.bundleId,
    dateRange,
    sku: "COCORISE-IOS",
    state: "READY_FOR_SALE",
    syncedAt: new Date().toISOString(),
    reportStartDate: timeSeries[0]?.date ?? null,
    reportEndDate: timeSeries.at(-1)?.date ?? null,
    financeReportStartDate: "2026-03-01",
    financeReportEndDate: "2026-08-01",
    currency: "EUR",
    revenue: countryBreakdown.reduce((sum, country) => sum + country.revenue, 0),
    revenueRows: 436,
    revenueSource: "Financial",
    financeRows: 436,
    downloads: countryBreakdown.reduce((sum, country) => sum + country.downloads, 0),
    units: countryBreakdown.reduce((sum, country) => sum + country.units, 0),
    subscriptions: 1840,
    inAppPurchases: 612,
    countries: countryBreakdown.length,
    countryBreakdown,
    timeSeries,
    rows: 1284,
    marketingViews: 1680000,
    marketingPosts: 42,
    marketingEngagement: 7.8,
    expenses: 18200,
    profit: 44700,
    aso: {
      fetchedAt: new Date().toISOString(),
      status: "Demo metadata",
      primaryLocale: "en-US",
      latestVersion: "2.4.1",
      localizations: 7,
      locales: ["en-US", "fr-FR", "en-GB", "de-DE", "es-ES", "ja-JP", "pt-BR"],
      keywordCount: 31,
      keywords: ["alarm", "anti snooze", "morning routine", "wake up", "sleep schedule", "focus", "habit", "deep sleeper", "productivity", "motivation"],
      titleCoverage: 100,
      subtitleCoverage: 100,
      descriptionCoverage: 100,
      metadataScore: 94,
    },
    release: {
      fetchedAt: new Date().toISOString(),
      latestVersion: "2.4.1",
      platform: "IOS",
      state: "READY_FOR_SALE",
      versionCount: 5,
      readyForSale: true,
      editable: false,
    },
    status: "synced",
    message: "Demo data",
  };
  const socials: SocialAccount[] = [
    { id: "demo-tiktok-cocorise", isDemo: true, handle: "@cocoriseapp", platform: "TikTok", appId: app.id, followers: 128400, avgViews: 48600, posts: 24, engagementRate: 8.2, status: "Ready for public tracking", createdAt: new Date().toISOString() },
    { id: "demo-instagram-cocorise", isDemo: true, handle: "@cocorise.app", platform: "Instagram", appId: app.id, followers: 34200, avgViews: 12100, posts: 14, engagementRate: 5.6, status: "Ready for public tracking", createdAt: new Date().toISOString() },
    { id: "demo-youtube-cocorise", isDemo: true, handle: "@cocorise", platform: "YouTube", appId: app.id, followers: 18400, avgViews: 9200, posts: 4, engagementRate: 4.4, status: "Ready for public tracking", createdAt: new Date().toISOString() },
  ];
  return { app, metric, socials };
}

function buildDemoTimeSeries(dateRange: string) {
  const count = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;
  const points = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() - count);
  for (let index = 0; index < count; index += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const wave = Math.sin(index / 3) * 0.18 + Math.cos(index / 7) * 0.1;
    const launchLift = index > count * 0.62 ? 1.28 : 1;
    const revenue = Math.round((1240 + index * 38) * (1 + wave) * launchLift);
    const downloads = Math.round((520 + index * 9) * (1 + wave * 0.7) * launchLift);
    const subscriptions = Math.round((42 + index * 0.9) * (1 + wave * 0.55));
    const inAppPurchases = Math.round((15 + index * 0.35) * (1 + wave * 0.4));
    points.push({ date: cursor.toISOString().slice(0, 10), downloads, inAppPurchases, revenue, subscriptions, units: downloads + subscriptions + inAppPurchases });
  }
  return points;
}

function aggregateTrend(metrics: AppStoreMetric[], key: "downloads" | "revenue" | "subscriptions") {
  return aggregateTrendPoints(metrics, key).map((point) => point.value);
}

function aggregateTrendPoints(metrics: AppStoreMetric[], key: "downloads" | "revenue" | "subscriptions") {
  const byDate = new Map<string, number>();
  for (const metric of metrics) {
    for (const point of metric.timeSeries) {
      byDate.set(point.date, (byDate.get(point.date) ?? 0) + point[key]);
    }
  }
  const daily = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (daily.length > 45) {
    const weekly = new Map<string, number>();
    for (const [date, value] of daily) {
      const label = weekLabel(date);
      weekly.set(label, (weekly.get(label) ?? 0) + value);
    }
    return Array.from(weekly.entries()).map(([label, value]) => ({ label, value }));
  }
  return daily.map(([date, value]) => ({ label: formatDateLabel(date), value }));
}

function formatDateLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

function weekLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  const start = new Date(parsed);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return `Week of ${formatDateLabel(start.toISOString().slice(0, 10))}`;
}

function countryFlag(country: string) {
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳";
  return String.fromCodePoint(...code.split("").map((char) => 127397 + char.charCodeAt(0)));
}

function localeCountry(locale: string) {
  const parts = locale.replace("_", "-").split("-");
  return parts.at(-1)?.toUpperCase() || "US";
}

function countryName(country: string) {
  const names: Record<string, string> = {
    AU: "Australia",
    BR: "Brazil",
    CA: "Canada",
    DE: "Germany",
    ES: "Spain",
    FR: "France",
    GB: "United Kingdom",
    IT: "Italy",
    JP: "Japan",
    US: "US",
  };
  return names[country] ?? country;
}

function buildAsoKeywordRow(keyword: string, store: string, source: AsoKeywordRow["source"]): AsoKeywordRow {
  const normalized = keyword.trim().replace(/\s+/g, " ");
  const seed = Array.from(normalized).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    difficulty: 28 + (seed % 58),
    keyword: normalized,
    popularity: 52 + (seed % 39),
    source,
    store,
    trend: (seed % 9) - 4,
  };
}

function parseKeywordInput(value: string) {
  return Array.from(new Set(value.split(",").map((keyword) => keyword.trim().replace(/\s+/g, " ")).filter(Boolean)));
}

function keywordRows(metrics: AppStoreMetric[]) {
  const rows = new Map<string, AsoKeywordRow>();
  for (const metric of metrics) {
    const store = localeCountry(metric.aso?.primaryLocale || metric.aso?.locales[0] || "en-US");
    for (const keyword of metric.aso?.keywords ?? []) {
      const normalized = keyword.trim();
      if (!normalized) continue;
      rows.set(normalized.toLowerCase(), buildAsoKeywordRow(normalized, store, "apple"));
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.popularity - a.popularity).slice(0, 40);
}

function latestMetric(metrics: AppStoreMetric[], appId: string) {
  return metrics.filter((metric) => metric.appId === appId).sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))[0];
}

function buildActions(apps: StudioApp[], socials: SocialAccount[], metrics: AppStoreMetric[]): ActionItem[] {
  const actions: ActionItem[] = [];
  for (const app of apps) {
    const metric = latestMetric(metrics, app.id);
    if (app.status !== "Ready to sync") actions.push({ title: `${app.name}: complete credentials`, text: "Add missing Apple access before metrics can sync.", page: "apps", priority: "Critical" });
    if (app.status === "Ready to sync" && !metric) actions.push({ title: `${app.name}: run first sync`, text: "Apple metrics are not available until the first successful sync.", page: "apps", priority: "High" });
    if (metric && metric.parserVersion < 5) actions.push({ title: `${app.name}: refresh Apple sync`, text: "Run the latest sync to include ASO metadata and release state.", page: "apps", priority: "High" });
    if (metric?.downloads && !metric.revenueRows) actions.push({ title: `${app.name}: review monetization`, text: "Downloads are present, but Apple revenue is empty for the selected reports.", page: "revenue", priority: "Medium" });
    if (metric?.message.includes("financials pending")) actions.push({ title: `${app.name}: retry financial reports`, text: "Acquisition synced, but Apple financial reports did not complete.", page: "revenue", priority: "High" });
    if (metric?.aso && metric.aso.metadataScore < 80) actions.push({ title: `${app.name}: improve ASO metadata`, text: "Title, subtitle, description or keyword coverage is below release quality.", page: "aso", priority: "Medium" });
    if (metric && !metric.release?.readyForSale) actions.push({ title: `${app.name}: check release state`, text: "Latest App Store version is not marked ready for sale.", page: "releases", priority: "High" });
    if (!socials.some((social) => social.appId === app.id)) actions.push({ title: `${app.name}: map public handles`, text: "Add brand or creator handles to connect marketing context.", page: "social", priority: "Medium" });
  }
  if (!apps.length) actions.push({ title: "Add first app", text: "Start with App Store Connect credentials and the .p8 key path.", page: "integrations", priority: "Critical" });
  if (!actions.length) actions.push({ title: "Workspace healthy", text: "Connected sources have no blocking setup issues.", page: "overview", priority: "Medium" });
  return actions;
}

function sumMetric(metrics: AppStoreMetric[], key: "downloads" | "revenue" | "revenueRows" | "subscriptions" | "inAppPurchases" | "rows" | "financeRows") {
  return metrics.reduce((sum, metric) => sum + (Number(metric[key]) || 0), 0);
}

function aggregateCountries(metrics: AppStoreMetric[]) {
  const byCountry = new Map<string, { country: string; downloads: number; revenue: number; units: number }>();
  for (const metric of metrics) {
    for (const row of metric.countryBreakdown ?? []) {
      const country = row.country.trim().toUpperCase();
      if (!country) continue;
      const current = byCountry.get(country) ?? { country, downloads: 0, revenue: 0, units: 0 };
      byCountry.set(country, {
        country,
        downloads: current.downloads + row.downloads,
        revenue: current.revenue + row.revenue,
        units: current.units + row.units,
      });
    }
  }
  return Array.from(byCountry.values()).sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue) || b.downloads - a.downloads);
}

function trendDelta(values: number[]) {
  if (values.length < 2) return 0;
  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const previous = values.slice(0, midpoint).reduce((sum, value) => sum + value, 0);
  const current = values.slice(midpoint).reduce((sum, value) => sum + value, 0);
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function trendSignal(values: number[]) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (cleanValues.length < 3 || Math.max(...cleanValues.map((value) => Math.abs(value)), 0) === 0) {
    return { direction: "flat" as const, percent: 0 };
  }
  const percent = trendDelta(cleanValues);
  if (Math.abs(percent) < 0.5) return { direction: "flat" as const, percent: 0 };
  return { direction: percent > 0 ? "up" as const : "down" as const, percent: Math.abs(percent) };
}

function revenueAnalytics(metrics: AppStoreMetric[]) {
  const revenue = sumMetric(metrics, "revenue");
  const downloads = sumMetric(metrics, "downloads");
  const subscriptions = sumMetric(metrics, "subscriptions");
  const inAppPurchases = sumMetric(metrics, "inAppPurchases");
  const revenueRows = sumMetric(metrics, "revenueRows");
  const financeRows = sumMetric(metrics, "financeRows");
  const monetizedUnits = subscriptions + inAppPurchases;
  const currency = normalizeCurrency(metrics.find((metric) => metric.currency)?.currency);
  const averageRevenuePerDownload = downloads ? revenue / downloads : 0;
  const monetizationRate = downloads ? (monetizedUnits / downloads) * 100 : 0;
  const subscriptionShare = monetizedUnits ? (subscriptions / monetizedUnits) * 100 : 0;
  const health = [
    metrics.length > 0,
    revenueRows > 0,
    financeRows > 0,
    monetizedUnits > 0,
    downloads > 0,
  ].filter(Boolean).length;
  return { averageRevenuePerDownload, currency, downloads, financeRows, health, inAppPurchases, monetizationRate, monetizedUnits, revenue, revenueRows, subscriptionShare, subscriptions };
}

function normalizeMetrics(metrics: AppStoreMetric[]) {
  return metrics.map(normalizeMetric);
}

function marketingAnalytics(metrics: AppStoreMetric[], socials: SocialAccount[]) {
  const downloads = sumMetric(metrics, "downloads");
  const revenue = sumMetric(metrics, "revenue");
  const spend = metrics.reduce((sum, metric) => sum + (metric.expenses ?? 0), 0);
  const socialViews = socials.reduce((sum, social) => sum + (social.avgViews ?? 0) * (social.posts ?? 0), 0);
  const socialPosts = socials.reduce((sum, social) => sum + (social.posts ?? 0), 0);
  const engagement = socials.length ? socials.reduce((sum, social) => sum + (social.engagementRate ?? 0), 0) / socials.length : 0;
  const currency = normalizeCurrency(metrics.find((metric) => metric.currency)?.currency);
  return {
    cpi: spend && downloads ? spend / downloads : 0,
    currency,
    downloads,
    engagement,
    revenue,
    roas: spend ? revenue / spend : 0,
    socialPosts,
    socialViews,
    spend,
  };
}

function asoAnalytics(metrics: AppStoreMetric[]) {
  const snapshots = metrics.map((metric) => metric.aso).filter((aso): aso is NonNullable<AppStoreMetric["aso"]> => Boolean(aso));
  const score = snapshots.length ? snapshots.reduce((sum, aso) => sum + aso.metadataScore, 0) / snapshots.length : 0;
  const locales = Array.from(new Set(snapshots.flatMap((aso) => aso.locales))).sort();
  const keywords = Array.from(new Set(snapshots.flatMap((aso) => aso.keywords))).slice(0, 24);
  const keywordCount = snapshots.reduce((sum, aso) => sum + aso.keywordCount, 0);
  const titleCoverage = snapshots.length ? snapshots.reduce((sum, aso) => sum + aso.titleCoverage, 0) / snapshots.length : 0;
  const subtitleCoverage = snapshots.length ? snapshots.reduce((sum, aso) => sum + aso.subtitleCoverage, 0) / snapshots.length : 0;
  const descriptionCoverage = snapshots.length ? snapshots.reduce((sum, aso) => sum + aso.descriptionCoverage, 0) / snapshots.length : 0;
  return { descriptionCoverage, keywordCount, keywords, locales, score, snapshots, subtitleCoverage, titleCoverage };
}

function operationsAnalytics(apps: StudioApp[], socials: SocialAccount[], metrics: AppStoreMetric[]) {
  const actions = buildActions(apps, socials, metrics);
  const syncedAppIds = new Set(metrics.map((metric) => metric.appId));
  const releases = metrics.map((metric) => ({ appName: metric.appName, bundleId: metric.bundleId, release: metric.release, state: metric.state })).filter((item) => item.release);
  const readyReleases = releases.filter((item) => item.release?.readyForSale).length;
  const blockedActions = actions.filter((action) => action.priority === "Critical" || action.priority === "High").length;
  const revenue = sumMetric(metrics, "revenue");
  const downloads = sumMetric(metrics, "downloads");
  const products = sumMetric(metrics, "subscriptions") + sumMetric(metrics, "inAppPurchases");
  const qualityScore = Math.round(([
    apps.length > 0,
    syncedAppIds.size === apps.length && apps.length > 0,
    blockedActions === 0,
    readyReleases === releases.length && releases.length > 0,
    metrics.every((metric) => metric.aso?.metadataScore ? metric.aso.metadataScore >= 80 : true),
  ].filter(Boolean).length / 5) * 100);
  return { actions, blockedActions, downloads, products, qualityScore, readyReleases, releases, revenue, syncedAppIds };
}

function roadmapItems(apps: StudioApp[], socials: SocialAccount[], metrics: AppStoreMetric[]) {
  const analytics = revenueAnalytics(metrics);
  const aso = asoAnalytics(metrics);
  const ops = operationsAnalytics(apps, socials, metrics);
  return [
    { area: "Revenue", title: "Lift paid conversion", impact: analytics.downloads && analytics.monetizedUnits ? `${analytics.monetizationRate.toFixed(1)}% baseline` : "Needs product data", ready: analytics.monetizedUnits > 0, page: "paywall" as PageKey },
    { area: "ASO", title: "Expand searchable metadata", impact: aso.keywordCount ? `${formatNumber(aso.keywordCount)} keywords indexed` : "Sync App Store metadata", ready: aso.score >= 80, page: "aso" as PageKey },
    { area: "Acquisition", title: "Scale install sources", impact: analytics.downloads ? `${formatNumber(analytics.downloads)} downloads tracked` : "Needs Apple reports", ready: analytics.downloads > 0, page: "acquisition" as PageKey },
    { area: "Operations", title: "Close launch blockers", impact: `${ops.blockedActions} priority tasks`, ready: ops.blockedActions === 0, page: "tasks" as PageKey },
  ];
}

function buildWorkspaceAnswer(question: string, apps: StudioApp[], socials: SocialAccount[], metrics: AppStoreMetric[], activePage: PageKey) {
  const normalized = question.toLowerCase();
  const revenue = revenueAnalytics(metrics);
  const marketing = marketingAnalytics(metrics, socials);
  const aso = asoAnalytics(metrics);
  const ops = operationsAnalytics(apps, socials, metrics);
  const actions = ops.actions.slice(0, 4);
  const topCountry = aggregateCountries(metrics)[0];

  if (normalized.includes("revenue") || normalized.includes("argent") || normalized.includes("mrr") || normalized.includes("monet")) {
    return `Revenue: ${formatCurrency(revenue.revenue, revenue.currency)} net proceeds, ${formatNumber(revenue.downloads)} downloads, ${formatNumber(revenue.subscriptions)} subscriptions. ARPD is ${formatCurrency(revenue.averageRevenuePerDownload, revenue.currency)}. ${topCountry ? `Top country: ${topCountry.country} with ${formatCurrency(topCountry.revenue, revenue.currency)}.` : "No country split yet."}`;
  }

  if (normalized.includes("aso") || normalized.includes("keyword") || normalized.includes("store") || normalized.includes("metadata")) {
    return `ASO: metadata score ${aso.score.toFixed(0)}%, ${formatNumber(aso.keywordCount)} keywords and ${formatNumber(aso.locales.length)} locales. ${aso.keywords.length ? `Strong keywords visible: ${aso.keywords.slice(0, 8).join(", ")}.` : "Run Apple sync to pull App Store keywords and localizations."}`;
  }

  if (normalized.includes("marketing") || normalized.includes("campaign") || normalized.includes("creator") || normalized.includes("social")) {
    return `Marketing: ${formatNumber(marketing.downloads)} installs, ${formatNumber(marketing.socialViews)} social views, ${formatNumber(marketing.socialPosts)} posts and ${marketing.roas ? `${marketing.roas.toFixed(1)}x ROAS` : "ROAS pending"}. Next useful page: ${marketing.socialViews ? "Creatives" : "Social Tracking"}.`;
  }

  if (normalized.includes("operation") || normalized.includes("release") || normalized.includes("quality") || normalized.includes("roadmap")) {
    return `Operations: launch score ${ops.qualityScore}%, ${ops.readyReleases}/${ops.releases.length || apps.length} releases ready for sale, ${ops.blockedActions} priority blockers. Open Tasks if you want the exact execution list.`;
  }

  if (normalized.includes("task") || normalized.includes("todo") || normalized.includes("priorit")) {
    return actions.length ? `Priority tasks: ${actions.map((action) => `${action.title} (${action.priority})`).join("; ")}.` : "No blocking tasks. Workspace looks operationally healthy.";
  }

  if (normalized.includes("page") || normalized.includes("where") || normalized.includes("où")) {
    return `You are on ${pageCopy[activePage].title}. Use Revenue for money, ASO for App Store metadata, Campaigns for spend/ROAS, Releases for App Store state, and Tasks for what to fix next.`;
  }

  return `Current snapshot: ${formatNumber(apps.length)} apps, ${formatNumber(socials.length)} handles, ${formatCurrency(revenue.revenue, revenue.currency)} revenue, ${formatNumber(revenue.downloads)} downloads, ASO ${aso.score.toFixed(0)}%, Ops ${ops.qualityScore}%. Ask me about revenue, ASO, marketing, operations or priorities.`;
}

export default function Home() {
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [openSections, setOpenSections] = useState(() => navSections.map((section) => section.label));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [apps, setApps] = useState<StudioApp[]>([]);
  const [socials, setSocials] = useState<SocialAccount[]>([]);
  const [appStoreMetrics, setAppStoreMetrics] = useState<AppStoreMetric[]>([]);
  const [syncingAppId, setSyncingAppId] = useState("");
  const attemptedAutoSyncIds = useRef(new Set<string>());
  const [syncError, setSyncError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiListening, setAiListening] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([{ id: "welcome", role: "assistant", text: "Ask about revenue, ASO, marketing, releases or what to fix next." }]);
  const [appForm, setAppForm] = useState({ name: "", platform: "iOS", bundleId: "", appStoreId: "", keyId: detectedPrivateKey.keyId, issuerId: "", vendorNumber: "", privateKeyName: detectedPrivateKey.name, privateKeyPath: detectedPrivateKey.path });
  const [socialForm, setSocialForm] = useState({ platform: "TikTok" as SocialAccount["platform"], handle: "", appId: "" });

  const openPage = useCallback((page: PageKey) => {
    setActivePage(page);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${page}`);
      window.scrollTo({ left: 0, top: 0 });
    }
  }, []);

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
      const demo = buildDemoWorkspace(DEFAULT_DATE_RANGE);
      const storedApps = normalizeApps(readStored<StudioApp[]>(APP_STORAGE, []));
      const storedSocials = readStored<SocialAccount[]>(SOCIAL_STORAGE, []);
      const storedMetrics = normalizeMetrics(readStored<AppStoreMetric[]>(METRIC_STORAGE, []));
      setApps([demo.app, ...storedApps.filter((app) => app.id !== demo.app.id)]);
      setSocials([...demo.socials, ...storedSocials.filter((social) => !social.isDemo)]);
      setAppStoreMetrics([normalizeMetric(demo.metric), ...storedMetrics.filter((metric) => metric.appId !== demo.app.id)]);
      const hashPage = window.location.hash.replace("#", "") as PageKey;
      if (pageCopy[hashPage]) {
        setActivePage(hashPage);
        window.scrollTo({ left: 0, top: 0 });
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(loadStoredData);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hashPage = window.location.hash.replace("#", "") as PageKey;
      if (pageCopy[hashPage]) setActivePage(hashPage);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(APP_STORAGE, JSON.stringify(apps));
  }, [apps, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(SOCIAL_STORAGE, JSON.stringify(socials));
  }, [socials, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(METRIC_STORAGE, JSON.stringify(appStoreMetrics));
  }, [appStoreMetrics, loaded]);

  const syncAppStore = useCallback(async (app: StudioApp) => {
    setSyncError("");
    setSyncingAppId(app.id);
    try {
      const response = await fetch("/api/app-store-connect/sync", {
        body: JSON.stringify({ app, dateRange }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { ok: boolean; metrics?: AppStoreMetric; message?: string; missing?: string[] };
      if (!response.ok || !payload.ok || !payload.metrics) {
        const missing = payload.missing?.length ? ` Missing: ${payload.missing.join(", ")}.` : "";
        throw new Error(`${payload.message ?? "App Store Connect sync failed."}${missing}`);
      }
      setAppStoreMetrics((current) => [normalizeMetric(payload.metrics!), ...current.filter((metric) => metric.appId !== app.id)]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "App Store Connect sync failed.");
    } finally {
      setSyncingAppId("");
    }
  }, [dateRange]);

  useEffect(() => {
    if (!loaded || syncingAppId) return;
    const candidate = apps.find((app) => {
      if (app.isDemo) return false;
      const isComplete = app.keyId && app.issuerId && app.vendorNumber && app.appStoreId && app.privateKeyPath;
      const hasCurrentMetrics = appStoreMetrics.some((metric) => metric.appId === app.id && metric.parserVersion >= 5 && metric.dateRange === dateRange && metric.aso);
      return isComplete && !hasCurrentMetrics && !attemptedAutoSyncIds.current.has(app.id);
    });
    if (!candidate) return;
    attemptedAutoSyncIds.current.add(candidate.id);
    void syncAppStore(candidate);
  }, [appStoreMetrics, apps, dateRange, loaded, syncAppStore, syncingAppId]);

  const totals = useMemo(() => {
    const readyApps = apps.filter((app) => app.status === "Ready to sync").length;
    const missingApps = apps.length - readyApps;
    const mappedSocials = socials.filter((social) => apps.some((app) => app.id === social.appId)).length;
    const revenue = appStoreMetrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const downloads = appStoreMetrics.reduce((sum, metric) => sum + metric.downloads, 0);
    const revenueRows = appStoreMetrics.reduce((sum, metric) => sum + metric.revenueRows, 0);
    const subscriptions = appStoreMetrics.reduce((sum, metric) => sum + metric.subscriptions, 0);
    const syncedApps = new Set(appStoreMetrics.map((metric) => metric.appId)).size;
    const currency = normalizeCurrency(appStoreMetrics.find((metric) => metric.currency)?.currency);
    const downloadTrend = aggregateTrend(appStoreMetrics, "downloads");
    const revenueTrend = aggregateTrend(appStoreMetrics, "revenue");
    const subscriptionTrend = aggregateTrend(appStoreMetrics, "subscriptions");
    return { readyApps, missingApps, mappedSocials, socialCount: socials.length, appCount: apps.length, revenue, revenueRows, downloads, subscriptions, syncedApps, currency, downloadTrend, revenueTrend, subscriptionTrend };
  }, [appStoreMetrics, apps, socials]);

  const selectedAppId = socialForm.appId || apps[0]?.id || "";
  const copy = pageCopy[activePage];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleApps = useMemo(() => {
    if (!normalizedSearch) return apps;
    return apps.filter((app) => [app.name, app.platform, app.bundleId, app.appStoreId, app.privateKeyPath, app.status].join(" ").toLowerCase().includes(normalizedSearch));
  }, [apps, normalizedSearch]);
  const visibleSocials = useMemo(() => {
    if (!normalizedSearch) return socials;
    return socials.filter((social) => {
      const mappedApp = apps.find((app) => app.id === social.appId)?.name ?? "";
      return [social.handle, social.platform, social.status, mappedApp].join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [apps, normalizedSearch, socials]);

  function updateAppForm(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setAppForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateSocialForm(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setSocialForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function addApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appForm.name.trim()) return;
    const hasCredentials = Boolean(appForm.keyId.trim() && appForm.issuerId.trim() && appForm.vendorNumber.trim() && appForm.appStoreId.trim() && (appForm.privateKeyName.trim() || appForm.privateKeyPath.trim()));
    const id = `${appForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    setApps((current) => [
      ...current,
      {
        id,
        name: appForm.name.trim(),
        platform: appForm.platform,
        bundleId: appForm.bundleId.trim(),
        appStoreId: appForm.appStoreId.trim(),
        keyId: appForm.keyId.trim(),
        issuerId: appForm.issuerId.trim(),
        vendorNumber: appForm.vendorNumber.trim(),
        privateKeyName: appForm.privateKeyName.trim(),
        privateKeyPath: appForm.privateKeyPath.trim(),
        status: hasCredentials ? "Ready to sync" : "Missing credentials",
        createdAt: new Date().toISOString(),
      },
    ]);
    setAppForm({ name: "", platform: "iOS", bundleId: "", appStoreId: "", keyId: detectedPrivateKey.keyId, issuerId: "", vendorNumber: "", privateKeyName: detectedPrivateKey.name, privateKeyPath: detectedPrivateKey.path });
    openPage("onboarding");
  }

  function addSocial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!socialForm.handle.trim() || !selectedAppId) return;
    const handle = socialForm.handle.trim().startsWith("@") ? socialForm.handle.trim() : `@${socialForm.handle.trim()}`;
    setSocials((current) => [...current, { id: `${socialForm.platform}-${handle}-${Date.now()}`, handle, platform: socialForm.platform, appId: selectedAppId, status: "Ready for public tracking", createdAt: new Date().toISOString() }]);
    setSocialForm({ platform: "TikTok", handle: "", appId: selectedAppId });
    openPage("social");
  }

  function resetWorkspace() {
    window.localStorage.removeItem(APP_STORAGE);
    window.localStorage.removeItem(SOCIAL_STORAGE);
    window.localStorage.removeItem(METRIC_STORAGE);
    setApps([]);
    setSocials([]);
    setAppStoreMetrics([]);
    openPage("landing");
  }

  function loadDemoWorkspace() {
    const demo = buildDemoWorkspace(dateRange);
    setApps((current) => [demo.app, ...current.filter((app) => app.id !== demo.app.id)]);
    setSocials((current) => [...demo.socials, ...current.filter((social) => !social.isDemo)]);
    setAppStoreMetrics((current) => [normalizeMetric(demo.metric), ...current.filter((metric) => metric.appId !== demo.app.id)]);
    openPage("overview");
  }

  function exportWorkspace() {
    const payload = {
      exportedAt: new Date().toISOString(),
      dateRange,
      apps,
      socialAccounts: socials,
      appStoreMetrics,
      note: "Local DriftOS export. Private .p8 key contents are not stored in the browser export.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `driftos-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleSection(label: string) {
    setOpenSections((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  }

  function focusWorkspaceSearch() {
    setSidebarCollapsed(false);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }

  function sendAiMessage(text = aiInput) {
    const prompt = text.trim();
    if (!prompt) return;
    const userMessage: AiMessage = { id: `user-${Date.now()}`, role: "user", text: prompt };
    const assistantMessage: AiMessage = { id: `assistant-${Date.now()}`, role: "assistant", text: buildWorkspaceAnswer(prompt, apps, socials, appStoreMetrics, activePage) };
    setAiMessages((current) => [...current, userMessage, assistantMessage]);
    setAiInput("");
    setAiOpen(false);
  }

  function startVoiceInput() {
    const speechWindow = window as Window & { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setAiOpen(true);
      setAiMessages((current) => [...current, { id: `voice-${Date.now()}`, role: "assistant", text: "Voice input is not available in this browser. Type your question and I will answer from workspace data." }]);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.onstart = () => setAiListening(true);
    recognition.onend = () => setAiListening(false);
    recognition.onerror = () => setAiListening(false);
    recognition.onresult = (event: VoiceRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setAiInput(transcript);
      sendAiMessage(transcript);
    };
    recognition.start();
  }

  const appFormCard = <AppForm appForm={appForm} addApp={addApp} updateAppForm={updateAppForm} setAppForm={setAppForm} />;
  const socialFormCard = <SocialForm apps={apps} socialForm={socialForm} selectedAppId={selectedAppId} addSocial={addSocial} updateSocialForm={updateSocialForm} />;

  function renderPage() {
    if (activePage === "landing") return <LandingPage totals={totals} setActivePage={openPage} loadDemoWorkspace={loadDemoWorkspace} />;
    if (activePage === "onboarding") return <OnboardingPage apps={apps} socials={socials} metrics={appStoreMetrics} appFormCard={appFormCard} socialFormCard={socialFormCard} syncError={syncError} setActivePage={openPage} loadDemoWorkspace={loadDemoWorkspace} />;
    if (activePage === "overview") return <><MetricStrip totals={totals} setActivePage={openPage} /><Overview apps={apps} totals={totals} metrics={appStoreMetrics} setActivePage={openPage} /><ModuleMatrix totals={totals} setActivePage={openPage} /></>;
    if (activePage === "apps") return <>{appFormCard}{syncError ? <InlineError text={syncError} /> : null}<AppTable apps={visibleApps} socials={socials} metrics={appStoreMetrics} setApps={setApps} setSocials={setSocials} syncAppStore={syncAppStore} syncingAppId={syncingAppId} isFiltered={Boolean(normalizedSearch)} /></>;
    if (activePage === "actions") return <Actions apps={apps} socials={socials} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "revenue") return <AnalyticsPage kind="revenue" apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "subscriptions") return <AnalyticsPage kind="subscriptions" apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "monetization") return <MonetizationPage apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "acquisition") return <AnalyticsPage kind="acquisition" apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "aso") return <AsoPage apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "creatives") return <CreativePage apps={apps} socials={visibleSocials} setSocials={setSocials} isFiltered={Boolean(normalizedSearch)} />;
    if (activePage === "campaigns") return <CampaignsPage apps={apps} metrics={appStoreMetrics} socials={visibleSocials} setActivePage={openPage} />;
    if (activePage === "social") return <>{socialFormCard}<SocialTable apps={apps} socials={visibleSocials} setSocials={setSocials} isFiltered={Boolean(normalizedSearch)} /></>;
    if (activePage === "creators") return <Creators apps={apps} socials={visibleSocials} isFiltered={Boolean(normalizedSearch)} />;
    if (activePage === "product") return <ProductPage apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "releases") return <ReleasesPage apps={apps} socials={socials} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "quality") return <QualityPage apps={apps} socials={socials} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "roadmap") return <RoadmapPage apps={apps} socials={socials} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "tasks") return <TasksPage apps={apps} socials={socials} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "paywall") return <PaywallPage apps={apps} metrics={appStoreMetrics} setActivePage={openPage} />;
    if (activePage === "geoRevenue") return <GeoRevenuePage apps={apps} metrics={appStoreMetrics} />;
    if (activePage === "integrations") return <><section className="setupGrid">{appFormCard}{socialFormCard}</section>{syncError ? <InlineError text={syncError} /> : null}<AppTable apps={visibleApps} socials={socials} metrics={appStoreMetrics} setApps={setApps} setSocials={setSocials} syncAppStore={syncAppStore} syncingAppId={syncingAppId} isFiltered={Boolean(normalizedSearch)} /><SocialTable apps={apps} socials={visibleSocials} setSocials={setSocials} isFiltered={Boolean(normalizedSearch)} /></>;
    return <Settings apps={apps} socials={socials} resetWorkspace={resetWorkspace} loadDemoWorkspace={loadDemoWorkspace} />;
  }

  const mobileItems = navSections.flatMap((section) => section.items);

  return (
    <main className={sidebarCollapsed ? "appShell sidebarCollapsed" : "appShell"}>
      <LiquidGlass as="aside" className="sideRail">
        <div className="sidebarHead">
          <div className="brandBlock"><div className="brandLogo" aria-hidden="true"><span /><span /><span /><span /></div><div className="brandCopy"><strong>DriftOS</strong><small>Drift Studio</small></div></div>
          <button className="sidebarToggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={sidebarCollapsed}>
            {sidebarCollapsed ? <PanelLeftOpen size={22} strokeWidth={2} /> : <PanelLeftClose size={22} strokeWidth={2} />}
          </button>
        </div>
        <div className="sidebarQuickActions" aria-label="Sidebar tools">
          <button type="button" onClick={focusWorkspaceSearch}><Search size={20} strokeWidth={2} />Search</button>
          <button type="button" onClick={() => setAiOpen(true)}><Sparkles size={20} strokeWidth={2} />Copilot</button>
        </div>
        <select className="teamSelect" aria-label="Workspace"><option>Drift Studio</option></select>
        <SidebarAssistant input={aiInput} isListening={aiListening} messages={aiMessages} onChange={setAiInput} onSend={() => sendAiMessage()} onVoice={startVoiceInput} />
        <nav className="sideNav" aria-label="Navigation">
          {navSections.map((section) => {
            const SectionIcon = section.icon;
            const isOpen = openSections.includes(section.label);
            const isCategoryActive = section.items.some((item) => item.page === activePage);
            return (
              <div className={isCategoryActive ? "navGroup activeGroup" : "navGroup"} key={section.label}>
                <button className="navGroupHeader" type="button" onClick={() => toggleSection(section.label)} aria-expanded={isOpen}>
                  <SectionIcon size={20} strokeWidth={2} />
                  <span>{section.label}</span>
                  <ChevronDown className={isOpen ? "chevron isOpen" : "chevron"} size={18} strokeWidth={2} />
                </button>
                {isOpen ? (
                  <div className="navItems">
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button className={activePage === item.page ? "isActive" : ""} type="button" onClick={() => openPage(item.page)} aria-current={activePage === item.page ? "page" : undefined} aria-label={item.name} key={item.page}>
                          <ItemIcon className="navIcon" size={21} strokeWidth={2} />
                          <span>{item.name}</span>
                          {item.page === "integrations" ? <b aria-hidden="true">{apps.length + socials.length}</b> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="sideStatus"><span>Workspace health</span><strong>{apps.length} apps / {socials.length} handles</strong><i /></div>
      </LiquidGlass>
      <section className="workbench">
        <LiquidGlass as="header" className="topHeader">
          <input ref={searchInputRef} className="searchBox" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search apps, sources, creators..." aria-label="Search workspace data" />
          <div className="topActions">
            <label className="rangeControl"><CalendarRange size={22} strokeWidth={2} /><select value={dateRange} onChange={(event) => setDateRange(event.target.value)} aria-label="Date range"><option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option><option value="90d">Last 90 Days</option></select></label>
            <button type="button" onClick={loadDemoWorkspace}>Load demo</button>
            <button type="button" onClick={exportWorkspace}><Download size={21} strokeWidth={2} />Export</button>
            <button type="button" onClick={resetWorkspace}>Clear data</button>
          </div>
        </LiquidGlass>
        <section className="heroRow compactHero"><h1>{copy.title}</h1></section>
        {renderPage()}
      </section>
      <LiquidGlass as="nav" className="mobileTabBar" aria-label="Mobile navigation">
        {mobileItems.map((item) => {
          const ItemIcon = item.icon;
          return (
            <button className={activePage === item.page ? "isActive" : ""} type="button" onClick={() => openPage(item.page)} aria-current={activePage === item.page ? "page" : undefined} key={`mobile-${item.page}`}>
              <ItemIcon size={22} strokeWidth={2} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </LiquidGlass>
      <AiDock
        input={aiInput}
        isListening={aiListening}
        isOpen={aiOpen}
        messages={aiMessages}
        onChange={setAiInput}
        onClose={() => setAiOpen(false)}
        onOpen={() => setAiOpen(true)}
        onSend={() => sendAiMessage()}
        onVoice={startVoiceInput}
      />
    </main>
  );
}

function revenueDetail(revenueRows: number, revenueSource?: string) {
  if (!revenueRows) return "No revenue found";
  return revenueSource === "Financial" ? "Financials synced" : "Revenue synced";
}

function MiniChart({ points, values, variant = "line", title = "Open chart" }: { points?: TrendPoint[]; values: number[]; variant?: "line" | "area" | "bars"; title?: string }) {
  const rawPoints = points?.length ? points : values.filter((value) => Number.isFinite(value)).map((value, index) => ({ label: `Point ${index + 1}`, value }));
  const chartPoints = rawPoints.length ? rawPoints.slice(-14) : Array.from({ length: 7 }, (_, index) => ({ label: `Point ${index + 1}`, value: 0 }));
  const chartValues = chartPoints.map((point) => point.value);
  const max = Math.max(...chartValues.map((value) => Math.abs(value)), 1);
  const svgPoints = chartValues.map((value, index) => {
    const x = chartValues.length === 1 ? 96 : 8 + (index * 176) / (chartValues.length - 1);
    const y = 64 - ((value / max) * 44);
    return [x, Math.max(10, Math.min(74, y))];
  });
  const linePath = svgPoints.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L 184 76 L 8 76 Z`;
  return (
    <svg className={`miniChart ${variant}`} viewBox="0 0 192 84" aria-hidden="false" role="img">
      <title>{title}</title>
      {variant === "bars" ? chartValues.map((value, index) => {
        const barHeight = Math.max(8, (Math.abs(value) / max) * 54);
        const x = 12 + index * (168 / chartValues.length);
        return <rect x={x} y={74 - barHeight} width={Math.max(5, 120 / chartValues.length)} height={barHeight} rx="4" key={`${value}-${index}`}><title>{`${chartPoints[index].label}: ${formatNumber(value)}`}</title></rect>;
      }) : null}
      {variant === "area" ? <path className="miniChartArea" d={areaPath} /> : null}
      {variant !== "bars" ? <path className="miniChartLine" d={linePath} /> : null}
      {variant !== "bars" ? svgPoints.map(([x, y], index) => <circle className="miniChartHit" cx={x} cy={y} r="10" key={`${x}-${index}`}><title>{`${chartPoints[index].label}: ${formatNumber(chartPoints[index].value)}`}</title></circle>) : null}
    </svg>
  );
}

function TrendBadge({ values }: { values: number[] }) {
  const signal = trendSignal(values);
  const Icon = signal.direction === "up" ? ArrowUpRight : signal.direction === "down" ? ArrowDownRight : ArrowRight;
  const label = `${signal.direction === "up" ? "Up" : signal.direction === "down" ? "Down" : "Flat"} ${signal.percent.toFixed(0)}%`;
  return (
    <span className={`metricTrend ${signal.direction}`} aria-label={label} title={label}>
      <Icon size={17} strokeWidth={2.4} />
      {signal.percent.toFixed(0)}%
    </span>
  );
}

function Metric({ label, value, chartValues, chartVariant = "line", page, setActivePage }: { Icon: LucideIcon; label: string; value: string; detail: string; chartValues: number[]; chartVariant?: "line" | "area" | "bars"; page: PageKey; setActivePage: (page: PageKey) => void }) {
  return <LiquidGlass as="button" className="metricCard clickableCard" type="button" onClick={() => setActivePage(page)} aria-label={`Open ${label}`}><TrendBadge values={chartValues} /><p>{label}</p><strong>{value}</strong><MiniChart values={chartValues} variant={chartVariant} title={`Open ${label} chart`} /></LiquidGlass>;
}

function AiDock({ input, isListening, isOpen, messages, onChange, onClose, onOpen, onSend, onVoice }: { input: string; isListening: boolean; isOpen: boolean; messages: AiMessage[]; onChange: (value: string) => void; onClose: () => void; onOpen: () => void; onSend: () => void; onVoice: () => void }) {
  if (!isOpen) {
    return (
      <button className="aiDockHandle" type="button" onClick={onOpen} aria-label="Open DriftOS AI assistant">
        <span />
      </button>
    );
  }

  return (
    <div className="aiOverlay" role="dialog" aria-modal="true" aria-label="DriftOS AI assistant">
      <button className="aiBackdrop" type="button" onClick={onClose} aria-label="Close assistant" />
      <LiquidGlass className="aiDockPanel">
        <div className="aiDockHeader">
          <div><p className="caption">Drift AI</p><h2>Ask anything about this workspace</h2></div>
          <button className="aiIconButton" type="button" onClick={onClose} aria-label="Close assistant"><X size={20} strokeWidth={2} /></button>
        </div>
        <div className="aiMessages" aria-live="polite">
          {messages.map((message) => <div className={`aiMessage ${message.role}`} key={message.id}>{message.text}</div>)}
        </div>
        <AiComposer input={input} isListening={isListening} onChange={onChange} onSend={onSend} onVoice={onVoice} />
      </LiquidGlass>
    </div>
  );
}

function SidebarAssistant({ input, isListening, messages, onChange, onSend, onVoice }: { input: string; isListening: boolean; messages: AiMessage[]; onChange: (value: string) => void; onSend: () => void; onVoice: () => void }) {
  return (
    <div className="sidebarAssistant">
      <div className="sidebarAssistantHeader">
        <span>Drift AI</span>
        <small>{messages.length > 1 ? "Live" : "Ready"}</small>
      </div>
      <div className="sidebarAiMessages" aria-live="polite">
        {messages.slice(-3).map((message) => <div className={`sidebarAiMessage ${message.role}`} key={`side-${message.id}`}>{message.text}</div>)}
      </div>
      <AiComposer input={input} isListening={isListening} onChange={onChange} onSend={onSend} onVoice={onVoice} compact />
    </div>
  );
}

function AiComposer({ compact = false, input, isListening, onChange, onSend, onVoice }: { compact?: boolean; input: string; isListening: boolean; onChange: (value: string) => void; onSend: () => void; onVoice: () => void }) {
  return (
    <form className={compact ? "aiComposer compact" : "aiComposer"} onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <button className={isListening ? "aiIconButton isListening" : "aiIconButton"} type="button" onClick={onVoice} aria-label={isListening ? "Listening" : "Use voice input"}><Mic size={20} strokeWidth={2} /></button>
      <input value={input} onChange={(event) => onChange(event.target.value)} placeholder={compact ? "Ask Drift AI..." : "Ask about revenue, ASO, campaigns..."} aria-label="Ask Drift AI" />
      <button className="aiSendButton" type="submit" aria-label="Send message"><Send size={20} strokeWidth={2} /></button>
    </form>
  );
}

function MetricStrip({ totals, setActivePage }: { totals: { appCount: number; readyApps: number; socialCount: number; revenue: number; revenueRows: number; downloads: number; syncedApps: number; currency: string; downloadTrend: number[]; revenueTrend: number[]; subscriptionTrend: number[] }; setActivePage: (page: PageKey) => void }) {
  return <section className="metricStrip" aria-label="Workspace metrics"><Metric Icon={PanelsTopLeft} label="Apps" value={formatNumber(totals.appCount)} detail={`${totals.readyApps} ready`} chartValues={[totals.appCount, totals.readyApps]} chartVariant="bars" page="apps" setActivePage={setActivePage} /><Metric Icon={Download} label="Downloads" value={formatNumber(totals.downloads)} detail={totals.syncedApps ? "Synced" : "Pending sync"} chartValues={totals.downloadTrend} chartVariant="area" page="acquisition" setActivePage={setActivePage} /><Metric Icon={AtSign} label="Social" value={formatNumber(totals.socialCount)} detail="Mapped handles" chartValues={[totals.socialCount]} chartVariant="bars" page="social" setActivePage={setActivePage} /><Metric Icon={Database} label="Revenue" value={formatCurrency(totals.revenue, totals.currency)} detail={revenueDetail(totals.revenueRows)} chartValues={totals.revenueTrend} chartVariant="area" page="revenue" setActivePage={setActivePage} /></section>;
}

function LandingPage({ totals, setActivePage, loadDemoWorkspace }: { totals: { appCount: number; readyApps: number; socialCount: number; revenue: number; revenueRows: number; downloads: number; syncedApps: number; currency: string; downloadTrend: number[]; revenueTrend: number[]; subscriptionTrend: number[] }; setActivePage: (page: PageKey) => void; loadDemoWorkspace: () => void }) {
  return (
    <>
      <LiquidGlass className="landingStage">
        <div className="landingCopy">
          <p className="caption">Operating system for mobile app studios</p>
          <h2>Run revenue, ASO, marketing and releases from one cockpit.</h2>
          <p>Connect App Store Connect once, map public social handles, then track the operating signals that decide whether an app is ready to scale.</p>
          <div className="landingActions">
            <button className="primaryButton" type="button" onClick={() => setActivePage("onboarding")}>Start setup</button>
            <button className="ghostButton" type="button" onClick={loadDemoWorkspace}>Load demo app</button>
          </div>
        </div>
        <button className="landingPreview" type="button" onClick={() => setActivePage("overview")} aria-label="Open DriftOS dashboard preview">
          <span><b>{formatNumber(totals.appCount)}</b><small>Apps</small></span>
          <span><b>{formatCurrency(totals.revenue, totals.currency)}</b><small>Revenue</small></span>
          <span><b>{formatNumber(totals.downloads)}</b><small>Downloads</small></span>
          <MiniChart values={totals.revenueTrend.length ? totals.revenueTrend : [0, 14, 22, 41, 38, 55]} variant="area" title="Preview revenue chart" />
        </button>
      </LiquidGlass>
      <section className="moduleMatrix">
        <Module label="Revenue" title="Apple financials" value={totals.revenueRows ? "Live" : "Ready"} text="Net proceeds, subscriptions and geo revenue." chartValues={totals.revenueTrend} page="revenue" setActivePage={setActivePage} />
        <Module label="Marketing" title="ASO + social" value={formatNumber(totals.socialCount)} text="Metadata, creators, campaigns and acquisition." chartValues={[totals.socialCount, totals.syncedApps]} page="aso" setActivePage={setActivePage} />
        <Module label="Operations" title="Release control" value={totals.readyApps ? "Active" : "Setup"} text="Versions, quality gates, roadmap and tasks." chartValues={[totals.readyApps, totals.appCount]} page="releases" setActivePage={setActivePage} />
      </section>
    </>
  );
}

function OnboardingPage({ apps, socials, metrics, appFormCard, socialFormCard, syncError, setActivePage, loadDemoWorkspace }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; appFormCard: ReactNode; socialFormCard: ReactNode; syncError: string; setActivePage: (page: PageKey) => void; loadDemoWorkspace: () => void }) {
  const readyApps = apps.filter((app) => app.status === "Ready to sync").length;
  const syncedApps = new Set(metrics.map((metric) => metric.appId)).size;
  const steps = [
    { label: "Create app", ready: apps.length > 0, value: `${apps.length} apps` },
    { label: "Apple credentials", ready: readyApps > 0, value: `${readyApps} ready` },
    { label: "Sync App Store", ready: syncedApps > 0, value: `${syncedApps} synced` },
    { label: "Map social handles", ready: socials.length > 0, value: `${socials.length} handles` },
  ];
  return (
    <>
      <LiquidGlass className="onboardingHero">
        <div>
          <p className="caption">Release setup</p>
          <h2>Bring the studio online.</h2>
          <p>Add your App Store app, attach the `.p8` key path, sync Apple KPIs, then map public handles for marketing context.</p>
        </div>
        <div className="onboardingProgress">{steps.map((step) => <button type="button" className={step.ready ? "isDone" : ""} onClick={() => setActivePage(step.label.includes("social") ? "social" : "apps")} key={step.label}><strong>{step.label}</strong><span>{step.value}</span></button>)}</div>
      </LiquidGlass>
      <section className="setupGrid">{appFormCard}{socialFormCard}</section>
      {syncError ? <InlineError text={syncError} /> : null}
      <section className="moduleMatrix">
        <Module label="Shortcut" title="Use demo workspace" value="Demo" text="Populate all modules instantly." chartValues={[1, 2, 4]} page="overview" setActivePage={() => { loadDemoWorkspace(); setActivePage("overview"); }} />
        <Module label="Next" title="Sync Apple" value={syncedApps ? "Done" : "Pending"} text="Run from Apps Portfolio." chartValues={[syncedApps, apps.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Ready" title="Open cockpit" value={syncedApps ? "Live" : "Setup"} text="Jump into the operating view." chartValues={[readyApps, syncedApps]} page="overview" setActivePage={setActivePage} />
      </section>
    </>
  );
}

function AppForm({
  appForm,
  addApp,
  updateAppForm,
  setAppForm,
}: {
  appForm: { name: string; platform: string; bundleId: string; appStoreId: string; keyId: string; issuerId: string; vendorNumber: string; privateKeyName: string; privateKeyPath: string };
  addApp: (event: FormEvent<HTMLFormElement>) => void;
  updateAppForm: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  setAppForm: React.Dispatch<React.SetStateAction<{ name: string; platform: string; bundleId: string; appStoreId: string; keyId: string; issuerId: string; vendorNumber: string; privateKeyName: string; privateKeyPath: string }>>;
}) {
  return (
    <LiquidGlass as="form" className="panel formPanel" onSubmit={addApp}>
      <div className="panelHeader">
        <div><p className="caption">App setup</p><h2>Add an app with .p8</h2></div>
        <button className="ghostButton" type="button" onClick={() => setAppForm((value) => ({ ...value, keyId: detectedPrivateKey.keyId, privateKeyName: detectedPrivateKey.name, privateKeyPath: detectedPrivateKey.path }))}>Use BUJ22BWQ5F</button>
      </div>
      <div className="formGrid">
        <input name="name" placeholder="App name" value={appForm.name} onChange={updateAppForm} />
        <select name="platform" value={appForm.platform} onChange={updateAppForm}><option>iOS</option><option>Android</option></select>
        <input name="bundleId" placeholder="Bundle ID" value={appForm.bundleId} onChange={updateAppForm} />
        <input name="appStoreId" placeholder="App Store ID" value={appForm.appStoreId} onChange={updateAppForm} />
        <input name="keyId" placeholder="Key ID" value={appForm.keyId} onChange={updateAppForm} />
        <input name="issuerId" placeholder="Issuer ID" value={appForm.issuerId} onChange={updateAppForm} />
        <input name="vendorNumber" placeholder="Vendor Number for sales reports" value={appForm.vendorNumber} onChange={updateAppForm} />
        <input className="wideInput" name="privateKeyPath" placeholder="Direct .p8 path" value={appForm.privateKeyPath} onChange={updateAppForm} />
        <label className="fileInput"><input type="file" accept=".p8" onChange={(event) => setAppForm((value) => ({ ...value, privateKeyName: event.target.files?.[0]?.name ?? value.privateKeyName }))} />{appForm.privateKeyName || "Upload .p8 private key"}</label>
      </div>
      <p className="formNote">Credentials stay local in this build. Key contents are never exported to the browser state.</p>
      <button className="primaryButton" type="submit">Create app</button>
    </LiquidGlass>
  );
}

function SocialForm({ apps, socialForm, selectedAppId, addSocial, updateSocialForm }: { apps: StudioApp[]; socialForm: { platform: SocialAccount["platform"]; handle: string; appId: string }; selectedAppId: string; addSocial: (event: FormEvent<HTMLFormElement>) => void; updateSocialForm: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return <LiquidGlass as="form" className="panel formPanel" onSubmit={addSocial}><div className="panelHeader"><div><p className="caption">Public social tracking</p><h2>Add a @handle</h2></div><span className="pill">No OAuth</span></div><div className="formGrid"><select name="platform" value={socialForm.platform} onChange={updateSocialForm}><option>TikTok</option><option>Instagram</option><option>YouTube</option></select><input name="handle" placeholder="@creator or brand account" value={socialForm.handle} onChange={updateSocialForm} /><select name="appId" value={selectedAppId} onChange={updateSocialForm}>{apps.map((app) => <option value={app.id} key={app.id}>{app.name}</option>)}</select></div><p className="formNote">Track public profiles without account authentication.</p><button className="primaryButton" type="submit" disabled={!apps.length}>Track handle</button></LiquidGlass>;
}

function Overview({ apps, totals, metrics, setActivePage }: { apps: StudioApp[]; totals: { readyApps: number; revenue: number; revenueRows: number; downloads: number; currency: string; downloadTrend: number[]; revenueTrend: number[] }; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  return <section className="moduleMatrix"><Module label="Portfolio" title="Apps connected" value={formatNumber(apps.length)} text={`${totals.readyApps} ready.`} chartValues={[apps.length, totals.readyApps]} page="apps" setActivePage={setActivePage} /><Module label="Acquisition" title="Downloads" value={formatNumber(totals.downloads)} text={metrics.length ? `${metrics.length} synced.` : "Pending."} chartValues={totals.downloadTrend} page="acquisition" setActivePage={setActivePage} /><Module label="Revenue" title="Net proceeds" value={formatCurrency(totals.revenue, totals.currency)} text={revenueDetail(totals.revenueRows)} chartValues={totals.revenueTrend} page="revenue" setActivePage={setActivePage} /></section>;
}

function ModuleMatrix({ totals, setActivePage }: { totals: { appCount: number; readyApps: number; missingApps: number; socialCount: number; mappedSocials: number; subscriptionTrend: number[] }; setActivePage: (page: PageKey) => void }) {
  return <section className="moduleMatrix"><Module label="Revenue Analytics" title="Subscriptions" value={formatNumber(totals.subscriptionTrend.reduce((sum, value) => sum + value, 0))} text="Lifecycle revenue." chartValues={totals.subscriptionTrend} page="subscriptions" setActivePage={setActivePage} /><Module label="Marketing" title="Coverage" value={`${totals.mappedSocials}/${totals.appCount}`} text="Mapped public handles." chartValues={[totals.mappedSocials, totals.socialCount]} page="social" setActivePage={setActivePage} /><Module label="System" title="Setup quality" value={totals.missingApps ? "Review" : "Ready"} text={`${totals.missingApps} credential gaps.`} chartValues={[totals.appCount, totals.readyApps]} page="actions" setActivePage={setActivePage} /></section>;
}

function Module({ title, value, chartValues = [], page, setActivePage }: { label: string; title: string; value: string; text: string; chartValues?: number[]; page?: PageKey; setActivePage?: (page: PageKey) => void }) {
  const content = <><TrendBadge values={chartValues} /><h2>{title}</h2><strong>{value}</strong><MiniChart values={chartValues} variant="line" title={`Open ${title} chart`} /></>;
  if (page && setActivePage) return <LiquidGlass as="button" className="panel moduleCard clickableCard" type="button" onClick={() => setActivePage(page)} aria-label={`Open ${title}`}>{content}</LiquidGlass>;
  return <LiquidGlass as="article" className="panel moduleCard">{content}</LiquidGlass>;
}

function Actions({ apps, socials, metrics, setActivePage }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const actions = buildActions(apps, socials, metrics);
  const missing = apps.filter((app) => app.status === "Missing credentials");
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Setup" title="Credential gaps" value={formatNumber(missing.length)} text="Apple access readiness." chartValues={[missing.length, apps.length - missing.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Sync" title="Apps synced" value={`${metrics.length}/${apps.length}`} text="Live Apple coverage." chartValues={[metrics.length, apps.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Marketing" title="Handles mapped" value={formatNumber(socials.length)} text="Public tracking coverage." chartValues={[socials.length]} page="social" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Priorities</p><h2>Action center</h2></div><span className="pill">{actions.length} open</span></div>
        <div className="actionList">
          {actions.map((action) => (
            <button className="actionItem" type="button" onClick={() => setActivePage(action.page)} key={`${action.title}-${action.page}`}>
              <BadgeAlert size={24} strokeWidth={2} />
              <span><b>{action.title}</b><small>{action.text}</small></span>
              <strong>{action.priority}</strong>
            </button>
          ))}
        </div>
      </LiquidGlass>
    </>
  );
}

function AnalyticsPage({ kind, apps, metrics, setActivePage }: { kind: "revenue" | "acquisition" | "subscriptions"; apps: StudioApp[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const { currency, revenue, downloads, subscriptions, inAppPurchases } = analytics;
  const trendKey = kind === "revenue" ? "revenue" : kind === "subscriptions" ? "subscriptions" : "downloads";
  const trend = aggregateTrend(metrics, trendKey);
  const title = kind === "revenue" ? "Revenue trend" : kind === "subscriptions" ? "Subscription trend" : "Acquisition trend";
  const primaryValue = kind === "revenue" ? formatCurrency(revenue, currency) : kind === "subscriptions" ? formatNumber(subscriptions) : formatNumber(downloads);
  const emptyText = apps.length ? "Run Apple sync to populate this page." : "Add an app before this page can show metrics.";

  if (!metrics.length) {
    return <><section className="moduleMatrix"><Module label="Status" title="No synced data" value="Pending" text={emptyText} chartValues={[]} page="integrations" setActivePage={setActivePage} /><Module label="Portfolio" title="Apps configured" value={formatNumber(apps.length)} text="Ready for source setup." chartValues={[apps.length]} page="apps" setActivePage={setActivePage} /><Module label="Quality" title="Synthetic data" value="0" text="Only real source data is shown." chartValues={[]} /></section><EmptyPanel title="Awaiting Apple metrics" text={emptyText} /></>;
  }

  return (
    <>
      <section className="moduleMatrix">
        <Module label="Revenue" title="Net proceeds" value={formatCurrency(revenue, currency)} text={revenueDetail(sumMetric(metrics, "revenueRows"), metrics.find((metric) => metric.revenueRows)?.revenueSource)} chartValues={aggregateTrend(metrics, "revenue")} page="revenue" setActivePage={setActivePage} />
        <Module label="Acquisition" title="Downloads" value={formatNumber(downloads)} text={`${metrics.length} synced apps.`} chartValues={aggregateTrend(metrics, "downloads")} page="acquisition" setActivePage={setActivePage} />
        <Module label="Products" title="Subs + IAP" value={formatNumber(subscriptions + inAppPurchases)} text="Monetized units." chartValues={aggregateTrend(metrics, "subscriptions")} page="subscriptions" setActivePage={setActivePage} />
      </section>
      <TrendPanel title={title} value={primaryValue} detail={`${trendDelta(trend).toFixed(0)}% vs previous split`} points={aggregateTrendPoints(metrics, trendKey)} variant={kind === "revenue" ? "currency" : "number"} currency={currency} />
      {kind === "revenue" || kind === "subscriptions" ? <RevenueBreakdown analytics={analytics} /> : null}
      {kind === "revenue" ? <RevenueMap metrics={metrics} currency={currency} /> : null}
      <AppStoreMetricTable apps={apps} metrics={metrics} />
    </>
  );
}

function MonetizationPage({ apps, metrics, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const products = analytics.subscriptions + analytics.inAppPurchases;
  const revenueRows = analytics.revenueRows;
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Monetization" title="ARPD" value={formatCurrency(analytics.averageRevenuePerDownload, analytics.currency)} text="Revenue per download." chartValues={aggregateTrend(metrics, "revenue")} page="revenue" setActivePage={setActivePage} />
        <Module label="Products" title="Monetized units" value={formatNumber(products)} text={`${analytics.monetizationRate.toFixed(1)}% paid conversion.`} chartValues={aggregateTrend(metrics, "subscriptions")} page="subscriptions" setActivePage={setActivePage} />
        <Module label="Quality" title="Paid rows" value={formatNumber(revenueRows)} text={revenueRows ? "Revenue signals available." : "No paid rows found."} chartValues={aggregateTrend(metrics, "revenue")} page="revenue" setActivePage={setActivePage} />
      </section>
      <RevenueBreakdown analytics={analytics} />
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Monetization readiness</p><h2>Paid model</h2></div><span className="pill">{metrics.length}/{apps.length} apps synced</span></div>
        <div className="revenueChecks">
          <CheckRow label="Financial reports" value={analytics.financeRows ? `${formatNumber(analytics.financeRows)} rows` : "Pending"} ok={analytics.financeRows > 0} />
          <CheckRow label="Paid rows" value={analytics.revenueRows ? `${formatNumber(analytics.revenueRows)} rows` : "None"} ok={analytics.revenueRows > 0} />
          <CheckRow label="Subscription share" value={`${analytics.subscriptionShare.toFixed(0)}%`} ok={analytics.subscriptions > 0} />
          <CheckRow label="Revenue per download" value={formatCurrency(analytics.averageRevenuePerDownload, analytics.currency)} ok={analytics.averageRevenuePerDownload > 0} />
        </div>
      </LiquidGlass>
    </>
  );
}

function PaywallPage({ apps, metrics, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const starts = analytics.subscriptions + analytics.inAppPurchases;
  const paidConversion = analytics.downloads ? (starts / analytics.downloads) * 100 : 0;
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Paywall" title="Paid starts" value={formatNumber(starts)} text="Subscriptions plus IAP." chartValues={aggregateTrend(metrics, "subscriptions")} page="subscriptions" setActivePage={setActivePage} />
        <Module label="Conversion" title="Download to paid" value={`${paidConversion.toFixed(1)}%`} text="Paid starts / downloads." chartValues={[analytics.downloads, starts]} page="monetization" setActivePage={setActivePage} />
        <Module label="Revenue" title="Paywall yield" value={formatCurrency(analytics.averageRevenuePerDownload, analytics.currency)} text="Revenue per download." chartValues={aggregateTrend(metrics, "revenue")} page="revenue" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Paywall</p><h2>Checks</h2></div><span className="pill">{apps.length} apps</span></div>
        <div className="revenueChecks">
          <CheckRow label="Paid products detected" value={starts ? `${formatNumber(starts)} starts` : "Pending"} ok={starts > 0} />
          <CheckRow label="Revenue attached" value={analytics.revenueRows ? "Ready" : "Missing"} ok={analytics.revenueRows > 0} />
          <CheckRow label="Subscription product signal" value={analytics.subscriptions ? `${formatNumber(analytics.subscriptions)} subs` : "None"} ok={analytics.subscriptions > 0} />
          <CheckRow label="IAP product signal" value={analytics.inAppPurchases ? `${formatNumber(analytics.inAppPurchases)} IAP` : "None"} ok={analytics.inAppPurchases > 0} />
        </div>
      </LiquidGlass>
    </>
  );
}

function GeoRevenuePage({ apps, metrics }: { apps: StudioApp[]; metrics: AppStoreMetric[] }) {
  const analytics = revenueAnalytics(metrics);
  const countries = aggregateCountries(metrics);
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Geo Revenue" title="Countries" value={formatNumber(countries.length)} text={`${apps.length} apps configured.`} chartValues={countries.map((country) => country.revenue)} />
        <Module label="Revenue" title="Mapped revenue" value={formatCurrency(countries.reduce((sum, country) => sum + country.revenue, 0), analytics.currency)} text="Country-level split." chartValues={countries.map((country) => country.revenue)} />
        <Module label="Demand" title="Mapped downloads" value={formatNumber(countries.reduce((sum, country) => sum + country.downloads, 0))} text="Downloads by country." chartValues={countries.map((country) => country.downloads)} />
      </section>
      <RevenueMap metrics={metrics} currency={analytics.currency} />
    </>
  );
}

function ProductPage({ apps, metrics, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const downloads = sumMetric(metrics, "downloads");
  const monetizedUnits = sumMetric(metrics, "subscriptions") + sumMetric(metrics, "inAppPurchases");
  const conversion = downloads ? (monetizedUnits / downloads) * 100 : 0;
  return <><section className="moduleMatrix"><Module label="Portfolio" title="Apps live" value={formatNumber(apps.length)} text="Configured apps." chartValues={[apps.length]} page="apps" setActivePage={setActivePage} /><Module label="Activation" title="Paid conversion" value={`${conversion.toFixed(1)}%`} text="Monetized units / downloads." chartValues={[downloads, monetizedUnits]} page="monetization" setActivePage={setActivePage} /><Module label="Revenue" title="Net proceeds" value={formatCurrency(sumMetric(metrics, "revenue"), normalizeCurrency(metrics.find((metric) => metric.currency)?.currency))} text="Apple monetization signal." chartValues={aggregateTrend(metrics, "revenue")} page="revenue" setActivePage={setActivePage} /></section><AppStoreMetricTable apps={apps} metrics={metrics} /></>;
}

function ReleasesPage({ apps, socials, metrics, setActivePage }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const ops = operationsAnalytics(apps, socials, metrics);
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Releases" title="Ready for sale" value={`${ops.readyReleases}/${ops.releases.length || apps.length}`} text="Apple version state." chartValues={[ops.readyReleases, ops.releases.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Sync" title="Apps synced" value={`${ops.syncedAppIds.size}/${apps.length}`} text="Operational coverage." chartValues={[ops.syncedAppIds.size, apps.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Quality" title="Launch score" value={`${ops.qualityScore}%`} text="Readiness composite." chartValues={[ops.qualityScore, 100]} page="quality" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Release Train</p><h2>App Store versions</h2></div><span className="pill">{ops.releases.length} synced</span></div>
        <div className="table"><div className="tableRow tableHead"><span>App</span><span>Version</span><span>Platform</span><span>State</span><span>Versions</span><span>Readiness</span></div>{ops.releases.length ? ops.releases.map((item) => <div className="tableRow sixCols" key={`release-${item.appName}`}><span className="appCell"><b>{item.appName.slice(0, 2).toUpperCase()}</b><strong>{item.appName}</strong><small>{item.bundleId}</small></span><span>{item.release?.latestVersion ?? "Unknown"}</span><span>{item.release?.platform ?? "Unknown"}</span><span>{(item.release?.state ?? item.state) || "Unknown"}</span><span>{formatNumber(item.release?.versionCount ?? 0)}</span><span><b className={item.release?.readyForSale ? "statusOk" : "statusDraft"}>{item.release?.readyForSale ? "Live" : item.release?.editable ? "Editable" : "Review needed"}</b></span></div>) : <div className="tableRow sixCols"><span>No release data</span><span>Sync Apple</span><span>Pending</span><span>Pending</span><span>0</span><span><b className="statusDraft">Waiting</b></span></div>}</div>
      </LiquidGlass>
    </>
  );
}

function QualityPage({ apps, socials, metrics, setActivePage }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const ops = operationsAnalytics(apps, socials, metrics);
  const aso = asoAnalytics(metrics);
  const analytics = revenueAnalytics(metrics);
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Quality" title="Ops score" value={`${ops.qualityScore}%`} text={`${ops.blockedActions} priority blockers.`} chartValues={[ops.qualityScore, 100]} page="tasks" setActivePage={setActivePage} />
        <Module label="ASO" title="Metadata score" value={`${aso.score.toFixed(0)}%`} text={`${aso.locales.length} locales.`} chartValues={aso.snapshots.map((snapshot) => snapshot.metadataScore)} page="aso" setActivePage={setActivePage} />
        <Module label="Revenue" title="Report health" value={analytics.revenueRows ? "Ready" : "Review"} text={revenueDetail(analytics.revenueRows)} chartValues={[analytics.revenueRows, analytics.financeRows]} page="revenue" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Quality Gates</p><h2>Shipping readiness</h2></div><span className="pill">{ops.qualityScore}%</span></div>
        <div className="revenueChecks">
          <CheckRow label="Apps configured" value={`${apps.length}`} ok={apps.length > 0} />
          <CheckRow label="Apple sync coverage" value={`${ops.syncedAppIds.size}/${apps.length}`} ok={apps.length > 0 && ops.syncedAppIds.size === apps.length} />
          <CheckRow label="Live release state" value={`${ops.readyReleases}/${ops.releases.length || apps.length}`} ok={ops.releases.length > 0 && ops.readyReleases === ops.releases.length} />
          <CheckRow label="Priority blockers" value={`${ops.blockedActions}`} ok={ops.blockedActions === 0} />
        </div>
      </LiquidGlass>
    </>
  );
}

function RoadmapPage({ apps, socials, metrics, setActivePage }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const items = roadmapItems(apps, socials, metrics);
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Roadmap" title="Bets ready" value={`${items.filter((item) => item.ready).length}/${items.length}`} text="Evidence-backed priorities." chartValues={items.map((item) => item.ready ? 1 : 0)} />
        <Module label="Portfolio" title="Apps" value={formatNumber(apps.length)} text="Planning surface." chartValues={[apps.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Tasks" title="Execution" value={formatNumber(buildActions(apps, socials, metrics).length)} text="Open operating items." chartValues={[buildActions(apps, socials, metrics).length]} page="tasks" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Roadmap</p><h2>Prioritized bets</h2></div><span className="pill">{items.length} bets</span></div>
        <div className="actionList">{items.map((item) => <button className="actionItem" type="button" onClick={() => setActivePage(item.page)} key={item.title}><Target size={24} strokeWidth={2} /><span><b>{item.title}</b><small>{item.area} · {item.impact}</small></span><strong>{item.ready ? "Ready" : "Needs data"}</strong></button>)}</div>
      </LiquidGlass>
    </>
  );
}

function TasksPage({ apps, socials, metrics, setActivePage }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const ops = operationsAnalytics(apps, socials, metrics);
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Tasks" title="Open items" value={formatNumber(ops.actions.length)} text={`${ops.blockedActions} high priority.`} chartValues={[ops.actions.length, ops.blockedActions]} />
        <Module label="Quality" title="Ops score" value={`${ops.qualityScore}%`} text="Execution health." chartValues={[ops.qualityScore, 100]} page="quality" setActivePage={setActivePage} />
        <Module label="Releases" title="Live releases" value={`${ops.readyReleases}/${ops.releases.length || apps.length}`} text="App Store state." chartValues={[ops.readyReleases, ops.releases.length]} page="releases" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Execution</p><h2>Operational tasks</h2></div><span className="pill">{ops.actions.length} open</span></div>
        <div className="actionList">{ops.actions.map((action) => <button className="actionItem" type="button" onClick={() => setActivePage(action.page)} key={`${action.title}-${action.page}`}><BadgeAlert size={24} strokeWidth={2} /><span><b>{action.title}</b><small>{action.text}</small></span><strong>{action.priority}</strong></button>)}</div>
      </LiquidGlass>
    </>
  );
}

function AsoPage({ apps, metrics, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; setActivePage: (page: PageKey) => void }) {
  const analytics = useMemo(() => asoAnalytics(metrics), [metrics]);
  const metadataRows = useMemo(() => keywordRows(metrics), [metrics]);
  const rankedApps = useMemo(() => apps.length ? apps.slice(0, 8) : metrics.slice(0, 8).map((metric) => ({ id: metric.appId, name: metric.appName, platform: "iOS", bundleId: metric.bundleId, appStoreId: "", keyId: "", issuerId: "", vendorNumber: "", privateKeyName: "", privateKeyPath: "", status: "Ready to sync" as const, createdAt: metric.syncedAt })), [apps, metrics]);
  const [selectedCountry, setSelectedCountry] = useState(localeCountry(analytics.snapshots[0]?.primaryLocale || "fr-FR"));
  const [keywordQuery, setKeywordQuery] = useState(() => metadataRows[0]?.keyword ?? rankedApps[0]?.name ?? "");
  const [manualKeywords, setManualKeywords] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<AsoSearchResult[]>([]);
  const [resultsByKeyword, setResultsByKeyword] = useState<Record<string, AsoSearchResult[]>>({});
  const [selectedKeyword, setSelectedKeyword] = useState(() => metadataRows[0]?.keyword ?? "");
  const [asoLoading, setAsoLoading] = useState(false);
  const [asoError, setAsoError] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [keywordModalOpen, setKeywordModalOpen] = useState(false);
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
  const [rankingModalOpen, setRankingModalOpen] = useState(false);
  const [trendModalOpen, setTrendModalOpen] = useState(false);
  const [draftKeywords, setDraftKeywords] = useState("");
  const manualKeywordsLoadedRef = useRef(false);
  const selectedApp = rankedApps[0];
  const rows = useMemo(() => {
    const manualRows = manualKeywords.map((keyword) => buildAsoKeywordRow(keyword, selectedCountry === "WORLD" ? "US" : selectedCountry, "manual"));
    const manualKeys = new Set(manualRows.map((row) => row.keyword.toLowerCase()));
    return [...manualRows, ...metadataRows.filter((row) => !manualKeys.has(row.keyword.toLowerCase()))].slice(0, 80);
  }, [manualKeywords, metadataRows, selectedCountry]);
  const filteredRows = rows.filter((row) => !selectedCountry || row.store === selectedCountry || selectedCountry === "WORLD");
  const visibleRows = filteredRows.length ? filteredRows : rows;
  const countries = Array.from(new Set(["FR", "US", "GB", "CA", "AU", "DE", "IT", "ES", "BR", "JP", ...rows.map((row) => row.store).filter(Boolean)])).slice(0, 14);
  const countryRows = [{ code: "WORLD", name: "All", count: searchResults.length || rows.length }, ...countries.map((code) => ({ code, name: countryName(code), count: rows.filter((row) => row.store === code).length || (code === "FR" ? Math.max(rows.length, searchResults.length) : 0) }))];
  const suggestions = useMemo(() => {
    const source = searchResults.length ? searchResults : [];
    const keywordSeed = (selectedKeyword || keywordQuery || selectedApp?.name || "app").toLowerCase();
    const base = [
      keywordSeed.replace(/\s+/g, " ").trim(),
      `${keywordSeed} app`,
      `${keywordSeed} tracker`,
      `${keywordSeed} free`,
      `${keywordSeed} pro`,
    ].filter((value, index, array) => value && array.indexOf(value) === index);
    const fromResults = source.slice(0, 8).map((result) => result.name.toLowerCase().split(/[:\-–|]/)[0].trim()).filter(Boolean);
    return Array.from(new Set([...base, ...fromResults])).slice(0, 12).map((keyword, index) => {
      const seed = Array.from(keyword).reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return { keyword, popularity: Math.min(92, 55 + (seed % 38)), difficulty: Math.min(88, 10 + ((seed * 3) % 74)), apps: 180 + index * 17 };
    });
  }, [keywordQuery, searchResults, selectedApp?.name, selectedKeyword]);

  const appleSearchCountry = selectedCountry === "WORLD" ? "US" : selectedCountry;
  const rankingKey = useCallback((keyword: string) => `${appleSearchCountry}:${keyword.trim().toLowerCase()}`, [appleSearchCountry]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(ASO_KEYWORD_STORAGE) || "[]") as unknown;
        manualKeywordsLoadedRef.current = true;
        if (Array.isArray(stored)) setManualKeywords(stored.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0).slice(0, 80));
      } catch {
        manualKeywordsLoadedRef.current = true;
        setManualKeywords([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!manualKeywordsLoadedRef.current) return;
    window.localStorage.setItem(ASO_KEYWORD_STORAGE, JSON.stringify(manualKeywords));
  }, [manualKeywords]);

  const fetchAsoResults = useCallback(async (keyword: string, options: { silent?: boolean } = {}) => {
    const term = keyword.trim();
    if (!term) return [];
    if (!options.silent) {
      setAsoLoading(true);
      setAsoError("");
      setSelectedKeyword(term);
    }
    try {
      const response = await fetch(`/api/apple-search?term=${encodeURIComponent(term)}&country=${encodeURIComponent(appleSearchCountry)}&limit=50`);
      const payload = await response.json() as { ok?: boolean; results?: AsoSearchResult[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Apple Search unavailable.");
      const results = payload.results ?? [];
      setResultsByKeyword((current) => ({ ...current, [rankingKey(term)]: results }));
      if (!options.silent) setSearchResults(results);
      return results;
    } catch (error) {
      if (!options.silent) {
        setAsoError(error instanceof Error ? error.message : "Apple Search unavailable.");
        setSearchResults([]);
      }
      return [];
    } finally {
      if (!options.silent) setAsoLoading(false);
    }
  }, [appleSearchCountry, rankingKey]);

  useEffect(() => {
    const term = keywordQuery || rows[0]?.keyword || selectedApp?.name || "";
    if (!term) return undefined;
    const timer = window.setTimeout(() => {
      void fetchAsoResults(term);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAsoResults, keywordQuery, rows, selectedApp?.name]);

  useEffect(() => {
    const preloadRows = visibleRows.slice(0, 18).filter((row) => !resultsByKeyword[rankingKey(row.keyword)]);
    if (!preloadRows.length) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const row of preloadRows) {
          if (cancelled) return;
          await fetchAsoResults(row.keyword, { silent: true });
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchAsoResults, rankingKey, resultsByKeyword, visibleRows]);

  const addKeywords = useCallback((value: string | string[]) => {
    const nextKeywords = Array.isArray(value) ? value.map((keyword) => keyword.trim().replace(/\s+/g, " ")).filter(Boolean) : parseKeywordInput(value);
    if (!nextKeywords.length) return;
    manualKeywordsLoadedRef.current = true;
    setManualKeywords((current) => {
      const merged = new Map<string, string>();
      for (const keyword of nextKeywords) merged.set(keyword.toLowerCase(), keyword);
      for (const keyword of current) merged.set(keyword.toLowerCase(), keyword);
      return Array.from(merged.values()).slice(0, 80);
    });
    const next = nextKeywords[0];
    setKeywordQuery(next);
    setSelectedKeyword(next);
    setKeywordModalOpen(false);
    void fetchAsoResults(next);
    for (const keyword of nextKeywords.slice(1, 8)) void fetchAsoResults(keyword, { silent: true });
  }, [fetchAsoResults]);

  const addKeyword = () => addKeywords(draftKeywords);

  const inspectKeyword = (keyword: string) => {
    setKeywordQuery(keyword);
    void fetchAsoResults(keyword);
  };

  const openRankedApp = (result: AsoSearchResult) => {
    window.open(`https://apps.apple.com/app/id${result.appId}`, "_blank", "noopener,noreferrer");
  };

  const selectedCountryLabel = selectedCountry === "WORLD" ? "All" : countryName(selectedCountry);

  if (!analytics.snapshots.length && !rows.length) {
    return <><section className="moduleMatrix"><Module label="ASO" title="Metadata" value="Pending" text="Run Apple sync." chartValues={[]} page="apps" setActivePage={setActivePage} /><Module label="Portfolio" title="Apps" value={formatNumber(apps.length)} text="Ready for Apple metadata." chartValues={[apps.length]} page="apps" setActivePage={setActivePage} /><Module label="Keywords" title="Coverage" value="0" text="No keywords synced." chartValues={[]} /></section><EmptyPanel title="No ASO metadata yet" text="Sync an App Store app to pull title, subtitle, keywords, descriptions and localizations." /></>;
  }
  return (
    <section className="asoWorkspace">
      <section className="asoMain">
        <div className="asoCommandBar">
          <button type="button" className={asoLoading ? "asoCircleButton isLoading" : "asoCircleButton"} aria-label="Refresh Apple Search rankings" onClick={() => fetchAsoResults(keywordQuery || selectedKeyword)}>↻</button>
          <button type="button" className="asoFilterButton" onClick={() => inspectKeyword(rows[0]?.keyword ?? selectedApp?.name ?? "")}>Keywords⌄</button>
          <div className="asoPopoverAnchor">
            <button type="button" className="asoStoreButton" onClick={() => setCountryPickerOpen((open) => !open)}>{selectedCountry === "WORLD" ? "🌍" : countryFlag(selectedCountry)} {selectedCountryLabel}</button>
            {countryPickerOpen ? <AsoCountryPicker countries={countryRows} selectedCountry={selectedCountry} onSelect={(country) => { setSelectedCountry(country); setCountryPickerOpen(false); }} /> : null}
          </div>
          <span />
          <button type="button" className="asoPrimaryButton" onClick={() => { setDraftKeywords(keywordQuery); setKeywordModalOpen(true); }}>Add Keywords <span>+</span></button>
          <button type="button" className="asoSuggestionButton" onClick={() => setSuggestionModalOpen(true)}>{Math.max(2, Math.min(9, suggestions.length))} Suggestions</button>
          <button type="button" className="asoIconButton" aria-label="Open app setup" onClick={() => setActivePage("apps")}>⌑</button>
          <button type="button" className="asoFilterButton" onClick={() => fetchAsoResults(keywordQuery || selectedKeyword)}>Last 7 days⌄</button>
          <button type="button" className="asoIconButton" aria-label="More">•••</button>
          <form className="asoSearchForm" onSubmit={(event) => { event.preventDefault(); void fetchAsoResults(keywordQuery); }}>
            <input className="asoSearch" value={keywordQuery} onChange={(event) => setKeywordQuery(event.target.value)} placeholder="Search keyword" aria-label="Search ASO keywords" />
          </form>
        </div>
        <div className="asoTable">
          <div className="asoRow asoHead"><span>Keyword</span><span>Notes</span><span>Last update</span><span>Store</span><span>Popularity</span><span>Difficulty</span><span>Trend</span><span>Position</span><span>Apps in Ranking</span></div>
          {visibleRows.map((row) => {
            const rowResults = resultsByKeyword[rankingKey(row.keyword)] ?? [];
            const matchingApp = selectedApp?.appStoreId ? rowResults.find((result) => result.appId === selectedApp.appStoreId) : undefined;
            const position = matchingApp?.rank ?? "-";
            return (
              <div className={selectedKeyword === row.keyword ? "asoRow isSelected" : "asoRow"} role="button" tabIndex={0} onClick={() => inspectKeyword(row.keyword)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inspectKeyword(row.keyword); }} key={`${row.keyword}-${row.store}`} aria-label={`Inspect keyword ${row.keyword}`}>
                <strong>{row.keyword}</strong>
                <span>{row.source === "manual" ? "Manual" : ""}</span>
                <span>{rowResults.length ? "Now" : "Loading"}</span>
                <span>{countryFlag(selectedCountry === "WORLD" ? row.store : selectedCountry)} {selectedCountry === "WORLD" ? countryName(row.store) : selectedCountryLabel}</span>
                <span className={row.popularity < 18 ? "scoreBar low" : "scoreBar"}><em>{row.popularity}</em><i><b style={{ width: `${row.popularity}%` }} /></i></span>
                <span className={row.difficulty > 68 ? "scoreBar hard" : row.difficulty < 18 ? "scoreBar easy" : "scoreBar"}><em>{row.difficulty}</em><i><b style={{ width: `${row.difficulty}%` }} /></i></span>
                <button type="button" className={row.trend > 0 ? "asoTrend up" : row.trend < 0 ? "asoTrend down" : "asoTrend flat"} onClick={(event) => { event.stopPropagation(); setSelectedKeyword(row.keyword); setTrendModalOpen(true); }}><em>{row.trend > 0 ? `+${row.trend * 9}` : row.trend < 0 ? row.trend * 9 : "±0"}</em><AsoSparkline trend={row.trend} /></button>
                <span className="asoPosition">{position === 1 ? "🥇 1" : `# ${position}`}</span>
                <span className="rankingApps">{rowResults.length ? rowResults.slice(0, 12).map((result, appIndex) => <button type="button" className={`appBadge tone${appIndex % 6}`} title={`${result.rank}. ${result.name}`} onClick={(event) => { event.stopPropagation(); setSelectedKeyword(row.keyword); setSearchResults(rowResults); setRankingModalOpen(true); }} key={`${row.keyword}-${result.appId}-${appIndex}`}>{result.artworkUrl ? <span className="appBadgeImage" style={{ backgroundImage: `url(${result.artworkUrl})` }} aria-hidden="true" /> : result.name.slice(0, 2).toUpperCase()}</button>) : <small className="asoRankingLoading">Apple Search</small>}</span>
              </div>
            );
          })}
        </div>
      </section>
      {keywordModalOpen ? <AsoKeywordModal draftKeywords={draftKeywords} suggestions={suggestions} setDraftKeywords={setDraftKeywords} addKeyword={addKeyword} onClose={() => setKeywordModalOpen(false)} /> : null}
      {suggestionModalOpen ? <AsoSuggestionModal appName={selectedApp?.name ?? "App"} country={selectedCountryLabel} suggestions={suggestions} onPick={(keyword) => { addKeywords([keyword]); setSuggestionModalOpen(false); }} onClose={() => setSuggestionModalOpen(false)} /> : null}
      {rankingModalOpen ? <AsoRankingModal keyword={selectedKeyword || keywordQuery} country={selectedCountryLabel} results={searchResults} openRankedApp={openRankedApp} onClose={() => setRankingModalOpen(false)} /> : null}
      {trendModalOpen ? <AsoTrendModal keyword={selectedKeyword || keywordQuery} onClose={() => setTrendModalOpen(false)} /> : null}
      {asoError ? <button className="asoToast" type="button" onClick={() => fetchAsoResults(keywordQuery || selectedKeyword)}>{asoError}</button> : null}
    </section>
  );
}

function AsoSparkline({ trend }: { trend: number }) {
  const positive = trend > 0;
  const negative = trend < 0;
  const path = positive ? "M2 22 C16 16 28 24 42 12 C58 0 76 10 94 6" : negative ? "M2 8 C18 18 30 24 46 20 C62 16 74 8 94 12" : "M2 15 H94";
  return <svg className="asoSparkline" viewBox="0 0 96 30" aria-hidden="true"><path d={path} /></svg>;
}

function AsoCountryPicker({ countries, selectedCountry, onSelect }: { countries: { code: string; count: number; name: string }[]; selectedCountry: string; onSelect: (country: string) => void }) {
  return (
    <div className="asoCountryPicker">
      <div className="asoPickerSearch"><input autoFocus placeholder="Search a Store" readOnly /><span>◎</span></div>
      <div className="asoCountryList">
        {countries.map((country) => (
          <button className={selectedCountry === country.code ? "isSelected" : ""} type="button" onClick={() => onSelect(country.code)} key={country.code}>
            <span>{country.code === "WORLD" ? "🌍" : countryFlag(country.code)} {country.name}<small>ⓘ</small></span>
            <strong>{country.count}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function AsoKeywordModal({ draftKeywords, suggestions, setDraftKeywords, addKeyword, onClose }: { draftKeywords: string; suggestions: { apps: number; difficulty: number; keyword: string; popularity: number }[]; setDraftKeywords: (value: string) => void; addKeyword: () => void; onClose: () => void }) {
  return (
    <AsoModal className="asoKeywordDialog" onClose={onClose}>
      <div className="asoModalSearchRow">
        <input autoFocus value={draftKeywords} onChange={(event) => setDraftKeywords(event.target.value)} placeholder="Enter one or more keywords, separated by commas" />
        <button type="button" onClick={addKeyword}>Add</button>
      </div>
      <div className="asoModalHeaderLine"><span>Most searched keywords in FR store</span><select aria-label="Category"><option>Health & Fitness</option><option>Productivity</option><option>Lifestyle</option></select></div>
      <div className="asoSuggestionTable compact">
        <div className="asoSuggestionHead"><span>Keyword</span><span>Popularity</span><span /></div>
        {suggestions.slice(0, 10).map((item) => (
          <button type="button" onClick={() => setDraftKeywords(item.keyword)} key={`keyword-modal-${item.keyword}`}>
            <strong>{item.keyword}</strong>
            <span className="scoreBar easy"><em>{item.popularity}</em><i><b style={{ width: `${item.popularity}%` }} /></i></span>
            <b>⊕</b>
          </button>
        ))}
      </div>
      <div className="asoModalFooter"><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={addKeyword}>Done</button></div>
    </AsoModal>
  );
}

function AsoSuggestionModal({ appName, country, suggestions, onPick, onClose }: { appName: string; country: string; suggestions: { apps: number; difficulty: number; keyword: string; popularity: number }[]; onPick: (keyword: string) => void; onClose: () => void }) {
  return (
    <AsoModal className="asoSuggestionDialog" onClose={onClose}>
      <div className="asoDialogTitle"><div><h2>Keyword Suggestions</h2><p>{appName} · {country} ⓘ</p></div><div className="asoDialogTools"><button type="button">◉</button><button type="button">☰</button><input placeholder="Search for Suggestion" readOnly /></div></div>
      <div className="asoSuggestionTable">
        <div className="asoSuggestionHead"><span>Select</span><span>Suggestion</span><span>Popularity</span><span>Difficulty</span><span>Apps Count</span></div>
        {suggestions.map((item) => (
          <button type="button" onClick={() => onPick(item.keyword)} key={`suggestion-${item.keyword}`}>
            <span className="asoCheck" />
            <strong>{item.keyword}</strong>
            <span className={item.popularity < 25 ? "scoreBar low" : "scoreBar easy"}><em>{item.popularity}</em><i><b style={{ width: `${item.popularity}%` }} /></i></span>
            <span className={item.difficulty > 60 ? "scoreBar hard" : "scoreBar easy"}><em>{item.difficulty}</em><i><b style={{ width: `${item.difficulty}%` }} /></i></span>
            <span>{item.apps}</span>
          </button>
        ))}
      </div>
      <div className="asoModalFooter"><span>0 / {suggestions.length} selected</span><button type="button">Select Top 2</button><button type="button" onClick={onClose}>Done</button><button type="button" onClick={() => suggestions[0] && onPick(suggestions[0].keyword)}>Add Selected</button></div>
    </AsoModal>
  );
}

function AsoRankingModal({ keyword, country, results, openRankedApp, onClose }: { keyword: string; country: string; results: AsoSearchResult[]; openRankedApp: (result: AsoSearchResult) => void; onClose: () => void }) {
  return (
    <AsoModal className="asoRankingDialog" onClose={onClose}>
      <div className="asoRankingList">
        {results.slice(0, 9).map((result) => (
          <button type="button" onClick={() => openRankedApp(result)} key={`ranking-modal-${result.appId}`}>
            <span className="asoRankIcon" style={{ backgroundImage: result.artworkUrl ? `url(${result.artworkUrl})` : undefined }}>{result.artworkUrl ? "" : result.name.slice(0, 2).toUpperCase()}</span>
            <span><strong><b>{result.rank}</b> {highlightKeyword(result.name, keyword)}</strong><small>{result.artistName || result.bundleId}</small><em>Rating count: {formatNumber(result.ratingCount)} · Average Rating: {result.rating.toFixed(1)}</em></span>
            <i>⊙ ⊕ ⋯</i>
          </button>
        ))}
      </div>
      <div className="asoRankingFooter"><span>Keyword: {keyword}</span><select aria-label="Language"><option>{country === "France" ? "French" : "English"}</option></select><button type="button" onClick={onClose}>Done</button></div>
    </AsoModal>
  );
}

function AsoTrendModal({ keyword, onClose }: { keyword: string; onClose: () => void }) {
  const points = [102, 238, 110, 93];
  const path = "M390 108 L432 268 L488 126 L550 96";
  return (
    <AsoModal className="asoTrendDialog" onClose={onClose}>
      <h2>Data since &quot;{keyword}&quot; was added</h2>
      <p>Keyword ranking is updated every 24 hours when the app is open.</p>
      <label>Time Frame <select><option>Last 7 days</option><option>Last 30 days</option></select></label>
      <svg className="asoLargeTrend" viewBox="0 0 640 300" role="img">
        <title>{keyword} ranking trend</title>
        {[50, 100, 150, 200].map((line, index) => <g key={`trend-grid-${line}`}><line x1="20" x2="620" y1={line + 20} y2={line + 20} /><text x="625" y={line + 25}>{(index + 1) * 50}</text></g>)}
        <path className="area" d={`${path} L550 270 L390 270 Z`} />
        <path className="line" d={path} />
        {points.map((point, index) => <circle cx={390 + index * 54} cy={point} r="5" key={`trend-point-${point}-${index}`} />)}
        <text x="210" y="282">18 Aug</text><text x="390" y="282">20 Aug</text><text x="560" y="282">22 Aug</text>
      </svg>
      <div className="asoModalFooter"><button type="button">⇧ Share</button><button type="button" onClick={onClose}>Done</button></div>
    </AsoModal>
  );
}

function AsoModal({ children, className, onClose }: { children: ReactNode; className: string; onClose: () => void }) {
  return <div className="asoModalLayer"><button className="asoModalBackdrop" type="button" onClick={onClose} aria-label="Close ASO modal" /><div className={`asoModal ${className}`}>{children}</div></div>;
}

function highlightKeyword(text: string, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return text;
  const index = text.toLowerCase().indexOf(normalized);
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + normalized.length)}</mark>{text.slice(index + normalized.length)}</>;
}

function CampaignsPage({ apps, metrics, socials, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; socials: SocialAccount[]; setActivePage: (page: PageKey) => void }) {
  const analytics = marketingAnalytics(metrics, socials);
  const appCount = new Set(metrics.map((metric) => metric.appId)).size;
  return (
    <>
      <section className="moduleMatrix">
        <Module label="Campaigns" title="Spend" value={analytics.spend ? formatCurrency(analytics.spend, analytics.currency) : "Pending"} text={analytics.spend ? "Synced marketing cost." : "Connect ad spend source."} chartValues={metrics.map((metric) => metric.expenses ?? 0)} page="integrations" setActivePage={setActivePage} />
        <Module label="Return" title="ROAS" value={analytics.roas ? `${analytics.roas.toFixed(1)}x` : "Pending"} text={analytics.revenue ? "Revenue / spend." : "Needs revenue."} chartValues={[analytics.spend, analytics.revenue]} page="revenue" setActivePage={setActivePage} />
        <Module label="Efficiency" title="CPI" value={analytics.cpi ? formatCurrency(analytics.cpi, analytics.currency) : "Pending"} text={analytics.downloads ? "Cost per download." : "Needs downloads."} chartValues={[analytics.downloads, analytics.spend]} page="acquisition" setActivePage={setActivePage} />
      </section>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Campaign Readiness</p><h2>Marketing operating checks</h2></div><span className="pill">{appCount}/{apps.length} apps synced</span></div>
        <div className="revenueChecks">
          <CheckRow label="Apple installs" value={analytics.downloads ? formatNumber(analytics.downloads) : "Pending"} ok={analytics.downloads > 0} />
          <CheckRow label="Revenue signal" value={analytics.revenue ? formatCurrency(analytics.revenue, analytics.currency) : "Pending"} ok={analytics.revenue > 0} />
          <CheckRow label="Spend source" value={analytics.spend ? formatCurrency(analytics.spend, analytics.currency) : "Pending"} ok={analytics.spend > 0} />
          <CheckRow label="Social proof" value={analytics.socialViews ? `${formatNumber(analytics.socialViews)} views` : "Pending"} ok={analytics.socialViews > 0} />
        </div>
      </LiquidGlass>
      <LiquidGlass className="panel dataPanel">
        <div className="panelHeader"><div><p className="caption">Channels</p><h2>Campaign signals</h2></div><span className="pill">{analytics.socialPosts} posts</span></div>
        <div className="table"><div className="tableRow tableHead"><span>Channel</span><span>Mapped apps</span><span>Views</span><span>Engagement</span><span>Spend</span><span>Next move</span></div><div className="tableRow sixCols"><span>Apple Search / Store</span><span>{formatNumber(appCount)}</span><span>{formatNumber(analytics.downloads)} downloads</span><span>ASO-driven</span><span>{analytics.spend ? formatCurrency(analytics.spend, analytics.currency) : "Pending"}</span><span><b className="statusOk">Prioritize ASO + paid tests</b></span></div><div className="tableRow sixCols"><span>Social creators</span><span>{formatNumber(new Set(socials.map((social) => social.appId)).size)}</span><span>{formatNumber(analytics.socialViews)}</span><span>{analytics.engagement ? `${analytics.engagement.toFixed(1)}%` : "Pending"}</span><span>Organic</span><span><b className={analytics.socialViews ? "statusOk" : "statusDraft"}>{analytics.socialViews ? "Scale winning hooks" : "Map handles first"}</b></span></div></div>
      </LiquidGlass>
    </>
  );
}

function CreativePage({ apps, socials, setSocials, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; setSocials: React.Dispatch<React.SetStateAction<SocialAccount[]>>; isFiltered?: boolean }) {
  const views = socials.reduce((sum, social) => sum + (social.avgViews ?? 0) * (social.posts ?? 0), 0);
  const posts = socials.reduce((sum, social) => sum + (social.posts ?? 0), 0);
  const engagement = socials.length ? socials.reduce((sum, social) => sum + (social.engagementRate ?? 0), 0) / socials.length : 0;
  return <><section className="moduleMatrix"><Module label="Creative" title="Views" value={views ? formatNumber(views) : "Pending"} text={`${posts} posts tracked.`} chartValues={socials.map((social) => (social.avgViews ?? 0) * (social.posts ?? 0))} /><Module label="Coverage" title="Mapped apps" value={formatNumber(new Set(socials.map((social) => social.appId)).size)} text={`${apps.length} apps configured.`} chartValues={[new Set(socials.map((social) => social.appId)).size, apps.length]} /><Module label="Engagement" title="Avg rate" value={engagement ? `${engagement.toFixed(1)}%` : "Pending"} text="Public social signal." chartValues={socials.map((social) => social.engagementRate ?? 0)} /></section><SocialTable apps={apps} socials={socials} setSocials={setSocials} isFiltered={isFiltered} /></>;
}

function TrendPanel({ title, value, detail, points, variant, currency }: { title: string; value: string; detail: string; points: TrendPoint[]; variant: "currency" | "number"; currency: string }) {
  const safePoints = points.length ? points : Array.from({ length: 7 }, (_, index) => ({ label: `Point ${index + 1}`, value: 0 }));
  const safeValues = safePoints.map((point) => point.value);
  const max = Math.max(...safeValues.map((point) => Math.abs(point)), 1);
  const svgPoints = safeValues.map((point, index) => {
    const x = safeValues.length === 1 ? 540 : 42 + (index * 1016) / (safeValues.length - 1);
    const y = 282 - ((point / max) * 210);
    return [x, Math.max(34, Math.min(308, y))];
  });
  const path = svgPoints.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${path} L 1058 326 L 42 326 Z`;
  return (
    <LiquidGlass className="panel trendPanel">
      <div className="panelHeader"><div><p className="caption">Trend</p><h2>{title}</h2></div><span className="pill">{value}</span></div>
      <button className="chartButton" type="button" aria-label={`Inspect ${title}`}>
        <svg viewBox="0 0 1100 360" role="img">
          <title>{title}</title>
          <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ff6b1a" stopOpacity="0.38" /><stop offset="100%" stopColor="#ff6b1a" stopOpacity="0" /></linearGradient></defs>
          {[72, 136, 200, 264, 328].map((y) => <line className="gridLine" x1="42" x2="1058" y1={y} y2={y} key={y} />)}
          <path className="areaPath" d={area} />
          <path className="orangeLine" d={path} />
          {svgPoints.map(([x, y], index) => <g className="chartPoint" key={`${x}-${index}`}><circle cx={x} cy={y} r="7" /><circle className="chartHit" cx={x} cy={y} r="22" /><title>{`${safePoints[index].label}: ${variant === "currency" ? formatCurrency(safePoints[index].value, currency) : formatNumber(safePoints[index].value)}`}</title></g>)}
        </svg>
      </button>
      <div className="trendFooter"><span>{detail}</span><strong>{variant === "currency" ? formatCurrency(safeValues.at(-1) ?? 0, currency) : formatNumber(safeValues.at(-1) ?? 0)} latest point</strong></div>
    </LiquidGlass>
  );
}

function RevenueBreakdown({ analytics }: { analytics: ReturnType<typeof revenueAnalytics> }) {
  const totalProducts = Math.max(analytics.subscriptions + analytics.inAppPurchases, 1);
  const rows = [
    { label: "Subscriptions", value: analytics.subscriptions, percent: (analytics.subscriptions / totalProducts) * 100 },
    { label: "In-app purchases", value: analytics.inAppPurchases, percent: (analytics.inAppPurchases / totalProducts) * 100 },
    { label: "Downloads to paid", value: analytics.monetizedUnits, percent: Math.min(100, analytics.monetizationRate) },
  ];
  return (
    <LiquidGlass className="panel dataPanel">
      <div className="panelHeader"><div><p className="caption">Monetization</p><h2>Revenue mix</h2></div><span className="pill">{formatCurrency(analytics.averageRevenuePerDownload, analytics.currency)} ARPD</span></div>
      <div className="mixGrid">
        {rows.map((row) => (
          <div className="mixRow" key={row.label}>
            <span><strong>{row.label}</strong><em>{formatNumber(row.value)}</em></span>
            <i><b style={{ width: `${Math.max(4, row.percent)}%` }} /></i>
          </div>
        ))}
      </div>
    </LiquidGlass>
  );
}

function CheckRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="checkRow"><span>{label}</span><strong className={ok ? "statusOk" : "statusDraft"}>{value}</strong></div>;
}

const MAP_WIDTH = 1100;
const MAP_HEIGHT = 620;

const countryPositions: Record<string, { name: string; lon: number; lat: number }> = {
  US: { name: "United States", lon: -98, lat: 39 },
  CA: { name: "Canada", lon: -106, lat: 57 },
  MX: { name: "Mexico", lon: -102, lat: 23 },
  BR: { name: "Brazil", lon: -52, lat: -10 },
  AR: { name: "Argentina", lon: -64, lat: -34 },
  GB: { name: "United Kingdom", lon: -2, lat: 54 },
  IE: { name: "Ireland", lon: -8, lat: 53 },
  FR: { name: "France", lon: 2, lat: 46 },
  ES: { name: "Spain", lon: -4, lat: 40 },
  PT: { name: "Portugal", lon: -8, lat: 39 },
  DE: { name: "Germany", lon: 10, lat: 51 },
  IT: { name: "Italy", lon: 12, lat: 43 },
  NL: { name: "Netherlands", lon: 5, lat: 52 },
  BE: { name: "Belgium", lon: 4, lat: 51 },
  CH: { name: "Switzerland", lon: 8, lat: 47 },
  SE: { name: "Sweden", lon: 15, lat: 62 },
  NO: { name: "Norway", lon: 8, lat: 61 },
  DK: { name: "Denmark", lon: 10, lat: 56 },
  PL: { name: "Poland", lon: 19, lat: 52 },
  TR: { name: "Turkey", lon: 35, lat: 39 },
  RU: { name: "Russia", lon: 90, lat: 60 },
  MA: { name: "Morocco", lon: -6, lat: 32 },
  DZ: { name: "Algeria", lon: 2, lat: 28 },
  ZA: { name: "South Africa", lon: 24, lat: -29 },
  NG: { name: "Nigeria", lon: 8, lat: 9 },
  EG: { name: "Egypt", lon: 30, lat: 27 },
  SA: { name: "Saudi Arabia", lon: 45, lat: 24 },
  AE: { name: "United Arab Emirates", lon: 54, lat: 24 },
  IN: { name: "India", lon: 78, lat: 22 },
  CN: { name: "China", lon: 104, lat: 35 },
  JP: { name: "Japan", lon: 138, lat: 37 },
  KR: { name: "South Korea", lon: 128, lat: 36 },
  ID: { name: "Indonesia", lon: 118, lat: -2 },
  AU: { name: "Australia", lon: 134, lat: -25 },
  NZ: { name: "New Zealand", lon: 172, lat: -42 },
};

function RevenueMap({ metrics, currency }: { metrics: AppStoreMetric[]; currency: string }) {
  const { countries: mapCountries, status: mapStatus } = useWorldAtlas();
  const countries = aggregateCountries(metrics);
  const plotted = countries.filter((country) => countryPositions[country.country]);
  const maxRevenue = Math.max(...plotted.map((country) => Math.abs(country.revenue)), 0);
  const maxDownloads = Math.max(...plotted.map((country) => country.downloads), 1);
  const totalRevenue = sumMetric(metrics, "revenue");
  const mappedRevenue = countries.reduce((sum, country) => sum + country.revenue, 0);
  const consolidatedRevenue = Math.max(0, totalRevenue - mappedRevenue);
  const topCountries = countries.slice(0, 6);

  return (
    <LiquidGlass className="panel revenueMapPanel">
      <div className="panelHeader">
        <h2>Revenue by country</h2>
      </div>
      <div className="mapGrid">
        <button className="worldMap" type="button" aria-label="Inspect revenue world map">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" preserveAspectRatio="xMidYMid meet">
            <title>Revenue by country</title>
            {mapCountries.length ? mapCountries.map((country) => <path className="landMass" d={country.path} key={country.id} />) : <text className="mapLoading" x={MAP_WIDTH / 2} y={MAP_HEIGHT / 2} textAnchor="middle">{mapStatus}</text>}
            {plotted.map((country) => {
              const meta = countryPositions[country.country];
              const position = projectMapPoint(meta.lon, meta.lat);
              const size = 10 + ((maxRevenue ? Math.abs(country.revenue) / maxRevenue : country.downloads / maxDownloads) * 24);
              return (
                <g className="mapPoint" key={country.country}>
                  <circle cx={position.x} cy={position.y} r={size} />
                  <text x={position.x + size + 7} y={position.y + 5}>{countryFlag(country.country)}</text>
                  <title>{`${meta.name}: ${formatCurrency(country.revenue, currency)} revenue, ${formatNumber(country.downloads)} downloads`}</title>
                </g>
              );
            })}
          </svg>
        </button>
        <div className="countryList">
          {topCountries.length ? topCountries.map((country) => {
            const name = countryPositions[country.country]?.name ?? country.country;
            return <div className="countryRow" key={country.country}><span><b>{countryFlag(country.country)}</b><strong>{name}</strong></span><em>{formatCurrency(country.revenue, currency)}</em><small>{formatNumber(country.downloads)} downloads</small></div>;
          }) : <div className="countryRow emptyCountry"><span><b>·</b><strong>No country split yet</strong></span><small>Sync Apple reports to populate geographic data.</small></div>}
          {consolidatedRevenue > 0 ? <div className="countryRow"><span><b>∑</b><strong>Consolidated financials</strong></span><em>{formatCurrency(consolidatedRevenue, currency)}</em><small>Apple financial revenue without country split.</small></div> : null}
        </div>
      </div>
    </LiquidGlass>
  );
}

function useWorldAtlas() {
  const [countries, setCountries] = useState<MapCountry[]>([]);
  const [status, setStatus] = useState("Loading world map");

  useEffect(() => {
    let cancelled = false;
    fetch(WORLD_ATLAS_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Map unavailable");
        return response.json() as Promise<WorldTopology>;
      })
      .then((topology) => {
        if (!cancelled) setCountries(decodeWorldTopology(topology));
      })
      .catch(() => {
        if (!cancelled) setStatus("World map unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, status };
}

function decodeWorldTopology(topology: WorldTopology) {
  const arcs = topology.arcs.map((arc) => decodeArc(arc, topology.transform));
  return topology.objects.countries.geometries.map((geometry, index) => ({
    id: `${geometry.id ?? index}`,
    name: geometry.properties?.name ?? `${geometry.id ?? index}`,
    path: geometryToPath(geometry, arcs),
  })).filter((country) => country.path);
}

function decodeArc(arc: number[][], transform?: WorldTopology["transform"]) {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    const lon = transform ? x * transform.scale[0] + transform.translate[0] : x;
    const lat = transform ? y * transform.scale[1] + transform.translate[1] : y;
    return [lon, lat] as [number, number];
  });
}

function geometryToPath(geometry: WorldGeometry, arcs: [number, number][][]) {
  const polygons = geometry.type === "Polygon" ? [geometry.arcs as number[][]] : geometry.arcs as number[][][];
  return polygons.map((polygon) => polygon.map((ring) => ringToPath(ring, arcs)).join(" ")).join(" ");
}

function ringToPath(ring: number[], arcs: [number, number][][]) {
  const coordinates = ring.flatMap((arcIndex, index) => {
    const arc = arcIndex >= 0 ? arcs[arcIndex] : [...arcs[~arcIndex]].reverse();
    return index ? arc.slice(1) : arc;
  });
  if (!coordinates.length) return "";
  const segments: string[] = [];
  let current = "";
  let previous: { lon: number; x: number; y: number } | null = null;
  for (const [lon, lat] of coordinates) {
    const { x, y } = projectMapPoint(lon, lat);
    const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
    const longitudeJump = previous ? Math.abs(lon - previous.lon) : 0;
    const shouldBreak = !previous || distance > 140 || longitudeJump > 30;
    if (shouldBreak) {
      if (current) segments.push(`${current} Z`);
      current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    } else {
      current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    previous = { lon, x, y };
  }
  if (current) segments.push(`${current} Z`);
  return segments.join(" ");
}

function projectMapPoint(lon: number, lat: number) {
  const radians = Math.PI / 180;
  const lambda = lon * radians;
  const phi = Math.max(-86, Math.min(86, lat)) * radians;
  const theta = Math.asin((Math.sqrt(3) / 2) * Math.sin(phi));
  const theta2 = theta * theta;
  const theta6 = theta2 * theta2 * theta2;
  const a1 = 1.340264;
  const a2 = -0.081106;
  const a3 = 0.000893;
  const a4 = 0.003796;
  const denominator = 3 * (9 * a4 * theta6 * theta2 + 7 * a3 * theta6 + 3 * a2 * theta2 + a1);
  const projectedX = (2 * Math.sqrt(3) * lambda * Math.cos(theta)) / denominator;
  const projectedY = a4 * theta6 * theta2 * theta + a3 * theta6 * theta + a2 * theta2 * theta + a1 * theta;
  const scale = 222;
  return {
    x: MAP_WIDTH / 2 + projectedX * scale,
    y: MAP_HEIGHT / 2 - projectedY * scale,
  };
}

function AppTable({ apps, socials, metrics, setApps, setSocials, syncAppStore, syncingAppId, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; setApps: React.Dispatch<React.SetStateAction<StudioApp[]>>; setSocials: React.Dispatch<React.SetStateAction<SocialAccount[]>>; syncAppStore: (app: StudioApp) => void; syncingAppId: string; isFiltered?: boolean }) {
  if (!apps.length) return <EmptyPanel title={isFiltered ? "No app matches this search" : "No apps yet"} text={isFiltered ? "Clear the search or try another app name, platform, bundle ID or sync status." : "Add your first app with App Store Connect credentials before metrics can sync."} />;
  return <LiquidGlass className="panel dataPanel"><div className="panelHeader"><div><p className="caption">Apps</p><h2>Configured portfolio</h2></div><span className="pill">{apps.length} apps</span></div><div className="table"><div className="tableRow tableHead"><span>App</span><span>Credentials</span><span>Apple setup</span><span>Real KPIs</span><span>Sync</span><span>Manage</span></div>{apps.map((app) => {
    const metric = metrics.find((item) => item.appId === app.id);
    const missing = [
      !app.keyId ? "Key ID" : "",
      !app.issuerId ? "Issuer ID" : "",
      !app.vendorNumber ? "Vendor Number" : "",
      !app.appStoreId ? "App Store ID" : "",
      !(app.privateKeyPath || app.privateKeyName) ? ".p8" : "",
    ].filter(Boolean);
    return <div className="tableRow sixCols" key={app.id}><span className="appCell"><b>{app.name.slice(0, 2).toUpperCase()}</b><strong>{app.name}</strong><small>{app.bundleId || "Bundle pending"}</small></span><span><b className={app.status === "Ready to sync" ? "statusOk" : "statusDraft"}>{app.status}</b><small>{missing.length ? `Missing ${missing.join(", ")}` : app.privateKeyPath || app.privateKeyName}</small></span><span><strong>{app.appStoreId || "Missing"}</strong><small>{app.vendorNumber ? `Vendor ${app.vendorNumber}` : "Vendor Number missing"}</small></span><span><strong>{metric ? formatCurrency(metric.revenue, metric.currency) : "Not synced"}</strong><small>{metric ? `${formatNumber(metric.downloads)} downloads · ${metric.release?.latestVersion ?? "release pending"} · ASO ${metric.aso?.metadataScore ?? 0}%` : `${socials.filter((social) => social.appId === app.id).length} handles mapped`}</small></span><span><button className="ghostButton" type="button" disabled={Boolean(syncingAppId) || missing.length > 0} onClick={() => syncAppStore(app)}>{syncingAppId === app.id ? "Syncing..." : "Sync Apple"}</button></span><span><button className="ghostButton" type="button" onClick={() => { setApps((rows) => rows.filter((row) => row.id !== app.id)); setSocials((rows) => rows.filter((row) => row.appId !== app.id)); }}>Remove</button></span></div>;
  })}</div></LiquidGlass>;
}

function AppStoreMetricTable({ apps, metrics }: { apps: StudioApp[]; metrics: AppStoreMetric[] }) {
  return <LiquidGlass className="panel dataPanel"><div className="panelHeader"><div><p className="caption">Apple reports</p><h2>Synced App Store KPIs</h2></div><span className="pill">{metrics.length} synced</span></div><div className="table"><div className="tableRow tableHead"><span>App</span><span>Period</span><span>Revenue</span><span>Downloads</span><span>Store</span><span>Status</span></div>{metrics.map((metric) => <div className="tableRow sixCols" key={metric.appId}><span className="appCell"><b>{(metric.appName || apps.find((app) => app.id === metric.appId)?.name || "AP").slice(0, 2).toUpperCase()}</b><strong>{metric.appName || apps.find((app) => app.id === metric.appId)?.name || "App"}</strong><small>{metric.bundleId || metric.sku || "Apple metadata synced"}</small></span><span>{metric.reportStartDate && metric.reportEndDate ? `${metric.reportStartDate} → ${metric.reportEndDate}` : "No report date"}</span><span>{formatCurrency(metric.revenue, metric.currency)}</span><span>{formatNumber(metric.downloads)}</span><span>{metric.release?.latestVersion ?? "No version"} · ASO {metric.aso?.metadataScore ?? 0}%</span><span><b className={metric.status === "synced" ? "statusOk" : "statusDraft"}>{metric.message} · {revenueDetail(metric.revenueRows, metric.revenueSource)}</b></span></div>)}</div></LiquidGlass>;
}

function InlineError({ text }: { text: string }) {
  return <LiquidGlass className="panel inlineError" role="alert"><strong>Sync issue</strong><span>{text}</span></LiquidGlass>;
}

function SocialTable({ apps, socials, setSocials, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; setSocials: React.Dispatch<React.SetStateAction<SocialAccount[]>>; isFiltered?: boolean }) {
  if (!socials.length) return <EmptyPanel title={isFiltered ? "No handle matches this search" : "No social handles yet"} text={isFiltered ? "Clear the search or try another handle, platform or mapped app." : "Add a TikTok, Instagram or YouTube handle and map it to an app."} />;
  return <LiquidGlass className="panel dataPanel"><div className="panelHeader"><div><p className="caption">Social accounts</p><h2>Public handles</h2></div><span className="pill">{socials.length} handles</span></div><div className="table socialTable"><div className="tableRow tableHead"><span>Handle</span><span>Platform</span><span>Mapped app</span><span>Status</span><span>Metrics</span><span>Manage</span></div>{socials.map((social) => <div className="tableRow sixCols" key={social.id}><span className="handleCell">{social.handle}</span><span>{social.platform}</span><span>{apps.find((app) => app.id === social.appId)?.name ?? "Unmapped"}</span><span><b className="statusOk">{social.isDemo ? "Demo tracked" : social.status}</b></span><span>{social.followers ? `${formatNumber(social.followers)} followers · ${formatNumber(social.avgViews ?? 0)} avg views` : "Waiting for sync"}</span><span><button className="ghostButton" type="button" onClick={() => setSocials((rows) => rows.filter((row) => row.id !== social.id))}>Remove</button></span></div>)}</div></LiquidGlass>;
}

function Creators({ apps, socials, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; isFiltered?: boolean }) {
  if (!socials.length) return <EmptyPanel title={isFiltered ? "No creator matches this search" : "No creators yet"} text={isFiltered ? "Clear the search or try another creator handle." : "Creators are created from tracked social handles."} />;
  return <section className="moduleMatrix">{socials.map((social) => <Module label={social.platform} title={social.handle} value={social.followers ? formatNumber(social.followers) : apps.find((app) => app.id === social.appId)?.name ?? "Unmapped"} text={social.followers ? `${formatNumber(social.avgViews ?? 0)} avg views · ${social.engagementRate?.toFixed(1) ?? "0.0"}% engagement.` : "Public profile."} chartValues={[social.followers ?? 0, social.avgViews ?? 0, social.posts ?? 0]} key={social.id} />)}</section>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <LiquidGlass className="panel emptyPanel"><p className="caption">Empty state</p><h2>{title}</h2><p>{text}</p></LiquidGlass>;
}

function Settings({ apps, socials, resetWorkspace, loadDemoWorkspace }: { apps: StudioApp[]; socials: SocialAccount[]; resetWorkspace: () => void; loadDemoWorkspace: () => void }) {
  return <LiquidGlass className="panel dataPanel"><div className="panelHeader"><div><p className="caption">Settings</p><h2>Local workspace</h2></div><span className="pill">Drift Studio</span></div><div className="settingsGrid"><Module label="Workspace" title="Local storage" value={`${apps.length} apps`} text={`${socials.length} handles.`} chartValues={[apps.length, socials.length]} /><div className="settingsActions"><button className="primaryButton" type="button" onClick={loadDemoWorkspace}>Load demo app</button><button className="ghostButton" type="button" onClick={resetWorkspace}>Clear local data</button></div></div></LiquidGlass>;
}
