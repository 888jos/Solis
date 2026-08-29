"use client";

import { ChangeEvent, ElementType, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  BadgeAlert,
  CalendarRange,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clapperboard,
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
  Trash2,
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
  credentialPreset?: "cocorise" | "cortifree";
  isDemo?: boolean;
  artworkUrl?: string;
  name: string;
  platform: string;
  bundleId: string;
  appStoreId: string;
  sku?: string;
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
  periodStartDate?: string;
  periodEndDate?: string;
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
    proceedsUnits?: number;
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
  views?: number;
  avgViews?: number;
  likes?: number;
  comments?: number;
  favorites?: number;
  posts?: number;
  shares?: number;
  engagementRate?: number;
  source?: string;
  status: "No public metrics" | "Provider pending" | "Ready for public tracking";
  createdAt: string;
};

type SocialMetricKey = "avgViews" | "comments" | "engagement" | "favorites" | "likes" | "shares" | "videos" | "views";

type Campaign = {
  id: string;
  appId: string;
  name: string;
  channel: "ASO" | "Paid Ads" | "Creators" | "Launch" | "Promo";
  goal: "Downloads" | "Revenue" | "Awareness" | "Trials" | "Retention";
  status: "Draft" | "Live" | "Paused" | "Completed";
  spend: number;
  startDate: string;
  endDate: string;
  notes?: string;
  createdAt: string;
};

type Creative = {
  id: string;
  appId: string;
  socialId: string;
  title: string;
  url: string;
  hook: string;
  angle: "Pain" | "Benefit" | "Proof" | "Demo" | "Offer" | "UGC";
  format: "Talking head" | "Screen recording" | "UGC" | "Meme" | "Static" | "Other";
  status: "Idea" | "Scripted" | "Posted" | "Winner" | "Fatigue" | "Archived";
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  favorites?: number;
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

type GeoMetric = "revenue" | "downloads" | "cvr";

type GlobeCountryFeature = {
  geometry: { coordinates: unknown; type: string };
  properties: { ISO_A2?: string; NAME?: string; POSTAL?: string };
  type: "Feature";
};

type GlobeCountryPoint = {
  code: string;
  cvr: number | null;
  downloads: number;
  lat: number;
  lng: number;
  name: string;
  proceedsUnits: number;
  revenue: number;
  units: number;
  value: number;
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

async function lookupAppleApp(appStoreId: string) {
  if (!/^\d+$/.test(appStoreId.trim())) return null;
  const response = await fetch(`/api/apple-search?id=${encodeURIComponent(appStoreId.trim())}&country=US`);
  if (!response.ok) return null;
  const payload = await response.json() as { results?: AsoSearchResult[] };
  return payload.results?.find((result) => result.appId === appStoreId.trim()) ?? payload.results?.[0] ?? null;
}

type AsoKeywordRow = {
  difficulty: number;
  keyword: string;
  popularity: number;
  source: "apple" | "manual";
  store: string;
  trend: number;
};

type AsoCacheEntry = {
  refreshedAt: string;
  results: AsoSearchResult[];
};

type AsoKeywordStorage = Record<string, string[]>;

const APP_STORAGE = "driftos.v2.apps";
const SOCIAL_STORAGE = "driftos.v2.socials";
const METRIC_STORAGE = "driftos.v2.appStoreMetrics";
const CAMPAIGN_STORAGE = "driftos.v2.campaigns";
const CREATIVE_STORAGE = "driftos.v2.creatives";
const ASO_KEYWORD_STORAGE = "driftos.v2.asoKeywords";
const ASO_RESULTS_STORAGE = "driftos.v2.asoResults";
const PORTFOLIO_SCOPE_STORAGE = "driftos.v2.portfolioScope";
const DEFAULT_WORKSPACE_ID = "drift-studio";
const DEFAULT_DATE_RANGE = "30d";
const CLIENT_SYNC_TIMEOUT_MS = 65_000;
const MAX_CUSTOM_RANGE_DAYS = 3650;
const CURRENT_PARSER_VERSION = 13;

function isoDateOffset(daysFromToday: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function customRangeKey(startDate: string, endDate: string) {
  return `custom:${startDate}:${endDate}`;
}

function customRangeLabel(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
  return `${formatter.format(new Date(`${startDate}T00:00:00Z`))} – ${formatter.format(new Date(`${endDate}T00:00:00Z`))}`;
}

function parseIsoDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveClientDateRange(dateRange: string) {
  const yesterday = parseIsoDay(isoDateOffset(-1))!;
  const presets: Record<string, { count: number; end: Date }> = {
    today: { count: 1, end: yesterday },
    yesterday: { count: 1, end: yesterday },
    "7d": { count: 7, end: yesterday },
    "30d": { count: 30, end: yesterday },
    "90d": { count: 90, end: yesterday },
    "180d": { count: 180, end: yesterday },
    "365d": { count: 365, end: yesterday },
    all: { count: MAX_CUSTOM_RANGE_DAYS, end: yesterday },
  };
  const custom = dateRange.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (custom) {
    const start = parseIsoDay(custom[1]);
    const end = parseIsoDay(custom[2]);
    if (!start || !end || start > end) return null;
    return { count: Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1, end, start };
  }
  const preset = presets[dateRange];
  if (!preset) return null;
  return { count: preset.count, end: preset.end, start: addUtcDays(preset.end, -preset.count + 1) };
}

function previousDateRangeKey(dateRange: string) {
  if (dateRange === "all") return "";
  if (dateRange === "today") return "yesterday";
  const current = resolveClientDateRange(dateRange);
  if (!current) return "";
  const previousEnd = addUtcDays(current.start, -1);
  const previousStart = addUtcDays(previousEnd, -current.count + 1);
  return customRangeKey(isoDay(previousStart), isoDay(previousEnd));
}
const InteractiveGlobe = dynamic(() => import("react-globe.gl"), { ssr: false });
const knownApps = {
  cocorise: {
    appStoreId: "6760921524",
    bundleId: "com.wrap.cocorise",
    credentialPreset: "cocorise" as const,
    name: "Cocorise: Anti-Snooze Alarm",
    platform: "iOS",
    sku: "CocoriseIOS01",
  },
  cortifree: {
    appStoreId: "6758314805",
    bundleId: "com.solstys.cortifree",
    credentialPreset: "cortifree" as const,
    name: "CortiFree: Stress & Sleep",
    platform: "iOS",
    sku: "CortiFreeIOS001",
  },
};

type LiquidGlassProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>;

type WorkspaceSearchResult = {
  id: string;
  icon: LucideIcon;
  kind: "Page" | "App" | "Social" | "Action";
  keywords: string;
  page: PageKey;
  subtitle: string;
  title: string;
};

type AppCredentialPreset = NonNullable<StudioApp["credentialPreset"]>;

type AppFormState = {
  appStoreId: string;
  bundleId: string;
  credentialPreset: "" | AppCredentialPreset;
  issuerId: string;
  keyId: string;
  name: string;
  platform: string;
  privateKeyName: string;
  privateKeyPath: string;
  sku: string;
  vendorNumber: string;
};

type BackendApp = {
  appStoreId: string | null;
  artworkUrl: string | null;
  bundleId: string | null;
  createdAt: string | number | Date;
  credentialPreset?: string | null;
  developerName?: string | null;
  displayName: string | null;
  id: string;
  issuerId?: string | null;
  keyId?: string | null;
  name: string;
  platform: string;
  privateKeySecretRef?: string | null;
  sku: string | null;
  status: string;
  vendorNumber?: string | null;
};

type BackendCampaign = {
  appId: string | null;
  budget: number;
  channel: string;
  createdAt: string | number | Date;
  endsAt: string | null;
  goal?: string | null;
  id: string;
  name: string;
  notes?: string | null;
  startsAt: string | null;
  status: string;
};

type BackendCreative = {
  angle?: string | null;
  appId: string | null;
  comments?: number | null;
  createdAt: string | number | Date;
  favorites?: number | null;
  format: string;
  hook?: string | null;
  id: string;
  impressions: number;
  likes?: number | null;
  name: string;
  shares?: number | null;
  socialAccountId?: string | null;
  status: string;
  url: string | null;
};

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
  overview: { eyebrow: "Command Center", title: "Overview", subline: "Live portfolio, revenue and acquisition health." },
  apps: { eyebrow: "Portfolio", title: "Apps portfolio", subline: "Manage connected apps and sync status." },
  actions: { eyebrow: "Action Center", title: "Setup actions", subline: "Prioritized fixes for incomplete sources." },
  revenue: { eyebrow: "Revenue Analytics", title: "Revenue", subline: "Revenue, monetized rows and subscription revenue." },
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

function normalizeRoutePage(page: string): PageKey {
  if (page === "overview") return "revenue";
  return pageCopy[page as PageKey] ? page as PageKey : "revenue";
}

const searchAliases: Record<string, string> = {
  abo: "subscriptions monetization paywall",
  abonnements: "subscriptions monetization paywall",
  argent: "revenue proceeds finance monetization",
  classement: "aso keywords ranking store",
  depenses: "finance costs campaigns",
  finance: "revenue proceeds costs profit",
  income: "revenue proceeds monetization",
  installs: "downloads acquisition",
  keywords: "aso ranking metadata",
  revenus: "revenue proceeds monetization",
  ventes: "revenue proceeds monetization",
  vues: "creatives social acquisition",
};

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeHandle(value: string) {
  const cleaned = value.trim().replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return cleaned ? `@${cleaned}` : "";
}

function workspaceSearchScore(result: WorkspaceSearchResult, query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return result.kind === "Page" ? 20 : 10;
  const expanded = normalized.split(/\s+/).flatMap((token) => [token, ...(searchAliases[token]?.split(" ") ?? [])]);
  const title = normalizeSearchText(result.title);
  const haystack = normalizeSearchText(`${result.title} ${result.subtitle} ${result.keywords}`);
  let score = 0;
  for (const token of expanded) {
    if (title === token) score += 120;
    else if (title.startsWith(token)) score += 80;
    else if (title.includes(token)) score += 55;
    else if (haystack.includes(token)) score += 24;
    else {
      let cursor = 0;
      for (const character of token) {
        cursor = haystack.indexOf(character, cursor);
        if (cursor === -1) break;
        cursor += 1;
      }
      if (cursor > 0) score += 5;
    }
  }
  return score;
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
const appDisplayName = (name: string) => name.split(":", 1)[0]?.trim() || name.trim() || "App";
const appInitials = (name: string) => appDisplayName(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AP";

function AppAvatar({ app, className = "" }: { app?: Pick<StudioApp, "artworkUrl" | "name">; className?: string }) {
  return <span className={`appAvatar ${app?.artworkUrl ? "hasArtwork" : ""} ${className}`.trim()} style={app?.artworkUrl ? { backgroundImage: `url(${app.artworkUrl})` } : undefined} aria-hidden="true">{app?.artworkUrl ? "" : appInitials(app?.name ?? "App")}</span>;
}

function OrganizationAvatar({ className = "" }: { className?: string }) {
  return <span className={`organizationAvatar ${className}`.trim()} aria-hidden="true"><i /><i /><i /><i /></span>;
}
const formatCurrency = (value: number, _currency = "USD") => {
  void _currency;
  try {
    return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `$${Math.round(Number.isFinite(value) ? value : 0).toLocaleString("en-US")}`;
  }
};

const formatUnitCurrency = (value: number, _currency = "USD") => {
  void _currency;
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatter = new Intl.NumberFormat("en-US", { currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2, style: "currency" });
  if (safeValue > 0 && safeValue < 0.01) return `<${formatter.format(0.01)}`;
  return formatter.format(safeValue);
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
  return apps.map((app) => {
    const presetEntry = Object.entries(knownApps).find(([, preset]) => app.appStoreId === preset.appStoreId || app.bundleId === preset.bundleId);
    const presetKey = (app.credentialPreset ?? presetEntry?.[0]) as StudioApp["credentialPreset"] | undefined;
    const preset = presetKey ? knownApps[presetKey] : null;
    const normalized = {
      ...app,
      ...(preset ? {
        appStoreId: app.appStoreId || preset.appStoreId,
        bundleId: app.bundleId || preset.bundleId,
        credentialPreset: presetKey,
        sku: !app.sku || app.sku === app.bundleId ? preset.sku : app.sku,
      } : {}),
      artworkUrl: app.artworkUrl || "",
      keyId: app.keyId || "",
      issuerId: app.issuerId || "",
      privateKeyName: app.privateKeyName || "",
      privateKeyPath: app.privateKeyPath || "",
      sku: preset ? (!app.sku || app.sku === app.bundleId ? preset.sku : app.sku) : app.sku || app.bundleId,
      vendorNumber: app.vendorNumber || "",
    };

    return {
      ...normalized,
      status: isAppSyncReady(normalized) ? "Ready to sync" as const : "Missing credentials" as const,
    };
  });
}

function appFromBackend(row: BackendApp): StudioApp {
  const createdAt = row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : typeof row.createdAt === "number"
      ? new Date(row.createdAt).toISOString()
      : String(row.createdAt || new Date().toISOString());
  const credentialPreset = row.credentialPreset === "cocorise" || row.credentialPreset === "cortifree" ? row.credentialPreset : undefined;
  const draft: StudioApp = {
    id: row.id,
    artworkUrl: row.artworkUrl || "",
    name: appDisplayName(row.displayName || row.name),
    platform: row.platform?.toUpperCase() === "IOS" ? "iOS" : row.platform || "iOS",
    bundleId: row.bundleId || "",
    appStoreId: row.appStoreId || "",
    credentialPreset,
    sku: row.sku || row.bundleId || "",
    keyId: row.keyId || "",
    issuerId: row.issuerId || "",
    vendorNumber: row.vendorNumber || "",
    privateKeyName: row.privateKeySecretRef?.split("/").pop() || "",
    privateKeyPath: row.privateKeySecretRef || "",
    status: "Missing credentials",
    createdAt,
  };
  return normalizeApps([draft])[0];
}

function isoFromDb(value: string | number | Date | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value || new Date().toISOString());
}

function normalizeCampaignChannel(value: string | null | undefined): Campaign["channel"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("paid")) return "Paid Ads";
  if (normalized.includes("aso")) return "ASO";
  if (normalized.includes("launch")) return "Launch";
  if (normalized.includes("promo")) return "Promo";
  return "Creators";
}

function normalizeCampaignGoal(value: string | null | undefined): Campaign["goal"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("revenue")) return "Revenue";
  if (normalized.includes("awareness")) return "Awareness";
  if (normalized.includes("trial")) return "Trials";
  if (normalized.includes("retention")) return "Retention";
  return "Downloads";
}

function normalizeCampaignStatus(value: string | null | undefined): Campaign["status"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("live")) return "Live";
  if (normalized.includes("paused")) return "Paused";
  if (normalized.includes("completed")) return "Completed";
  return "Draft";
}

function campaignFromBackend(row: BackendCampaign): Campaign {
  return {
    id: row.id,
    appId: row.appId || "",
    channel: normalizeCampaignChannel(row.channel),
    createdAt: isoFromDb(row.createdAt),
    endDate: row.endsAt || isoDateOffset(14),
    goal: normalizeCampaignGoal(row.goal),
    name: row.name,
    notes: row.notes || "",
    spend: Number.isFinite(Number(row.budget)) ? Number(row.budget) : 0,
    startDate: row.startsAt || isoDateOffset(0),
    status: normalizeCampaignStatus(row.status),
  };
}

function normalizeCreativeAngle(value: string | null | undefined): Creative["angle"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("pain")) return "Pain";
  if (normalized.includes("benefit")) return "Benefit";
  if (normalized.includes("proof")) return "Proof";
  if (normalized.includes("offer")) return "Offer";
  if (normalized.includes("ugc")) return "UGC";
  return "Demo";
}

function normalizeCreativeFormat(value: string | null | undefined): Creative["format"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("talking")) return "Talking head";
  if (normalized.includes("screen")) return "Screen recording";
  if (normalized.includes("ugc")) return "UGC";
  if (normalized.includes("meme")) return "Meme";
  if (normalized.includes("static")) return "Static";
  return "Other";
}

function normalizeCreativeStatus(value: string | null | undefined): Creative["status"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("script")) return "Scripted";
  if (normalized.includes("post")) return "Posted";
  if (normalized.includes("winner")) return "Winner";
  if (normalized.includes("fatigue")) return "Fatigue";
  if (normalized.includes("archive")) return "Archived";
  return "Idea";
}

function creativeFromBackend(row: BackendCreative): Creative {
  return {
    id: row.id,
    angle: normalizeCreativeAngle(row.angle),
    appId: row.appId || "",
    comments: row.comments ?? 0,
    createdAt: isoFromDb(row.createdAt),
    favorites: row.favorites ?? 0,
    format: normalizeCreativeFormat(row.format),
    hook: row.hook || "",
    likes: row.likes ?? 0,
    shares: row.shares ?? 0,
    socialId: row.socialAccountId || "",
    status: normalizeCreativeStatus(row.status),
    title: row.name,
    url: row.url || "",
    views: row.impressions,
  };
}

function appleCredentialGaps(app: StudioApp) {
  if (app.credentialPreset) return [
    !app.appStoreId ? "App Store ID" : "",
  ].filter(Boolean);
  return [
    !app.keyId ? "Key ID" : "",
    !app.issuerId ? "Issuer ID" : "",
    !app.vendorNumber ? "Vendor Number" : "",
    !app.appStoreId ? "App Store ID" : "",
    !app.privateKeyPath ? ".p8 path" : "",
  ].filter(Boolean);
}

function isAppSyncReady(app: StudioApp) {
  return appleCredentialGaps(app).length === 0;
}

function normalizeCurrency(currency: string | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
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
      proceedsUnits: Number.isFinite(country.proceedsUnits) ? country.proceedsUnits : 0,
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

function aggregateArpuTrend(metrics: AppStoreMetric[]) {
  const byDate = new Map<string, { downloads: number; proceeds: number }>();
  for (const metric of metrics) {
    for (const point of metric.timeSeries) {
      const current = byDate.get(point.date) ?? { downloads: 0, proceeds: 0 };
      byDate.set(point.date, {
        downloads: current.downloads + point.downloads,
        proceeds: current.proceeds + point.revenue,
      });
    }
  }
  const daily = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (daily.length > 45) {
    const weekly = new Map<string, { downloads: number; proceeds: number }>();
    for (const [date, values] of daily) {
      const label = weekLabel(date);
      const current = weekly.get(label) ?? { downloads: 0, proceeds: 0 };
      weekly.set(label, {
        downloads: current.downloads + values.downloads,
        proceeds: current.proceeds + values.proceeds,
      });
    }
    return Array.from(weekly.entries()).map(([label, values]) => ({
      label,
      value: values.downloads ? values.proceeds / values.downloads : 0,
    }));
  }
  return daily.map(([date, values]) => ({
    label: formatDateLabel(date),
    value: values.downloads ? values.proceeds / values.downloads : 0,
  }));
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
  try {
    const displayName = new Intl.DisplayNames(["en"], { type: "region" }).of(country.trim().toUpperCase());
    if (displayName) return displayName;
  } catch {
    // Keep the manual fallback below for runtimes without Intl.DisplayNames.
  }
  const names: Record<string, string> = {
    DZ: "Algeria",
    AU: "Australia",
    BE: "Belgium",
    BR: "Brazil",
    CA: "Canada",
    CH: "Switzerland",
    DE: "Germany",
    ES: "Spain",
    FR: "France",
    GB: "United Kingdom",
    IT: "Italy",
    JP: "Japan",
    MX: "Mexico",
    PH: "Philippines",
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

function asoKeywordCountryKey(country: string) {
  return country === "WORLD" ? "US" : country;
}

function asoDayKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function asoWasRefreshedToday(entry?: AsoCacheEntry) {
  return entry ? asoDayKey(new Date(entry.refreshedAt)) === asoDayKey() : false;
}

function formatAsoUpdatedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (asoDayKey(date) === asoDayKey()) return "Today";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
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
    const name = appDisplayName(app.name);
    if (app.status !== "Ready to sync") actions.push({ title: `${name}: complete credentials`, text: "Add missing Apple access before metrics can sync.", page: "apps", priority: "Critical" });
    if (app.status === "Ready to sync" && !metric) actions.push({ title: `${name}: run first sync`, text: "Apple metrics are not available until the first successful sync.", page: "apps", priority: "High" });
    if (metric && metric.parserVersion < 5) actions.push({ title: `${name}: refresh Apple sync`, text: "Run the latest sync to include ASO metadata and release state.", page: "apps", priority: "High" });
    if (metric?.downloads && !metric.revenueRows) actions.push({ title: `${name}: review monetization`, text: "Downloads are present, but Apple revenue is empty for the selected reports.", page: "revenue", priority: "Medium" });
    if (metric?.message.includes("financials pending")) actions.push({ title: `${name}: retry financial reports`, text: "Acquisition synced, but Apple financial reports did not complete.", page: "revenue", priority: "High" });
    if (metric?.aso && metric.aso.metadataScore < 80) actions.push({ title: `${name}: improve ASO metadata`, text: "Title, subtitle, description or keyword coverage is below release quality.", page: "aso", priority: "Medium" });
    if (metric && !metric.release?.readyForSale) actions.push({ title: `${name}: check release state`, text: "Latest App Store version is not marked ready for sale.", page: "releases", priority: "High" });
    if (!socials.some((social) => social.appId === app.id)) actions.push({ title: `${name}: map public handles`, text: "Add brand or creator handles to connect marketing context.", page: "social", priority: "Medium" });
  }
  if (!apps.length) actions.push({ title: "Add first app", text: "Start with App Store Connect credentials and the .p8 key path.", page: "integrations", priority: "Critical" });
  if (!actions.length) actions.push({ title: "Workspace healthy", text: "Connected sources have no blocking setup issues.", page: "revenue", priority: "Medium" });
  return actions;
}

function sumMetric(metrics: AppStoreMetric[], key: "downloads" | "revenue" | "revenueRows" | "subscriptions" | "inAppPurchases" | "rows" | "financeRows") {
  return metrics.reduce((sum, metric) => sum + (Number(metric[key]) || 0), 0);
}

function aggregateCountries(metrics: AppStoreMetric[]) {
  const byCountry = new Map<string, { country: string; downloads: number; proceedsUnits: number; revenue: number; units: number }>();
  for (const metric of metrics) {
    for (const row of metric.countryBreakdown ?? []) {
      const country = row.country.trim().toUpperCase();
      if (!country) continue;
      const current = byCountry.get(country) ?? { country, downloads: 0, proceedsUnits: 0, revenue: 0, units: 0 };
      byCountry.set(country, {
        country,
        downloads: current.downloads + row.downloads,
        proceedsUnits: current.proceedsUnits + (row.proceedsUnits ?? 0),
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
  if (cleanValues.length < 2 || Math.max(...cleanValues.map((value) => Math.abs(value)), 0) === 0) {
    return { direction: "flat" as const, percent: 0 };
  }
  const percent = trendDelta(cleanValues);
  if (Math.abs(percent) < 0.5) return { direction: "flat" as const, percent: 0 };
  return { direction: percent > 0 ? "up" as const : "down" as const, percent: Math.abs(percent) };
}

function periodTrendSignal(current: number, previous: number, hasPreviousPeriod: boolean) {
  if (!hasPreviousPeriod || (!current && !previous)) return { direction: "flat" as const, percent: 0 };
  const percent = previous ? ((current - previous) / previous) * 100 : current ? 100 : 0;
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
  const averageRevenuePerUser = downloads ? revenue / downloads : null;
  const monetizationRate = downloads ? (monetizedUnits / downloads) * 100 : 0;
  const subscriptionShare = monetizedUnits ? (subscriptions / monetizedUnits) * 100 : 0;
  const health = [
    metrics.length > 0,
    revenueRows > 0,
    financeRows > 0,
    monetizedUnits > 0,
    downloads > 0,
  ].filter(Boolean).length;
  return { averageRevenuePerDownload, averageRevenuePerUser, currency, downloads, financeRows, health, inAppPurchases, monetizationRate, monetizedUnits, revenue, revenueRows, subscriptionShare, subscriptions };
}

type MonetizationTrendKey = "proceeds" | "downloads" | "paidUnits" | "arpu" | "conversion";

function aggregateMonetizationTrendPoints(metrics: AppStoreMetric[], key: MonetizationTrendKey) {
  const byDate = new Map<string, { downloads: number; paidUnits: number; proceeds: number }>();
  for (const metric of metrics) {
    for (const point of metric.timeSeries) {
      const current = byDate.get(point.date) ?? { downloads: 0, paidUnits: 0, proceeds: 0 };
      byDate.set(point.date, {
        downloads: current.downloads + point.downloads,
        paidUnits: current.paidUnits + point.subscriptions + point.inAppPurchases,
        proceeds: current.proceeds + point.revenue,
      });
    }
  }

  const valueFor = (values: { downloads: number; paidUnits: number; proceeds: number }) => {
    if (key === "downloads") return values.downloads;
    if (key === "paidUnits") return values.paidUnits;
    if (key === "arpu") return values.downloads ? values.proceeds / values.downloads : 0;
    if (key === "conversion") return values.downloads ? (values.paidUnits / values.downloads) * 100 : 0;
    return values.proceeds;
  };

  const daily = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (daily.length > 45) {
    const weekly = new Map<string, { downloads: number; paidUnits: number; proceeds: number }>();
    for (const [date, values] of daily) {
      const label = weekLabel(date);
      const current = weekly.get(label) ?? { downloads: 0, paidUnits: 0, proceeds: 0 };
      weekly.set(label, {
        downloads: current.downloads + values.downloads,
        paidUnits: current.paidUnits + values.paidUnits,
        proceeds: current.proceeds + values.proceeds,
      });
    }
    return Array.from(weekly.entries()).map(([label, values]) => ({ label, value: valueFor(values) }));
  }
  return daily.map(([date, values]) => ({ label: formatDateLabel(date), value: valueFor(values) }));
}

function monetizationAppRows(apps: StudioApp[], metrics: AppStoreMetric[]) {
  return apps.map((app) => {
    const appMetrics = metrics.filter((metric) => metric.appId === app.id);
    const revenue = sumMetric(appMetrics, "revenue");
    const downloads = sumMetric(appMetrics, "downloads");
    const subscriptions = sumMetric(appMetrics, "subscriptions");
    const inAppPurchases = sumMetric(appMetrics, "inAppPurchases");
    const paidUnits = subscriptions + inAppPurchases;
    const currency = normalizeCurrency(appMetrics.find((metric) => metric.currency)?.currency);
    return {
      app,
      arpu: downloads ? revenue / downloads : 0,
      conversion: downloads ? (paidUnits / downloads) * 100 : 0,
      currency,
      downloads,
      paidUnits,
      revenue,
      subscriptions,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.downloads - a.downloads);
}

function subscriptionAppRows(apps: StudioApp[], metrics: AppStoreMetric[]) {
  return apps.map((app) => {
    const appMetrics = metrics.filter((metric) => metric.appId === app.id);
    const revenue = sumMetric(appMetrics, "revenue");
    const downloads = sumMetric(appMetrics, "downloads");
    const subscriptions = sumMetric(appMetrics, "subscriptions");
    const inAppPurchases = sumMetric(appMetrics, "inAppPurchases");
    const paidUnits = subscriptions + inAppPurchases;
    const currency = normalizeCurrency(appMetrics.find((metric) => metric.currency)?.currency);
    return {
      app,
      currency,
      downloads,
      paidShare: paidUnits ? (subscriptions / paidUnits) * 100 : 0,
      revenuePerSub: subscriptions ? revenue / subscriptions : 0,
      subscriptions,
    };
  }).sort((a, b) => b.subscriptions - a.subscriptions || b.revenuePerSub - a.revenuePerSub);
}

function subscriptionCohorts(metrics: AppStoreMetric[]) {
  const byDate = new Map<string, { downloads: number; proceeds: number; subscriptions: number }>();
  for (const metric of metrics) {
    for (const point of metric.timeSeries) {
      const current = byDate.get(point.date) ?? { downloads: 0, proceeds: 0, subscriptions: 0 };
      byDate.set(point.date, {
        downloads: current.downloads + point.downloads,
        proceeds: current.proceeds + point.revenue,
        subscriptions: current.subscriptions + point.subscriptions,
      });
    }
  }
  const daily = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const bucketed = daily.length > 45
    ? daily.reduce((weeks, [date, values]) => {
      const label = weekLabel(date);
      const current = weeks.get(label) ?? { downloads: 0, proceeds: 0, subscriptions: 0 };
      weeks.set(label, {
        downloads: current.downloads + values.downloads,
        proceeds: current.proceeds + values.proceeds,
        subscriptions: current.subscriptions + values.subscriptions,
      });
      return weeks;
    }, new Map<string, { downloads: number; proceeds: number; subscriptions: number }>())
    : new Map(daily.map(([date, values]) => [formatDateLabel(date), values]));
  return Array.from(bucketed.entries()).map(([label, values]) => ({
    conversion: values.downloads ? (values.subscriptions / values.downloads) * 100 : 0,
    downloads: values.downloads,
    label,
    proceeds: values.proceeds,
    revenuePerSub: values.subscriptions ? values.proceeds / values.subscriptions : 0,
    subscriptions: values.subscriptions,
  })).filter((row) => row.downloads || row.proceeds || row.subscriptions);
}

function normalizeMetrics(metrics: AppStoreMetric[]) {
  return metrics.map(normalizeMetric);
}

function marketingAnalytics(metrics: AppStoreMetric[], socials: SocialAccount[]) {
  const downloads = sumMetric(metrics, "downloads");
  const revenue = sumMetric(metrics, "revenue");
  const spend = metrics.reduce((sum, metric) => sum + (metric.expenses ?? 0), 0);
  const social = socialTotals(socials);
  const currency = normalizeCurrency(metrics.find((metric) => metric.currency)?.currency);
  return {
    cpi: spend && downloads ? spend / downloads : 0,
    currency,
    downloads,
    engagement: social.engagement,
    revenue,
    roas: spend ? revenue / spend : 0,
    socialPosts: social.videos,
    socialViews: social.views,
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
    return `Revenue: ${formatCurrency(revenue.revenue, revenue.currency)}, ${formatNumber(revenue.downloads)} downloads, ${formatNumber(revenue.subscriptions)} subscriptions. ARPD is ${formatCurrency(revenue.averageRevenuePerDownload, revenue.currency)}. ${topCountry ? `Top country: ${topCountry.country} with ${formatCurrency(topCountry.revenue, revenue.currency)}.` : "No country split yet."}`;
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
  const [activePage, setActivePage] = useState<PageKey>("revenue");
  const [openSections, setOpenSections] = useState(() => navSections.map((section) => section.label));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
  const [appWizardOpen, setAppWizardOpen] = useState(false);
  const [socialFormOpen, setSocialFormOpen] = useState(false);
  const [portfolioScope, setPortfolioScope] = useState("overall");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSelection, setSearchSelection] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [apps, setApps] = useState<StudioApp[]>([]);
  const [socials, setSocials] = useState<SocialAccount[]>([]);
  const [appStoreMetrics, setAppStoreMetrics] = useState<AppStoreMetric[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [syncingAppId, setSyncingAppId] = useState("");
  const attemptedAutoSyncIds = useRef(new Set<string>());
  const autoSyncAttempts = useRef(new Map<string, number>());
  const [autoSyncRevision, setAutoSyncRevision] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE);
  const previousDateRange = useMemo(() => previousDateRangeKey(dateRange), [dateRange]);
  const [customStartDate, setCustomStartDate] = useState(() => isoDateOffset(-30));
  const [customEndDate, setCustomEndDate] = useState(() => isoDateOffset(-1));
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [dateRangeError, setDateRangeError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiListening, setAiListening] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([{ id: "welcome", role: "assistant", text: "Ask about revenue, ASO, marketing, releases or what to fix next." }]);
  const emptyAppForm: AppFormState = { name: "", platform: "iOS", bundleId: "", appStoreId: "", sku: "", keyId: "", issuerId: "", vendorNumber: "", privateKeyName: "", privateKeyPath: "", credentialPreset: "" };
  const [appForm, setAppForm] = useState<AppFormState>(emptyAppForm);
  const [socialForm, setSocialForm] = useState({ platform: "TikTok" as SocialAccount["platform"], handle: "", appId: "" });
  const artworkLookups = useRef(new Set<string>());

  const openPage = useCallback((page: PageKey) => {
    const normalizedPage = normalizeRoutePage(page);
    setActivePage(normalizedPage);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${normalizedPage}`);
      window.scrollTo({ left: 0, top: 0 });
    }
  }, []);

  useEffect(() => {
    const loadStoredData = window.setTimeout(() => {
      void (async () => {
        const storedApps = normalizeApps(readStored<StudioApp[]>(APP_STORAGE, [])).filter((app) => !app.isDemo && !app.id.startsWith("demo-"));
        const storedSocials = readStored<SocialAccount[]>(SOCIAL_STORAGE, []).filter((social) => !social.isDemo && !social.id.startsWith("demo-"));
        const removedDemoMessage = ["Demo", "data"].join(" ");
        const removedDemoStatus = ["Demo", "metadata"].join(" ");
        const storedMetrics = normalizeMetrics(readStored<AppStoreMetric[]>(METRIC_STORAGE, [])).filter((metric) => !metric.appId.startsWith("demo-") && metric.message !== removedDemoMessage && metric.aso?.status !== removedDemoStatus);
        let resolvedApps = storedApps;
        let resolvedSocials = storedSocials;
        let resolvedCampaigns = readStored<Campaign[]>(CAMPAIGN_STORAGE, []);
        let resolvedCreatives = readStored<Creative[]>(CREATIVE_STORAGE, []);

        try {
          const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
          const sessionPayload = await sessionResponse.json() as { ok?: boolean; data?: { session?: { workspaceId?: string } } };
          const workspaceId = sessionPayload.data?.session?.workspaceId || DEFAULT_WORKSPACE_ID;
          const [appsResponse, socialsResponse] = await Promise.all([
            fetch(`/api/apps?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
            fetch(`/api/social-accounts?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
          ]);
          const [campaignsResponse, creativesResponse] = await Promise.all([
            fetch(`/api/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
            fetch(`/api/creatives?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
          ]);
          const appsPayload = await appsResponse.json() as { ok?: boolean; data?: { apps?: BackendApp[] } };
          const socialsPayload = await socialsResponse.json() as { ok?: boolean; data?: { socialAccounts?: SocialAccount[] } };
          const campaignsPayload = await campaignsResponse.json() as { ok?: boolean; data?: { campaigns?: BackendCampaign[] } };
          const creativesPayload = await creativesResponse.json() as { ok?: boolean; data?: { creatives?: BackendCreative[] } };
          const backendApps = appsPayload.data?.apps?.map(appFromBackend) ?? [];
          const backendSocials = socialsPayload.data?.socialAccounts?.map((social) => ({
            ...social,
            platform: social.platform.charAt(0).toUpperCase() + social.platform.slice(1).toLowerCase() as SocialAccount["platform"],
            status: social.status === "ready" ? "Ready for public tracking" as const : social.status === "no_public_metrics" ? "No public metrics" as const : "Provider pending" as const,
          })) ?? [];
          if (backendApps.length) resolvedApps = backendApps;
          if (backendSocials.length) resolvedSocials = backendSocials;
          if (campaignsPayload.ok) resolvedCampaigns = (campaignsPayload.data?.campaigns ?? []).filter((campaign) => campaign.status !== "deleted").map(campaignFromBackend);
          if (creativesPayload.ok) resolvedCreatives = (creativesPayload.data?.creatives ?? []).filter((creative) => creative.status !== "deleted").map(creativeFromBackend);
        } catch {
          resolvedApps = storedApps;
          resolvedSocials = storedSocials;
        }

        const storedCampaigns = resolvedCampaigns.filter((campaign) => resolvedApps.some((app) => app.id === campaign.appId));
        const storedCreatives = resolvedCreatives.filter((creative) => resolvedApps.some((app) => app.id === creative.appId));
        setApps(resolvedApps);
        setSocials(resolvedSocials);
        setAppStoreMetrics(storedMetrics.filter((metric) => resolvedApps.some((app) => app.id === metric.appId)));
        setCampaigns(storedCampaigns);
        setCreatives(storedCreatives);
        const storedPortfolioScope = readStored<string>(PORTFOLIO_SCOPE_STORAGE, "");
        const restoredPortfolioScope = (resolvedApps.length > 1 && storedPortfolioScope === "overall") || resolvedApps.some((app) => app.id === storedPortfolioScope)
          ? storedPortfolioScope
          : resolvedApps.length > 1 ? "overall" : resolvedApps[0]?.id ?? "overall";
        setPortfolioScope(restoredPortfolioScope);
        const hashPage = window.location.hash.replace("#", "");
        if (hashPage) {
          const normalizedPage = normalizeRoutePage(hashPage);
          setActivePage(normalizedPage);
          if (hashPage !== normalizedPage) window.history.replaceState(null, "", `#${normalizedPage}`);
          window.scrollTo({ left: 0, top: 0 });
        }
        setLoaded(true);
      })();
    }, 0);
    return () => window.clearTimeout(loadStoredData);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hashPage = window.location.hash.replace("#", "");
      if (!hashPage) return;
      const normalizedPage = normalizeRoutePage(hashPage);
      setActivePage(normalizedPage);
      if (hashPage !== normalizedPage) window.history.replaceState(null, "", `#${normalizedPage}`);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    for (const app of apps) {
      if (app.artworkUrl || !app.appStoreId || artworkLookups.current.has(app.id)) continue;
      artworkLookups.current.add(app.id);
      void lookupAppleApp(app.appStoreId).then((result) => {
        if (!result?.artworkUrl) return;
        setApps((current) => current.map((item) => item.id === app.id ? { ...item, artworkUrl: result.artworkUrl } : item));
      });
    }
  }, [apps, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(APP_STORAGE, JSON.stringify(apps));
  }, [apps, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(SOCIAL_STORAGE, JSON.stringify(socials));
  }, [socials, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(METRIC_STORAGE, JSON.stringify(appStoreMetrics));
  }, [appStoreMetrics, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(CAMPAIGN_STORAGE, JSON.stringify(campaigns));
  }, [campaigns, loaded]);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(CREATIVE_STORAGE, JSON.stringify(creatives));
  }, [creatives, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const validScope = (apps.length > 1 && portfolioScope === "overall") || apps.some((app) => app.id === portfolioScope)
      ? portfolioScope
      : apps[0]?.id ?? "overall";
    window.localStorage.setItem(PORTFOLIO_SCOPE_STORAGE, JSON.stringify(validScope));
  }, [apps, loaded, portfolioScope]);

  const syncAppStore = useCallback(async (app: StudioApp, targetDateRange = dateRange) => {
    setSyncError("");
    setSyncingAppId(app.id);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CLIENT_SYNC_TIMEOUT_MS);
    try {
      const response = await fetch("/api/app-store-connect/sync", {
        body: JSON.stringify({ app, dateRange: targetDateRange }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const payload = await response.json() as { ok: boolean; metrics?: AppStoreMetric; message?: string; missing?: string[] };
      if (!response.ok || !payload.ok || !payload.metrics) {
        const missing = payload.missing?.length ? ` Missing: ${payload.missing.join(", ")}.` : "";
        throw new Error(`${payload.message ?? "App Store Connect sync failed."}${missing}`);
      }
      setAppStoreMetrics((current) => [normalizeMetric(payload.metrics!), ...current.filter((metric) => !(metric.appId === app.id && metric.dateRange === targetDateRange))]);
      return true;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      setSyncError(isAbort ? "Apple sync is taking too long. Try a shorter period or retry later." : error instanceof Error ? error.message : "App Store Connect sync failed.");
      return false;
    } finally {
      window.clearTimeout(timeout);
      setSyncingAppId("");
    }
  }, [dateRange]);

  useEffect(() => {
    if (!loaded || syncingAppId) return;
    const shouldAutoSyncPrevious = dateRange === "today" || dateRange === "yesterday" || dateRange === "7d" || dateRange === "30d";
    const syncRanges = [dateRange, shouldAutoSyncPrevious ? previousDateRange : ""].filter(Boolean);
    const candidate = syncRanges.flatMap((range) => apps.map((app) => ({ app, range }))).find(({ app, range }) => {
      if (app.isDemo) return false;
      const isComplete = isAppSyncReady(app);
      const syncKey = `${app.id}:${range}`;
      const hasCurrentMetrics = appStoreMetrics.some((metric) => metric.appId === app.id && metric.parserVersion >= CURRENT_PARSER_VERSION && metric.dateRange === range && metric.aso);
      const attempts = autoSyncAttempts.current.get(syncKey) ?? 0;
      return isComplete && !hasCurrentMetrics && attempts < 3 && !attemptedAutoSyncIds.current.has(syncKey);
    });
    if (!candidate) return;
    const syncKey = `${candidate.app.id}:${candidate.range}`;
    const attempt = (autoSyncAttempts.current.get(syncKey) ?? 0) + 1;
    autoSyncAttempts.current.set(syncKey, attempt);
    attemptedAutoSyncIds.current.add(syncKey);
    void syncAppStore(candidate.app, candidate.range).then((succeeded) => {
      if (succeeded) {
        autoSyncAttempts.current.delete(syncKey);
        return;
      }
      if (attempt >= 3) return;
      window.setTimeout(() => {
        attemptedAutoSyncIds.current.delete(syncKey);
        setAutoSyncRevision((value) => value + 1);
      }, attempt * 2_500);
    });
  }, [appStoreMetrics, apps, autoSyncRevision, dateRange, loaded, previousDateRange, syncAppStore, syncingAppId]);

  const periodMetrics = useMemo(
    () => appStoreMetrics.filter((metric) => (metric.dateRange || DEFAULT_DATE_RANGE) === dateRange),
    [appStoreMetrics, dateRange],
  );
  const previousPeriodMetrics = useMemo(
    () => previousDateRange ? appStoreMetrics.filter((metric) => (metric.dateRange || DEFAULT_DATE_RANGE) === previousDateRange) : [],
    [appStoreMetrics, previousDateRange],
  );
  const effectivePortfolioScope = (apps.length > 1 && portfolioScope === "overall") || apps.some((app) => app.id === portfolioScope)
    ? portfolioScope
    : apps[0]?.id ?? "overall";

  const scopedApps = useMemo(
    () => effectivePortfolioScope === "overall" ? apps : apps.filter((app) => app.id === effectivePortfolioScope),
    [apps, effectivePortfolioScope],
  );
  const scopedSocials = useMemo(
    () => effectivePortfolioScope === "overall" ? socials : socials.filter((social) => social.appId === effectivePortfolioScope),
    [effectivePortfolioScope, socials],
  );
  const currentMetrics = useMemo(
    () => effectivePortfolioScope === "overall" ? periodMetrics : periodMetrics.filter((metric) => metric.appId === effectivePortfolioScope),
    [effectivePortfolioScope, periodMetrics],
  );
  const previousMetrics = useMemo(
    () => effectivePortfolioScope === "overall" ? previousPeriodMetrics : previousPeriodMetrics.filter((metric) => metric.appId === effectivePortfolioScope),
    [effectivePortfolioScope, previousPeriodMetrics],
  );

  const totals = useMemo(() => {
    const readyApps = scopedApps.filter((app) => app.status === "Ready to sync").length;
    const missingApps = scopedApps.length - readyApps;
    const mappedSocials = scopedSocials.filter((social) => scopedApps.some((app) => app.id === social.appId)).length;
    const revenue = currentMetrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const downloads = currentMetrics.reduce((sum, metric) => sum + metric.downloads, 0);
    const revenueRows = currentMetrics.reduce((sum, metric) => sum + metric.revenueRows, 0);
    const subscriptions = currentMetrics.reduce((sum, metric) => sum + metric.subscriptions, 0);
    const syncedApps = new Set(currentMetrics.map((metric) => metric.appId)).size;
    const currency = normalizeCurrency(currentMetrics.find((metric) => metric.currency)?.currency);
    const downloadTrend = aggregateTrend(currentMetrics, "downloads");
    const revenueTrend = aggregateTrend(currentMetrics, "revenue");
    const subscriptionTrend = aggregateTrend(currentMetrics, "subscriptions");
    return { readyApps, missingApps, mappedSocials, socialCount: scopedSocials.length, appCount: scopedApps.length, revenue, revenueRows, downloads, subscriptions, syncedApps, currency, downloadTrend, revenueTrend, subscriptionTrend };
  }, [currentMetrics, scopedApps, scopedSocials]);

  const selectedAppId = socialForm.appId || apps[0]?.id || "";
  const copy = pageCopy[activePage];
  const selectedPortfolioApp = apps.find((app) => app.id === effectivePortfolioScope);
  const portfolioLabel = selectedPortfolioApp ? appDisplayName(selectedPortfolioApp.name) : "All Apps";
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleApps = useMemo(() => {
    if (!normalizedSearch) return scopedApps;
    return scopedApps.filter((app) => [app.name, app.platform, app.bundleId, app.appStoreId, app.sku, app.privateKeyPath, app.status].join(" ").toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, scopedApps]);
  const visibleSocials = useMemo(() => {
    if (!normalizedSearch) return scopedSocials;
    return scopedSocials.filter((social) => {
      const mappedApp = apps.find((app) => app.id === social.appId)?.name ?? "";
      return [social.handle, social.platform, social.status, mappedApp].join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [apps, normalizedSearch, scopedSocials]);

  const workspaceSearchResults = useMemo(() => {
    const navItems = navSections.flatMap((section) => section.items);
    const iconForPage = (page: PageKey) => navItems.find((item) => item.page === page)?.icon ?? PanelsTopLeft;
    const pages = (Object.keys(pageCopy) as PageKey[])
      .filter((page) => !["landing", "onboarding", "overview"].includes(page))
      .map((page): WorkspaceSearchResult => ({
        id: `page-${page}`,
        icon: iconForPage(page),
        kind: "Page",
        keywords: `${page} ${pageCopy[page].eyebrow} ${pageCopy[page].subline}`,
        page,
        subtitle: pageCopy[page].eyebrow,
        title: pageCopy[page].title,
      }));
    const appResults = apps.map((app): WorkspaceSearchResult => ({
      id: `app-${app.id}`,
      icon: PanelsTopLeft,
      kind: "App",
      keywords: `${app.bundleId} ${app.appStoreId} ${app.sku ?? ""} ${app.platform} ${app.status}`,
      page: "apps",
      subtitle: app.bundleId || app.platform,
      title: appDisplayName(app.name),
    }));
    const socialResults = socials.map((social): WorkspaceSearchResult => ({
      id: `social-${social.id}`,
      icon: AtSign,
      kind: "Social",
      keywords: `${social.platform} ${social.status} ${apps.find((app) => app.id === social.appId)?.name ?? ""}`,
      page: "social",
      subtitle: social.platform,
      title: social.handle,
    }));
    const actionResults = buildActions(apps, socials, currentMetrics).map((action, index): WorkspaceSearchResult => ({
      id: `action-${index}-${action.page}`,
      icon: Target,
      kind: "Action",
      keywords: `${action.area} ${action.impact} ${action.ready ? "ready" : "priority fix"}`,
      page: action.page,
      subtitle: action.area,
      title: action.title,
    }));
    return [...pages, ...appResults, ...socialResults, ...actionResults]
      .map((result) => ({ result, score: workspaceSearchScore(result, searchQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
      .slice(0, 12)
      .map(({ result }) => result);
  }, [apps, currentMetrics, searchQuery, socials]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "/" && !isEditable) {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchSelection(0);
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  function updateAppForm(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setAppForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateSocialForm(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setSocialForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function addApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appForm.name.trim()) return;
    const appleApp = await lookupAppleApp(appForm.appStoreId).catch(() => null);
    const hasCredentials = Boolean(appForm.credentialPreset || (appForm.keyId.trim() && appForm.issuerId.trim() && appForm.vendorNumber.trim() && appForm.appStoreId.trim() && (appForm.privateKeyName.trim() || appForm.privateKeyPath.trim())));
    const draftApp: StudioApp = {
        id: `${appForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        artworkUrl: appleApp?.artworkUrl || "",
        name: appForm.name.trim(),
        platform: appForm.platform,
        bundleId: appForm.bundleId.trim(),
        appStoreId: appForm.appStoreId.trim(),
        credentialPreset: appForm.credentialPreset || undefined,
        sku: appForm.sku.trim() || appForm.bundleId.trim(),
        keyId: appForm.keyId.trim(),
        issuerId: appForm.issuerId.trim(),
        vendorNumber: appForm.vendorNumber.trim(),
        privateKeyName: appForm.privateKeyName.trim(),
        privateKeyPath: appForm.privateKeyPath.trim(),
        status: hasCredentials ? "Ready to sync" : "Missing credentials",
        createdAt: new Date().toISOString(),
      };
    try {
      const response = await fetch("/api/apps", {
        body: JSON.stringify({
          appStoreId: draftApp.appStoreId,
          artworkUrl: draftApp.artworkUrl,
          bundleId: draftApp.bundleId,
          credentialPreset: draftApp.credentialPreset,
          displayName: appDisplayName(draftApp.name),
          issuerId: draftApp.issuerId,
          keyId: draftApp.keyId,
          name: appDisplayName(draftApp.name),
          platform: draftApp.platform,
          primaryCurrency: "USD",
          privateKeySecretRef: draftApp.privateKeyPath,
          sku: draftApp.sku,
          vendorNumber: draftApp.vendorNumber,
          workspaceId: DEFAULT_WORKSPACE_ID,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { ok?: boolean; data?: { app?: BackendApp }; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.data?.app) throw new Error(payload.error?.message || "App could not be saved.");
      setApps((current) => [...current.filter((app) => app.appStoreId !== draftApp.appStoreId), appFromBackend(payload.data!.app!)]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "App could not be saved.");
      setApps((current) => [...current, draftApp]);
    }
    setAppForm(emptyAppForm);
    setAppWizardOpen(false);
    openPage("apps");
  }

  async function addSocial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!socialForm.handle.trim() || !selectedAppId) return;
    const handle = normalizeHandle(socialForm.handle);
    if (!handle) return;
    const draftSocial: SocialAccount = { id: `${socialForm.platform}-${handle}-${Date.now()}`, handle, platform: socialForm.platform, appId: selectedAppId, status: "Provider pending", createdAt: new Date().toISOString() };
    setSocials((current) => {
      const exists = current.some((row) => row.platform === socialForm.platform && normalizeHandle(row.handle) === handle);
      if (exists) return current;
      return [...current, draftSocial];
    });
    try {
      const response = await fetch("/api/social-accounts", {
        body: JSON.stringify({ appId: selectedAppId, handle, platform: socialForm.platform, workspaceId: DEFAULT_WORKSPACE_ID }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { ok?: boolean; data?: { socialAccount?: SocialAccount } };
      if (response.ok && payload.ok && payload.data?.socialAccount) {
        const saved = payload.data.socialAccount;
        setSocials((current) => current.map((row) => row.id === draftSocial.id ? {
          ...saved,
          platform: socialForm.platform,
          status: "Provider pending",
        } : row));
      }
    } catch {
      // Keep the local row as a draft if the local backend is temporarily down.
    }
    setSocialForm({ platform: "TikTok", handle: "", appId: selectedAppId });
    setSocialFormOpen(false);
    openPage("social");
  }

  function deleteApp(appId: string) {
    const app = apps.find((row) => row.id === appId);
    if (!app || !window.confirm(`Delete ${appDisplayName(app.name)}? Its synced metrics and mapped social accounts will also be removed.`)) return;
    const nextAppId = apps.find((row) => row.id !== appId)?.id ?? "overall";
    void fetch(`/api/apps/${encodeURIComponent(appId)}`, { method: "DELETE" }).catch(() => null);
    setApps((rows) => rows.filter((row) => row.id !== appId));
    setSocials((rows) => rows.filter((row) => row.appId !== appId));
    setAppStoreMetrics((rows) => rows.filter((row) => row.appId !== appId));
    setCampaigns((rows) => rows.filter((row) => row.appId !== appId));
    setCreatives((rows) => rows.filter((row) => row.appId !== appId));
    if (effectivePortfolioScope === appId) setPortfolioScope(nextAppId);
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

  function selectDateRange(value: string) {
    setDateRangeError("");
    if (value === "custom") {
      setCustomRangeOpen(true);
      return;
    }
    setCustomRangeOpen(false);
    setDateRange(value);
  }

  function applyCustomDateRange() {
    const latestDate = isoDateOffset(-1);
    if (!customStartDate || !customEndDate) {
      setDateRangeError("Choose a start and end date.");
      return;
    }
    if (customStartDate > customEndDate) {
      setDateRangeError("Start date must be before end date.");
      return;
    }
    if (customEndDate > latestDate) {
      setDateRangeError("Apple reports are available through yesterday.");
      return;
    }
    const days = Math.floor((Date.parse(customEndDate) - Date.parse(customStartDate)) / 86_400_000) + 1;
    if (days > MAX_CUSTOM_RANGE_DAYS) {
      setDateRangeError(`Custom periods can cover up to ${MAX_CUSTOM_RANGE_DAYS} days.`);
      return;
    }
    setDateRangeError("");
    setDateRange(customRangeKey(customStartDate, customEndDate));
    setCustomRangeOpen(false);
  }

  function toggleSection(label: string) {
    setOpenSections((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  }

  function focusWorkspaceSearch() {
    setSearchOpen(true);
  }

  function closeWorkspaceSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchSelection(0);
  }

  function openSearchResult(result: WorkspaceSearchResult) {
    openPage(result.page);
    closeWorkspaceSearch();
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchSelection((current) => Math.min(current + 1, Math.max(0, workspaceSearchResults.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchSelection((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && workspaceSearchResults[searchSelection]) {
      event.preventDefault();
      openSearchResult(workspaceSearchResults[searchSelection]);
    }
  }

  function sendAiMessage(text = aiInput) {
    const prompt = text.trim();
    if (!prompt) return;
    const userMessage: AiMessage = { id: `user-${Date.now()}`, role: "user", text: prompt };
    const assistantMessage: AiMessage = { id: `assistant-${Date.now()}`, role: "assistant", text: buildWorkspaceAnswer(prompt, apps, socials, currentMetrics, activePage) };
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

  const appFormCard = <AppForm appForm={appForm} addApp={addApp} updateAppForm={updateAppForm} setAppForm={setAppForm} open={appWizardOpen} setOpen={setAppWizardOpen} />;
  const socialFormCard = <SocialForm apps={apps} socialForm={socialForm} selectedAppId={selectedAppId} addSocial={addSocial} updateSocialForm={updateSocialForm} />;

  function renderPage() {
    if (activePage === "landing") return <LandingPage totals={totals} setActivePage={openPage} />;
    if (activePage === "onboarding") return <OnboardingPage apps={apps} socials={socials} metrics={currentMetrics} appFormCard={appFormCard} socialFormCard={socialFormCard} syncError={syncError} setActivePage={openPage} />;
    if (activePage === "overview") return <AnalyticsPage kind="revenue" apps={scopedApps} metrics={currentMetrics} previousMetrics={previousMetrics} previousPeriodAvailable={Boolean(previousDateRange)} syncingAppId={syncingAppId} syncError={syncError} setActivePage={openPage} />;
    if (activePage === "apps") return <>{appFormCard}{syncError ? <InlineError text={syncError} /> : null}<AppTable apps={visibleApps} socials={socials} metrics={currentMetrics} onDeleteApp={deleteApp} syncAppStore={syncAppStore} syncingAppId={syncingAppId} isFiltered={Boolean(normalizedSearch)} /></>;
    if (activePage === "actions") return <Actions apps={scopedApps} socials={scopedSocials} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "revenue") return <AnalyticsPage kind="revenue" apps={scopedApps} metrics={currentMetrics} previousMetrics={previousMetrics} previousPeriodAvailable={Boolean(previousDateRange)} syncingAppId={syncingAppId} syncError={syncError} setActivePage={openPage} />;
    if (activePage === "subscriptions") return <SubscriptionsPage apps={scopedApps} metrics={currentMetrics} isSyncing={Boolean(syncingAppId)} setActivePage={openPage} />;
    if (activePage === "monetization") return <MonetizationPage apps={scopedApps} metrics={currentMetrics} isSyncing={Boolean(syncingAppId)} setActivePage={openPage} />;
    if (activePage === "acquisition") return <AnalyticsPage kind="acquisition" apps={scopedApps} metrics={currentMetrics} previousMetrics={previousMetrics} previousPeriodAvailable={Boolean(previousDateRange)} syncingAppId={syncingAppId} syncError={syncError} setActivePage={openPage} />;
    if (activePage === "aso") return <AsoPage apps={scopedApps} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "creatives") return <CreativePage apps={scopedApps} socials={visibleSocials} creatives={creatives.filter((creative) => scopedApps.some((app) => app.id === creative.appId))} setCreatives={setCreatives} isFiltered={Boolean(normalizedSearch)} />;
    if (activePage === "campaigns") return <CampaignsPage apps={scopedApps} metrics={currentMetrics} socials={visibleSocials} campaigns={campaigns.filter((campaign) => scopedApps.some((app) => app.id === campaign.appId))} setCampaigns={setCampaigns} setActivePage={openPage} />;
    if (activePage === "social") return <SocialTrackingPage apps={scopedApps} socials={visibleSocials} setSocials={setSocials} isFiltered={Boolean(normalizedSearch)} />;
    if (activePage === "creators") return <Creators apps={scopedApps} socials={visibleSocials} isFiltered={Boolean(normalizedSearch)} />;
    if (activePage === "product") return <ProductPage apps={scopedApps} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "releases") return <ReleasesPage apps={scopedApps} socials={scopedSocials} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "quality") return <QualityPage apps={scopedApps} socials={scopedSocials} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "roadmap") return <RoadmapPage apps={scopedApps} socials={scopedSocials} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "tasks") return <TasksPage apps={scopedApps} socials={scopedSocials} metrics={currentMetrics} setActivePage={openPage} />;
    if (activePage === "paywall") return <PaywallPage apps={scopedApps} metrics={currentMetrics} isSyncing={Boolean(syncingAppId)} setActivePage={openPage} />;
    if (activePage === "geoRevenue") return <GeoRevenuePage apps={scopedApps} metrics={currentMetrics} />;
    if (activePage === "integrations") return <IntegrationsPage apps={visibleApps} socials={visibleSocials} metrics={currentMetrics} appFormCard={appFormCard} socialFormCard={socialFormCard} syncError={syncError} syncAppStore={syncAppStore} syncingAppId={syncingAppId} setActivePage={openPage} />;
    return <Settings apps={apps} socials={socials} metrics={appStoreMetrics} onDeleteApp={deleteApp} />;
  }

  const mobileItems = navSections.flatMap((section) => section.items);

  return (
    <main className={sidebarCollapsed ? "appShell sidebarCollapsed" : "appShell"}>
      <LiquidGlass as="aside" className="sideRail">
        <div className="sidebarHead">
          <button className="brandBlock" type="button" onClick={() => setAppSwitcherOpen((open) => !open)} aria-expanded={appSwitcherOpen} aria-haspopup="menu" aria-label={`Select app, current ${portfolioLabel}`}>
            {selectedPortfolioApp ? <AppAvatar app={selectedPortfolioApp} className="brandLogo" /> : <OrganizationAvatar className="brandLogo" />}
            <div className="brandCopy"><strong title={portfolioLabel}>{portfolioLabel}</strong><small>{effectivePortfolioScope === "overall" ? `${apps.length} apps · Drift Studio` : "Drift Studio"}</small></div>
            <ChevronDown className={appSwitcherOpen ? "brandChevron isOpen" : "brandChevron"} size={16} strokeWidth={1.8} />
          </button>
          <button className="sidebarToggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={sidebarCollapsed}>
            {sidebarCollapsed ? <PanelLeftOpen size={22} strokeWidth={2} /> : <PanelLeftClose size={22} strokeWidth={2} />}
          </button>
        </div>
        {appSwitcherOpen ? (
          <div className="appSwitcher" role="menu" aria-label="Apps">
            <p>Apps</p>
            {apps.length > 1 ? (
              <button className={effectivePortfolioScope === "overall" ? "isSelected" : ""} type="button" role="menuitem" onClick={() => { setPortfolioScope("overall"); setAppSwitcherOpen(false); }}>
                <OrganizationAvatar className="appScopeAvatar overall" />
                <span><strong>All Apps</strong><small>{apps.length} apps combined</small></span>
                {effectivePortfolioScope === "overall" ? <Check size={17} strokeWidth={2} /> : null}
              </button>
            ) : null}
            {apps.map((app) => (
              <button className={effectivePortfolioScope === app.id ? "isSelected" : ""} type="button" role="menuitem" onClick={() => { setPortfolioScope(app.id); setAppSwitcherOpen(false); }} key={`scope-${app.id}`}>
                <AppAvatar app={app} className="appScopeAvatar" />
                <span><strong title={app.name}>{appDisplayName(app.name)}</strong><small>{app.bundleId || app.platform}</small></span>
                {effectivePortfolioScope === app.id ? <Check size={17} strokeWidth={2} /> : null}
              </button>
            ))}
            <button className="appSwitcherAdd" type="button" role="menuitem" onClick={() => { setAppSwitcherOpen(false); setAppWizardOpen(true); openPage("apps"); }}><span>+</span><strong>Add app</strong></button>
          </div>
        ) : null}
        <div className="sidebarQuickActions" aria-label="Sidebar tools">
          <button type="button" onClick={focusWorkspaceSearch} aria-keyshortcuts="Meta+K Control+K"><Search size={20} strokeWidth={2} />Search</button>
          <button type="button" onClick={() => setAiOpen(true)}><Sparkles size={20} strokeWidth={2} />AI</button>
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
          <div className="topActions">
            <div className="dateRangePicker">
              <label className="rangeControl"><CalendarRange size={22} strokeWidth={2} /><select value={dateRange.startsWith("custom:") ? "custom" : dateRange} onChange={(event) => selectDateRange(event.target.value)} aria-label="Date range"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7d">1 Week</option><option value="30d">Last 30 Days</option><option value="90d">Last 90 Days</option><option value="180d">Last 180 Days</option><option value="365d">Last 365 Days</option><option value="all">All Time</option><option value="custom">{dateRange.startsWith("custom:") ? customRangeLabel(customStartDate, customEndDate) : "Custom"}</option></select></label>
              {customRangeOpen ? <div className="customDatePopover" role="dialog" aria-label="Custom date range"><label>From<input type="date" value={customStartDate} max={customEndDate || isoDateOffset(-1)} onChange={(event) => setCustomStartDate(event.target.value)} /></label><label>To<input type="date" value={customEndDate} min={customStartDate} max={isoDateOffset(-1)} onChange={(event) => setCustomEndDate(event.target.value)} /></label>{dateRangeError ? <small>{dateRangeError}</small> : null}<div><button type="button" onClick={() => setCustomRangeOpen(false)}>Cancel</button><button className="applyDateButton" type="button" onClick={applyCustomDateRange}>Apply</button></div></div> : null}
            </div>
            {activePage === "social" ? <button className="primaryTopButton" type="button" onClick={() => setSocialFormOpen(true)}><AtSign size={20} strokeWidth={2} />Add @</button> : null}
            <button type="button" onClick={exportWorkspace}><Download size={21} strokeWidth={2} />Export</button>
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
      {searchOpen ? (
        <div className="commandPaletteBackdrop" role="presentation" onMouseDown={closeWorkspaceSearch}>
          <section className="commandPalette" role="dialog" aria-modal="true" aria-label="Search DriftOS" onMouseDown={(event) => event.stopPropagation()}>
            <div className="commandPaletteInput">
              <Search size={21} strokeWidth={1.8} aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setSearchSelection(0); }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search pages, apps, metrics or actions..."
                aria-label="Search workspace"
                aria-activedescendant={workspaceSearchResults[searchSelection]?.id}
                autoComplete="off"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="commandPaletteResults" role="listbox" aria-label="Search results">
              {workspaceSearchResults.length ? workspaceSearchResults.map((result, index) => {
                const ResultIcon = result.icon;
                return (
                  <button
                    id={result.id}
                    className={index === searchSelection ? "isSelected" : ""}
                    type="button"
                    role="option"
                    aria-selected={index === searchSelection}
                    onMouseEnter={() => setSearchSelection(index)}
                    onClick={() => openSearchResult(result)}
                    key={result.id}
                  >
                    <ResultIcon size={20} strokeWidth={1.8} />
                    <span><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                    <em>{result.kind}</em>
                    <ArrowRight size={17} strokeWidth={1.8} />
                  </button>
                );
              }) : <div className="commandPaletteEmpty"><Search size={24} strokeWidth={1.6} /><strong>No results</strong><span>Try revenue, downloads, ASO or an app name.</span></div>}
            </div>
            <footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span>Business terms and synonyms supported</span></footer>
          </section>
        </div>
      ) : null}
      {socialFormOpen ? (
        <div className="appWizardBackdrop" role="presentation" onMouseDown={() => setSocialFormOpen(false)}>
          <section className="socialHandleModal" role="dialog" aria-modal="true" aria-label="Add social handle" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalCloseButton" type="button" onClick={() => setSocialFormOpen(false)} aria-label="Close">×</button>
            {socialFormCard}
          </section>
        </div>
      ) : null}
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
  return revenueSource === "Financial" ? "Net fallback" : "Revenue";
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

function TrendBadge({ loading = false, signal, values }: { loading?: boolean; signal?: { direction: "down" | "flat" | "up"; percent: number }; values: number[] }) {
  if (loading) {
    return <span className="metricTrend trendSkeleton" aria-label="Loading previous period trend" title="Loading previous period trend" />;
  }
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (!signal && (cleanValues.length < 2 || Math.max(...cleanValues.map((value) => Math.abs(value)), 0) === 0)) {
    return <span className="metricTrend trendSkeleton" aria-label="Loading trend" title="Loading trend" />;
  }
  const resolvedSignal = signal ?? trendSignal(values);
  const Icon = resolvedSignal.direction === "up" ? ArrowUpRight : resolvedSignal.direction === "down" ? ArrowDownRight : ArrowRight;
  const label = `${resolvedSignal.direction === "up" ? "Up" : resolvedSignal.direction === "down" ? "Down" : "Flat"} ${resolvedSignal.percent.toFixed(0)}%`;
  return (
    <span className={`metricTrend ${resolvedSignal.direction}`} aria-label={label} title={label}>
      <Icon size={17} strokeWidth={2.4} />
      {resolvedSignal.percent.toFixed(0)}%
    </span>
  );
}

function Module({ title, value, chartValues = [], hideChart = false, hideTrend = false, trendLoading = false, trendSignalOverride, page, setActivePage }: { hideChart?: boolean; hideTrend?: boolean; label: string; title: string; value: string; text: string; chartValues?: number[]; trendLoading?: boolean; trendSignalOverride?: { direction: "down" | "flat" | "up"; percent: number }; page?: PageKey; setActivePage?: (page: PageKey) => void }) {
  const content = <><span className="cardAccentRail" aria-hidden="true" />{hideTrend ? null : <TrendBadge loading={trendLoading} signal={trendSignalOverride} values={chartValues} />}<h2>{title}</h2><strong>{value}</strong>{hideChart ? null : <MiniChart values={chartValues} variant="line" title={`Open ${title} chart`} />}</>;
  const className = hideChart ? "panel moduleCard clickableCard noMiniChart" : "panel moduleCard clickableCard";
  if (page && setActivePage) return <LiquidGlass as="button" className={className} type="button" onClick={() => setActivePage(page)} aria-label={`Open ${title}`}>{content}</LiquidGlass>;
  return <LiquidGlass as="article" className={hideChart ? "panel moduleCard noMiniChart" : "panel moduleCard"}>{content}</LiquidGlass>;
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

function LandingPage({ totals, setActivePage }: { totals: { appCount: number; readyApps: number; socialCount: number; revenue: number; revenueRows: number; downloads: number; syncedApps: number; currency: string; downloadTrend: number[]; revenueTrend: number[]; subscriptionTrend: number[] }; setActivePage: (page: PageKey) => void }) {
  return (
    <>
      <LiquidGlass className="landingStage">
        <div className="landingCopy">
          <p className="caption">Operating system for mobile app studios</p>
          <h2>Run revenue, ASO, marketing and releases from one cockpit.</h2>
          <p>Connect App Store Connect once, map public social handles, then track the operating signals that decide whether an app is ready to scale.</p>
          <div className="landingActions">
            <button className="primaryButton" type="button" onClick={() => setActivePage("onboarding")}>Start setup</button>
          </div>
        </div>
        <button className="landingPreview" type="button" onClick={() => setActivePage("revenue")} aria-label="Open DriftOS dashboard preview">
          <span><b>{formatNumber(totals.appCount)}</b><small>Apps</small></span>
          <span><b>{formatCurrency(totals.revenue, totals.currency)}</b><small>Revenue</small></span>
          <span><b>{formatNumber(totals.downloads)}</b><small>Downloads</small></span>
          <MiniChart values={totals.revenueTrend.length ? totals.revenueTrend : [0, 14, 22, 41, 38, 55]} variant="area" title="Preview revenue chart" />
        </button>
      </LiquidGlass>
      <section className="moduleMatrix">
        <Module label="Revenue" title="Apple financials" value={totals.revenueRows ? "Live" : "Ready"} text="Revenue, subscriptions and geo revenue." chartValues={totals.revenueTrend} page="revenue" setActivePage={setActivePage} />
        <Module label="Marketing" title="ASO + social" value={formatNumber(totals.socialCount)} text="Metadata, creators, campaigns and acquisition." chartValues={[totals.socialCount, totals.syncedApps]} page="aso" setActivePage={setActivePage} />
        <Module label="Operations" title="Release control" value={totals.readyApps ? "Active" : "Setup"} text="Versions, quality gates, roadmap and tasks." chartValues={[totals.readyApps, totals.appCount]} page="releases" setActivePage={setActivePage} />
      </section>
    </>
  );
}

function OnboardingPage({ apps, socials, metrics, appFormCard, socialFormCard, syncError, setActivePage }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; appFormCard: ReactNode; socialFormCard: ReactNode; syncError: string; setActivePage: (page: PageKey) => void }) {
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
        <Module label="Next" title="Sync Apple" value={syncedApps ? "Done" : "Pending"} text="Run from Apps Portfolio." chartValues={[syncedApps, apps.length]} page="apps" setActivePage={setActivePage} />
        <Module label="Ready" title="Open revenue" value={syncedApps ? "Live" : "Setup"} text="Jump into Revenue." chartValues={[readyApps, syncedApps]} page="revenue" setActivePage={setActivePage} />
      </section>
    </>
  );
}

function AppForm({
  appForm,
  addApp,
  updateAppForm,
  setAppForm,
  open,
  setOpen,
}: {
  appForm: AppFormState;
  addApp: (event: FormEvent<HTMLFormElement>) => void;
  updateAppForm: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormState>>;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const hasAppleConnection = Boolean(appForm.credentialPreset || (appForm.keyId.trim() && appForm.issuerId.trim() && appForm.vendorNumber.trim() && appForm.appStoreId.trim() && appForm.privateKeyPath.trim()));
  const close = () => { setOpen(false); setStep(0); };
  const openWizard = () => { setStep(0); setOpen(true); };

  return (
    <>
      <div className="appPortfolioActions"><button className="primaryButton" type="button" onClick={openWizard}>+ Add app</button></div>
      {open ? (
        <div className="appWizardBackdrop" role="presentation">
          <form className="appWizard" onSubmit={addApp} role="dialog" aria-modal="true" aria-labelledby="app-wizard-title">
            <header>
              <div><p className="caption">New app</p><h2 id="app-wizard-title">{step === 0 ? "App identity" : step === 1 ? "Apple connection" : "Review"}</h2></div>
              <button className="iconButton" type="button" onClick={close} aria-label="Close app setup"><X size={20} strokeWidth={1.8} /></button>
            </header>
            <div className="appWizardProgress" aria-label={`Step ${step + 1} of 3`}>
              {["App", "Apple", "Review"].map((label, index) => <span className={index <= step ? "isActive" : ""} key={label}><i>{index + 1}</i><b>{label}</b></span>)}
            </div>
            <div className="appWizardViewport">
              {step === 0 ? (
                <section className="appWizardSlide">
                  <div className="appPresetGrid">
                    <button className="presetButton" type="button" onClick={() => setAppForm((value) => ({ ...value, ...knownApps.cocorise }))}><span className="appScopeAvatar">CO</span><span><strong>Use Cocorise</strong><small>Server Apple preset</small></span></button>
                    <button className="presetButton" type="button" onClick={() => setAppForm((value) => ({ ...value, ...knownApps.cortifree }))}><span className="appScopeAvatar">CF</span><span><strong>Use CortiFree</strong><small>Server Apple preset</small></span></button>
                  </div>
                  <div className="wizardFields twoCols">
                    <label><span>App name</span><input autoFocus name="name" placeholder="My app" value={appForm.name} onChange={updateAppForm} /></label>
                    <label><span>Platform</span><select name="platform" value={appForm.platform} onChange={updateAppForm}><option>iOS</option><option>Android</option></select></label>
                    <label><span>Bundle ID</span><input name="bundleId" placeholder="com.company.app" value={appForm.bundleId} onChange={updateAppForm} /></label>
                    <label><span>App Store ID</span><input name="appStoreId" placeholder="Optional" value={appForm.appStoreId} onChange={updateAppForm} /></label>
                    <label className="wideInput"><span>SKU</span><input name="sku" placeholder="Optional" value={appForm.sku} onChange={updateAppForm} /></label>
                  </div>
                </section>
              ) : step === 1 ? (
                <section className="appWizardSlide">
                  <div className="wizardOptional"><div><strong>App Store Connect</strong><small>{appForm.credentialPreset ? "Server preset selected for this app." : "Optional. You can connect it later from Integrations."}</small></div>{appForm.credentialPreset ? <span className="pill">Preset ready</span> : null}</div>
                  <div className="wizardFields twoCols">
                    <label><span>Key ID</span><input name="keyId" placeholder="10 characters" value={appForm.keyId} onChange={updateAppForm} /></label>
                    <label><span>Issuer ID</span><input name="issuerId" placeholder="UUID" value={appForm.issuerId} onChange={updateAppForm} /></label>
                    <label><span>Vendor Number</span><input name="vendorNumber" placeholder="Sales reports" value={appForm.vendorNumber} onChange={updateAppForm} /></label>
                    <label><span>.p8 filename</span><input name="privateKeyName" placeholder="AuthKey_XXXXXXXXXX.p8" value={appForm.privateKeyName} onChange={updateAppForm} /></label>
                    <label className="wideInput"><span>Local .p8 path</span><input name="privateKeyPath" placeholder="Optional local path" value={appForm.privateKeyPath} onChange={updateAppForm} /></label>
                  </div>
                </section>
              ) : (
                <section className="appWizardSlide reviewSlide">
                  <div className="reviewApp"><span className="appScopeAvatar">{appInitials(appForm.name)}</span><span><strong>{appForm.name || "Untitled app"}</strong><small>{appForm.bundleId || appForm.platform}</small></span></div>
                  <dl><div><dt>App Store ID</dt><dd>{appForm.appStoreId || "Not connected"}</dd></div><div><dt>SKU</dt><dd>{appForm.sku || "Not set"}</dd></div><div><dt>Apple data</dt><dd className={hasAppleConnection ? "statusOk" : "statusDraft"}>{hasAppleConnection ? "Ready to sync" : "Connect later"}</dd></div>{hasAppleConnection ? <div><dt>Credential</dt><dd>{appForm.credentialPreset ? "Server preset" : appForm.privateKeyName || "Manual key"}</dd></div> : null}</dl>
                </section>
              )}
            </div>
            <footer>
              <button className="ghostButton" type="button" onClick={step ? () => setStep((value) => value - 1) : close}>{step ? "Back" : "Cancel"}</button>
              <span>{step + 1} / 3</span>
              {step < 2 ? <button className="primaryButton" type="button" disabled={step === 0 && !appForm.name.trim()} onClick={() => setStep((value) => value + 1)}>{step === 1 && !hasAppleConnection ? "Skip for now" : "Continue"}</button> : <button className="primaryButton" type="submit" disabled={!appForm.name.trim()}>Create app</button>}
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

function SocialForm({ apps, socialForm, selectedAppId, addSocial, updateSocialForm }: { apps: StudioApp[]; socialForm: { platform: SocialAccount["platform"]; handle: string; appId: string }; selectedAppId: string; addSocial: (event: FormEvent<HTMLFormElement>) => void; updateSocialForm: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return <LiquidGlass as="form" className="panel formPanel" onSubmit={addSocial}><div className="panelHeader"><div><p className="caption">Social tracking</p><h2>Add a @handle</h2></div><span className="pill">Public</span></div><div className="formGrid"><select name="platform" value={socialForm.platform} onChange={updateSocialForm}><option>TikTok</option><option>Instagram</option><option>YouTube</option></select><input name="handle" placeholder="@creator or brand account" value={socialForm.handle} onChange={updateSocialForm} /><select name="appId" value={selectedAppId} onChange={updateSocialForm}>{apps.map((app) => <option value={app.id} key={app.id}>{appDisplayName(app.name)}</option>)}</select></div><button className="primaryButton" type="submit" disabled={!apps.length}>Add handle</button></LiquidGlass>;
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

function AnalyticsPage({ kind, apps, metrics, previousMetrics, previousPeriodAvailable, syncingAppId, syncError, setActivePage }: { kind: "revenue" | "acquisition" | "subscriptions"; apps: StudioApp[]; metrics: AppStoreMetric[]; previousMetrics: AppStoreMetric[]; previousPeriodAvailable: boolean; syncingAppId: string; syncError?: string; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const { currency, revenue, downloads, subscriptions } = analytics;
  const previousAnalytics = revenueAnalytics(previousMetrics);
  const trendKey = kind === "revenue" ? "revenue" : kind === "subscriptions" ? "subscriptions" : "downloads";
  const trend = aggregateTrend(metrics, trendKey);
  const title = kind === "revenue" ? "Revenue trend" : kind === "subscriptions" ? "Subscription trend" : "Acquisition trend";
  const primaryValue = kind === "revenue" ? formatCurrency(revenue, currency) : kind === "subscriptions" ? formatNumber(subscriptions) : formatNumber(downloads);
  const arpuTrend = aggregateArpuTrend(metrics);
  const revenueTrend = aggregateTrend(metrics, "revenue");
  const downloadsTrend = aggregateTrend(metrics, "downloads");
  const arpuValues = arpuTrend.map((point) => point.value);
  const hasPreviousPeriod = previousPeriodAvailable && previousMetrics.length > 0;
  const trendLoading = previousPeriodAvailable && !hasPreviousPeriod;
  const revenueSignal = hasPreviousPeriod ? periodTrendSignal(revenue, previousAnalytics.revenue, true) : undefined;
  const downloadsSignal = hasPreviousPeriod ? periodTrendSignal(downloads, previousAnalytics.downloads, true) : undefined;
  const arpuSignal = hasPreviousPeriod ? periodTrendSignal(analytics.averageRevenuePerUser ?? 0, previousAnalytics.averageRevenuePerUser ?? 0, true) : undefined;
  const readyApps = apps.filter(isAppSyncReady);
  const syncingApp = apps.find((app) => app.id === syncingAppId);

  if (!metrics.length) {
    if (syncingApp) return <AnalyticsSkeleton />;
    if (readyApps.length && syncError) return <LiquidGlass className="panel emptyPanel syncStatePanel"><h2>No data loaded for this period</h2><button className="ghostButton" type="button" onClick={() => setActivePage("apps")}>Open Apps</button></LiquidGlass>;
    if (readyApps.length) return <AnalyticsSkeleton />;
    return <LiquidGlass className="panel emptyPanel syncStatePanel"><h2>Connect an app</h2><button className="ghostButton" type="button" onClick={() => setActivePage("apps")}>Open Apps</button></LiquidGlass>;
  }

  return (
    <>
      <section className="moduleMatrix">
        <Module label="Revenue" title="Revenue" value={formatCurrency(revenue, currency)} text={revenueDetail(sumMetric(metrics, "revenueRows"), metrics.find((metric) => metric.revenueRows)?.revenueSource)} chartValues={revenueTrend} hideChart={kind === "acquisition"} hideTrend={kind === "acquisition"} trendLoading={trendLoading} trendSignalOverride={revenueSignal} page="revenue" setActivePage={setActivePage} />
        <Module label="Acquisition" title="Downloads" value={formatNumber(downloads)} text={`${metrics.length} synced apps.`} chartValues={downloadsTrend} hideChart={kind === "acquisition"} hideTrend={kind === "acquisition"} trendLoading={trendLoading} trendSignalOverride={downloadsSignal} page="acquisition" setActivePage={setActivePage} />
        <Module label="Monetization" title="ARPU" value={analytics.averageRevenuePerUser === null ? "—" : formatUnitCurrency(analytics.averageRevenuePerUser, currency)} text="Revenue / downloads." chartValues={arpuValues} hideChart={kind === "acquisition"} hideTrend={kind === "acquisition"} trendLoading={trendLoading} trendSignalOverride={arpuSignal} page="monetization" setActivePage={setActivePage} />
      </section>
      <TrendPanel title={title} value={primaryValue} detail={`${trendDelta(trend).toFixed(0)}% vs previous split`} points={aggregateTrendPoints(metrics, trendKey)} variant={kind === "revenue" ? "currency" : "number"} currency={currency} />
      {kind === "revenue" || kind === "subscriptions" ? <RevenueBreakdown analytics={analytics} /> : null}
      {kind === "revenue" ? <RevenueMap metrics={metrics} currency={currency} /> : null}
    </>
  );
}

function AnalyticsSkeleton() {
  return (
    <section className="analyticsSkeleton" aria-busy="true" aria-label="Loading Apple metrics">
      <div className="moduleMatrix skeletonMetricGrid">
        {[0, 1, 2].map((item) => <div className="skeletonMetric" key={item}><span className="skeletonLine skeletonLabel" /><span className="skeletonLine skeletonValue" /><span className="skeletonLine skeletonSpark" /></div>)}
      </div>
      <div className="skeletonTrendPanel"><span className="skeletonLine skeletonCaption" /><span className="skeletonLine skeletonTitle" /><div className="skeletonChart"><i /><i /><i /><i /></div></div>
    </section>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <span className={`skeletonLine ${className}`} aria-hidden="true" />;
}

function RankingSkeletonBadges() {
  return <span className="rankingSkeletonBadges" aria-label="Loading rankings">{Array.from({ length: 5 }, (_, index) => <SkeletonLine className="rankingSkeletonBadge" key={index} />)}</span>;
}

function AsoTableSkeleton({ rows = 14 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <div className="asoRow asoSkeletonRow" aria-hidden="true" key={`aso-skeleton-${index}`}>
          <SkeletonLine className="asoCellSkeleton keyword" />
          <SkeletonLine className="asoCellSkeleton tiny" />
          <SkeletonLine className="asoCellSkeleton short" />
          <SkeletonLine className="asoCellSkeleton store" />
          <SkeletonLine className="asoCellSkeleton bar" />
          <SkeletonLine className="asoCellSkeleton bar" />
          <SkeletonLine className="asoCellSkeleton trend" />
          <SkeletonLine className="asoCellSkeleton tiny" />
          <RankingSkeletonBadges />
        </div>
      ))}
    </>
  );
}

function MonetizationPage({ apps, metrics, isSyncing, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; isSyncing: boolean; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const products = analytics.monetizedUnits;
  const paidConversion = analytics.downloads ? (products / analytics.downloads) * 100 : 0;
  const appRows = monetizationAppRows(apps, metrics);
  const countryRows = aggregateCountries(metrics)
    .filter((country) => country.downloads || country.revenue || country.proceedsUnits)
    .sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue) || b.downloads - a.downloads)
    .slice(0, 8);
  const proceedsTrend = aggregateMonetizationTrendPoints(metrics, "proceeds");
  const conversionTrend = aggregateMonetizationTrendPoints(metrics, "conversion");
  const selectedTrend = analytics.revenue > 0 ? proceedsTrend : conversionTrend;
  const trendTitle = analytics.revenue > 0 ? "Revenue trend" : "Paid conversion trend";
  const trendValue = analytics.revenue > 0 ? formatCurrency(analytics.revenue, analytics.currency) : `${paidConversion.toFixed(1)}%`;

  if (!metrics.length && isSyncing) return <AnalyticsSkeleton />;

  if (!metrics.length) {
    return <LiquidGlass className="panel emptyPanel syncStatePanel"><h2>Connect Apple metrics</h2><button className="ghostButton" type="button" onClick={() => setActivePage("apps")}>Open Apps</button></LiquidGlass>;
  }

  return (
    <>
      <section className="monetizationHero">
        <LiquidGlass className="panel monetizationCommandCard">
          <p className="caption">Monetization engine</p>
          <div className="monetizationCommandMain">
            <span><strong>{formatCurrency(analytics.revenue, analytics.currency)}</strong><small>Revenue</small></span>
            <span><strong>{paidConversion.toFixed(1)}%</strong><small>Install to paid</small></span>
          </div>
          <div className="monetizationCommandRail">
            <FunnelStep label="Downloads" value={analytics.downloads} max={Math.max(analytics.downloads, products, 1)} />
            <FunnelStep label="Paid units" value={products} max={Math.max(analytics.downloads, products, 1)} />
            <FunnelStep label="Subscriptions" value={analytics.subscriptions} max={Math.max(products, 1)} />
            <FunnelStep label="IAP" value={analytics.inAppPurchases} max={Math.max(products, 1)} />
          </div>
        </LiquidGlass>

        <div className="monetizationScoreGrid">
          <MonetizationScoreCard title="ARPU" value={formatUnitCurrency(analytics.averageRevenuePerDownload, analytics.currency)} detail={`${formatNumber(analytics.downloads)} downloads`} values={aggregateMonetizationTrendPoints(metrics, "arpu").map((point) => point.value)} onClick={() => setActivePage("revenue")} />
          <MonetizationScoreCard title="Sub share" value={`${analytics.subscriptionShare.toFixed(0)}%`} detail={`${formatNumber(analytics.subscriptions)} subs`} values={[analytics.inAppPurchases, analytics.subscriptions]} onClick={() => setActivePage("subscriptions")} />
          <MonetizationScoreCard title="Paid rows" value={formatNumber(analytics.revenueRows)} detail={analytics.financeRows ? "Financial live" : "Sales report"} values={aggregateMonetizationTrendPoints(metrics, "paidUnits").map((point) => point.value)} onClick={() => setActivePage("paywall")} />
        </div>
      </section>

      <TrendPanel title={trendTitle} value={trendValue} detail={`${trendDelta(selectedTrend.map((point) => point.value)).toFixed(0)}% vs previous split`} points={selectedTrend} variant={analytics.revenue > 0 ? "currency" : "number"} currency={analytics.currency} />

      <section className="monetizationGrid">
        <LiquidGlass className="panel dataPanel monetizationTablePanel">
          <div className="panelHeader"><div><p className="caption">Apps</p><h2>Unit economics</h2></div><span className="pill">{appRows.length} apps</span></div>
          <div className="monetizationRows">
            {appRows.map((row) => (
              <button className="monetizationRow" type="button" onClick={() => setActivePage("revenue")} key={`monetization-${row.app.id}`}>
                <AppAvatar app={row.app} className="appScopeAvatar" />
                <strong title={row.app.name}>{appDisplayName(row.app.name)}</strong>
                <span>{formatCurrency(row.revenue, row.currency)}</span>
                <span>{formatUnitCurrency(row.arpu, row.currency)} ARPU</span>
                <em>{row.conversion.toFixed(1)}% CVR</em>
              </button>
            ))}
          </div>
        </LiquidGlass>

        <LiquidGlass className="panel dataPanel monetizationTablePanel">
          <div className="panelHeader"><div><p className="caption">Countries</p><h2>Where money converts</h2></div><span className="pill">{countryRows.length} live</span></div>
          <div className="monetizationRows">
            {countryRows.length ? countryRows.map((country) => {
              const cvr = country.downloads ? (country.proceedsUnits / country.downloads) * 100 : 0;
              return (
                <button className="monetizationRow countryMonetizationRow" type="button" onClick={() => setActivePage("geoRevenue")} key={`country-monetization-${country.country}`}>
                  <b>{countryFlag(country.country)}</b>
                  <strong>{countryName(country.country)}</strong>
                  <span>{formatCurrency(country.revenue, analytics.currency)}</span>
                  <span>{formatNumber(country.downloads)} downloads</span>
                  <em>{cvr.toFixed(1)}% CVR</em>
                </button>
              );
            }) : <p className="settingsEmpty">No country revenue yet.</p>}
          </div>
        </LiquidGlass>
      </section>

      <LiquidGlass className="panel dataPanel monetizationActionPanel">
        <div className="panelHeader"><div><p className="caption">Actions</p><h2>What to improve</h2></div><span className="pill">{analytics.health}/5 signals</span></div>
        <div className="monetizationActions">
          <button type="button" onClick={() => setActivePage("paywall")}><strong>Paywall CVR</strong><span>{paidConversion > 0 ? `${paidConversion.toFixed(1)}% install to paid` : "No paid starts detected"}</span></button>
          <button type="button" onClick={() => setActivePage("subscriptions")}><strong>Subscription engine</strong><span>{analytics.subscriptions ? `${formatNumber(analytics.subscriptions)} subscription units` : "No subscription signal"}</span></button>
          <button type="button" onClick={() => setActivePage("geoRevenue")}><strong>Geo expansion</strong><span>{countryRows[0] ? `${countryName(countryRows[0].country)} leads` : "No country split yet"}</span></button>
        </div>
      </LiquidGlass>
    </>
  );
}

function FunnelStep({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(3, Math.min(100, (value / Math.max(max, 1)) * 100));
  return <div className="funnelStep"><span><strong>{label}</strong><em>{formatNumber(value)}</em></span><i><b style={{ width: `${width}%` }} /></i></div>;
}

function MonetizationScoreCard({ title, value, detail, values, onClick }: { title: string; value: string; detail: string; values: number[]; onClick: () => void }) {
  return (
    <LiquidGlass as="button" className="panel monetizationScoreCard clickableCard" type="button" onClick={onClick}>
      <TrendBadge values={values} />
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <MiniChart values={values} variant="area" title={`${title} trend`} />
    </LiquidGlass>
  );
}

function SubscriptionsPage({ apps, metrics, isSyncing, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; isSyncing: boolean; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const appRows = subscriptionAppRows(apps, metrics);
  const cohorts = subscriptionCohorts(metrics).slice(-10);
  const subscriptionTrend = aggregateTrendPoints(metrics, "subscriptions");
  const maxSubs = Math.max(...cohorts.map((row) => row.subscriptions), 1);
  const subscriptionArpu = analytics.subscriptions ? analytics.revenue / analytics.subscriptions : 0;
  const conversion = analytics.downloads ? (analytics.subscriptions / analytics.downloads) * 100 : 0;

  if (!metrics.length && isSyncing) return <AnalyticsSkeleton />;

  if (!metrics.length) {
    return <LiquidGlass className="panel emptyPanel syncStatePanel"><h2>Connect subscription data</h2><button className="ghostButton" type="button" onClick={() => setActivePage("apps")}>Open Apps</button></LiquidGlass>;
  }

  return (
    <>
      <section className="moduleMatrix subscriptionKpis">
        <Module label="Subscriptions" title="New subs" value={formatNumber(analytics.subscriptions)} text="" chartValues={subscriptionTrend.map((point) => point.value)} page="subscriptions" setActivePage={setActivePage} />
        <Module label="Subscriptions" title="Sub ARPU" value={formatUnitCurrency(subscriptionArpu, analytics.currency)} text="" chartValues={cohorts.map((row) => row.revenuePerSub)} page="revenue" setActivePage={setActivePage} />
        <Module label="Subscriptions" title="Sub CVR" value={`${conversion.toFixed(1)}%`} text="" chartValues={cohorts.map((row) => row.conversion)} page="paywall" setActivePage={setActivePage} />
        <Module label="Subscriptions" title="Sub share" value={`${analytics.subscriptionShare.toFixed(0)}%`} text="" chartValues={[analytics.inAppPurchases, analytics.subscriptions]} page="monetization" setActivePage={setActivePage} />
      </section>

      <TrendPanel title="Subscription trend" value={formatNumber(analytics.subscriptions)} detail={`${trendDelta(subscriptionTrend.map((point) => point.value)).toFixed(0)}% vs previous split`} points={subscriptionTrend} variant="number" currency={analytics.currency} />

      <section className="subscriptionGrid">
        <LiquidGlass className="panel dataPanel subscriptionLifecyclePanel">
          <div className="panelHeader"><div><p className="caption">Lifecycle</p><h2>Subscription health</h2></div><span className="pill">Apple sales</span></div>
          <div className="subscriptionLifecycle">
            <LifecycleMetric label="New subs" value={formatNumber(analytics.subscriptions)} state="Live" />
            <LifecycleMetric label="Trials" value="Connect RevenueCat" state="Pending" />
            <LifecycleMetric label="Cancellations" value="Connect RevenueCat" state="Pending" />
            <LifecycleMetric label="Refunds" value={analytics.revenueRows ? "Included in revenue" : "Pending"} state={analytics.revenueRows ? "Live" : "Pending"} />
          </div>
        </LiquidGlass>

        <LiquidGlass className="panel dataPanel subscriptionLifecyclePanel">
          <div className="panelHeader"><div><p className="caption">Cohorts</p><h2>Recent periods</h2></div><span className="pill">{cohorts.length} rows</span></div>
          <div className="subscriptionCohorts">
            {cohorts.length ? cohorts.map((row) => (
              <div className="subscriptionCohort" key={`cohort-${row.label}`}>
                <span><strong>{row.label}</strong><em>{formatNumber(row.subscriptions)} subs</em></span>
                <i><b style={{ width: `${Math.max(3, (row.subscriptions / maxSubs) * 100)}%` }} /></i>
                <small>{formatUnitCurrency(row.revenuePerSub, analytics.currency)} per sub · {row.conversion.toFixed(1)}% CVR</small>
              </div>
            )) : <p className="settingsEmpty">No subscription periods yet.</p>}
          </div>
        </LiquidGlass>
      </section>

      <LiquidGlass className="panel dataPanel subscriptionTablePanel">
        <div className="panelHeader"><div><p className="caption">Apps</p><h2>Subscription performance</h2></div><span className="pill">{appRows.length} apps</span></div>
        <div className="subscriptionRows">
          {appRows.map((row) => (
            <button className="subscriptionRow" type="button" onClick={() => setActivePage("paywall")} key={`subs-${row.app.id}`}>
              <AppAvatar app={row.app} className="appScopeAvatar" />
              <strong title={row.app.name}>{appDisplayName(row.app.name)}</strong>
              <span>{formatNumber(row.subscriptions)} new subs</span>
              <span>{formatUnitCurrency(row.revenuePerSub, row.currency)} per sub</span>
              <em>{row.paidShare.toFixed(0)}% paid mix</em>
            </button>
          ))}
        </div>
      </LiquidGlass>

      <LiquidGlass className="panel dataPanel subscriptionActionPanel">
        <div className="panelHeader"><div><p className="caption">Next</p><h2>What this page needs</h2></div><span className="pill">RevenueCat first</span></div>
        <div className="monetizationActions">
          <button type="button" onClick={() => setActivePage("integrations")}><strong>RevenueCat connection</strong><span>Needed for active subs, trials, churn and cancellations.</span></button>
          <button type="button" onClick={() => setActivePage("paywall")}><strong>Trial conversion</strong><span>Use paywall events once RevenueCat is connected.</span></button>
          <button type="button" onClick={() => setActivePage("revenue")}><strong>Revenue audit</strong><span>{analytics.revenueRows ? `${formatNumber(analytics.revenueRows)} paid rows synced` : "No paid rows yet"}</span></button>
        </div>
      </LiquidGlass>
    </>
  );
}

function LifecycleMetric({ label, value, state }: { label: string; value: string; state: "Live" | "Pending" }) {
  return <div className="lifecycleMetric"><span>{label}</span><strong>{value}</strong><em className={state === "Live" ? "statusOk" : "statusDraft"}>{state}</em></div>;
}

function PaywallPage({ apps, metrics, isSyncing, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; isSyncing: boolean; setActivePage: (page: PageKey) => void }) {
  const analytics = revenueAnalytics(metrics);
  const starts = analytics.subscriptions + analytics.inAppPurchases;
  const paidConversion = analytics.downloads ? (starts / analytics.downloads) * 100 : 0;
  const paywallYield = analytics.downloads ? analytics.revenue / analytics.downloads : 0;
  const appRows = monetizationAppRows(apps, metrics);
  const countryRows = aggregateCountries(metrics)
    .filter((country) => country.downloads || country.proceedsUnits || country.revenue)
    .sort((a, b) => (b.downloads ? b.proceedsUnits / b.downloads : 0) - (a.downloads ? a.proceedsUnits / a.downloads : 0) || b.proceedsUnits - a.proceedsUnits)
    .slice(0, 6);
  const paidTrend = aggregateMonetizationTrendPoints(metrics, "paidUnits");
  const conversionTrend = aggregateMonetizationTrendPoints(metrics, "conversion");

  if (!metrics.length && isSyncing) return <AnalyticsSkeleton />;

  if (!metrics.length) {
    return <LiquidGlass className="panel emptyPanel syncStatePanel"><h2>Connect paywall data</h2><button className="ghostButton" type="button" onClick={() => setActivePage("apps")}>Open Apps</button></LiquidGlass>;
  }

  return (
    <>
      <section className="paywallHero">
        <LiquidGlass className="panel paywallGateCard">
          <div><p className="caption">Paywall gate</p><h2>Install to paid</h2></div>
          <strong>{paidConversion.toFixed(1)}%</strong>
          <div className="paywallGateStats">
            <span><b>{formatNumber(analytics.downloads)}</b><small>Downloads</small></span>
            <ArrowRight size={19} strokeWidth={1.9} />
            <span><b>{formatNumber(starts)}</b><small>Paid starts</small></span>
            <ArrowRight size={19} strokeWidth={1.9} />
            <span><b>{formatCurrency(analytics.revenue, analytics.currency)}</b><small>Revenue</small></span>
          </div>
          <MiniChart values={conversionTrend.map((point) => point.value)} variant="area" title="Paywall conversion trend" />
        </LiquidGlass>

        <div className="paywallSignalGrid">
          <PaywallSignal title="Yield" value={formatUnitCurrency(paywallYield, analytics.currency)} detail="Per download" ok={paywallYield > 0} />
          <PaywallSignal title="Products" value={formatNumber(starts)} detail={`${formatNumber(analytics.subscriptions)} subs · ${formatNumber(analytics.inAppPurchases)} IAP`} ok={starts > 0} />
          <PaywallSignal title="Events" value="Connect" detail="Superwall impressions/taps" ok={false} />
        </div>
      </section>

      <TrendPanel title="Paid starts trend" value={formatNumber(starts)} detail={`${trendDelta(paidTrend.map((point) => point.value)).toFixed(0)}% vs previous split`} points={paidTrend} variant="number" currency={analytics.currency} />

      <section className="paywallGrid">
        <LiquidGlass className="panel dataPanel paywallMixPanel">
          <div className="panelHeader"><div><p className="caption">Product mix</p><h2>What sells</h2></div><span className="pill">{formatNumber(starts)} units</span></div>
          <div className="paywallMix">
            <FunnelStep label="Subscriptions" value={analytics.subscriptions} max={Math.max(starts, 1)} />
            <FunnelStep label="IAP" value={analytics.inAppPurchases} max={Math.max(starts, 1)} />
            <FunnelStep label="No paid start" value={Math.max(0, analytics.downloads - starts)} max={Math.max(analytics.downloads, 1)} />
          </div>
        </LiquidGlass>

        <LiquidGlass className="panel dataPanel paywallReadinessPanel">
          <div className="panelHeader"><div><p className="caption">Readiness</p><h2>Tracking coverage</h2></div><span className="pill">{analytics.revenueRows ? "Apple live" : "Pending"}</span></div>
          <div className="revenueChecks">
            <CheckRow label="Apple paid starts" value={starts ? formatNumber(starts) : "None"} ok={starts > 0} />
            <CheckRow label="Revenue" value={analytics.revenueRows ? formatCurrency(analytics.revenue, analytics.currency) : "Missing"} ok={analytics.revenueRows > 0} />
            <CheckRow label="Paywall impressions" value="Connect Superwall" ok={false} />
            <CheckRow label="Trial lifecycle" value="Connect RevenueCat" ok={false} />
          </div>
        </LiquidGlass>
      </section>

      <section className="paywallGrid">
        <LiquidGlass className="panel dataPanel monetizationTablePanel">
          <div className="panelHeader"><div><p className="caption">Apps</p><h2>Paywall performance</h2></div><span className="pill">{appRows.length} apps</span></div>
          <div className="monetizationRows">
            {appRows.map((row) => (
              <button className="monetizationRow" type="button" onClick={() => setActivePage("monetization")} key={`paywall-app-${row.app.id}`}>
                <AppAvatar app={row.app} className="appScopeAvatar" />
                <strong title={row.app.name}>{appDisplayName(row.app.name)}</strong>
                <span>{row.conversion.toFixed(1)}% CVR</span>
                <span>{formatNumber(row.paidUnits)} starts</span>
                <em>{formatUnitCurrency(row.arpu, row.currency)}</em>
              </button>
            ))}
          </div>
        </LiquidGlass>

        <LiquidGlass className="panel dataPanel monetizationTablePanel">
          <div className="panelHeader"><div><p className="caption">Countries</p><h2>Best paid intent</h2></div><span className="pill">{countryRows.length} markets</span></div>
          <div className="monetizationRows">
            {countryRows.length ? countryRows.map((country) => {
              const cvr = country.downloads ? (country.proceedsUnits / country.downloads) * 100 : 0;
              return (
                <button className="monetizationRow countryMonetizationRow" type="button" onClick={() => setActivePage("geoRevenue")} key={`paywall-country-${country.country}`}>
                  <b>{countryFlag(country.country)}</b>
                  <strong>{countryName(country.country)}</strong>
                  <span>{cvr.toFixed(1)}% CVR</span>
                  <span>{formatNumber(country.proceedsUnits)} paid</span>
                  <em>{formatNumber(country.downloads)} dl</em>
                </button>
              );
            }) : <p className="settingsEmpty">No country conversion yet.</p>}
          </div>
        </LiquidGlass>
      </section>

      <LiquidGlass className="panel dataPanel monetizationActionPanel">
        <div className="panelHeader"><div><p className="caption">Actions</p><h2>Conversion work</h2></div><span className="pill">Next tests</span></div>
        <div className="monetizationActions">
          <button type="button" onClick={() => setActivePage("integrations")}><strong>Connect Superwall</strong><span>Unlock impressions, CTA taps and paywall-level CVR.</span></button>
          <button type="button" onClick={() => setActivePage("subscriptions")}><strong>Watch trials</strong><span>Track trial starts, conversions and cancellations.</span></button>
          <button type="button" onClick={() => setActivePage("geoRevenue")}><strong>Localize offers</strong><span>{countryRows[0] ? `${countryName(countryRows[0].country)} has the strongest paid intent.` : "Needs country data."}</span></button>
        </div>
      </LiquidGlass>
    </>
  );
}

function PaywallSignal({ title, value, detail, ok }: { title: string; value: string; detail: string; ok: boolean }) {
  return <LiquidGlass className={`panel paywallSignal ${ok ? "isReady" : ""}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></LiquidGlass>;
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
  return <section className="moduleMatrix"><Module label="Portfolio" title="Apps live" value={formatNumber(apps.length)} text="Configured apps." chartValues={[apps.length]} page="apps" setActivePage={setActivePage} /><Module label="Activation" title="Paid conversion" value={`${conversion.toFixed(1)}%`} text="Monetized units / downloads." chartValues={[downloads, monetizedUnits]} page="monetization" setActivePage={setActivePage} /><Module label="Revenue" title="Revenue" value={formatCurrency(sumMetric(metrics, "revenue"), normalizeCurrency(metrics.find((metric) => metric.currency)?.currency))} text="Apple monetization signal." chartValues={aggregateTrend(metrics, "revenue")} page="revenue" setActivePage={setActivePage} /></section>;
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
        <div className="table"><div className="tableRow tableHead"><span>App</span><span>Version</span><span>Platform</span><span>State</span><span>Versions</span><span>Readiness</span></div>{ops.releases.length ? ops.releases.map((item) => <div className="tableRow sixCols" key={`release-${item.appName}`}><span className="appCell"><b>{appInitials(item.appName)}</b><strong title={item.appName}>{appDisplayName(item.appName)}</strong><small>{item.bundleId}</small></span><span>{item.release?.latestVersion ?? "Unknown"}</span><span>{item.release?.platform ?? "Unknown"}</span><span>{(item.release?.state ?? item.state) || "Unknown"}</span><span>{formatNumber(item.release?.versionCount ?? 0)}</span><span><b className={item.release?.readyForSale ? "statusOk" : "statusDraft"}>{item.release?.readyForSale ? "Live" : item.release?.editable ? "Editable" : "Review needed"}</b></span></div>) : <div className="tableRow sixCols"><span>No release data</span><span>Sync Apple</span><span>Pending</span><span>Pending</span><span>0</span><span><b className="statusDraft">Waiting</b></span></div>}</div>
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
  const [manualKeywordsByCountry, setManualKeywordsByCountry] = useState<AsoKeywordStorage>({});
  const [searchResults, setSearchResults] = useState<AsoSearchResult[]>([]);
  const [resultsCache, setResultsCache] = useState<Record<string, AsoCacheEntry>>({});
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
  const appleSearchCountry = selectedCountry === "WORLD" ? "US" : selectedCountry;
  const keywordCountryKey = asoKeywordCountryKey(selectedCountry);
  const manualKeywords = useMemo(
    () => manualKeywordsByCountry[keywordCountryKey] ?? [],
    [keywordCountryKey, manualKeywordsByCountry],
  );
  const rows = useMemo(() => {
    const manualRows = manualKeywords.map((keyword) => buildAsoKeywordRow(keyword, appleSearchCountry, "manual"));
    const manualKeys = new Set(manualRows.map((row) => row.keyword.toLowerCase()));
    return [...manualRows, ...metadataRows.filter((row) => !manualKeys.has(row.keyword.toLowerCase()))].slice(0, 80);
  }, [appleSearchCountry, manualKeywords, metadataRows]);
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

  const rankingKey = useCallback((keyword: string) => `${appleSearchCountry}:${keyword.trim().toLowerCase()}`, [appleSearchCountry]);
  const currentKeyword = (keywordQuery || selectedKeyword || rows[0]?.keyword || selectedApp?.name || "").trim();
  const currentCacheEntry = currentKeyword ? resultsCache[rankingKey(currentKeyword)] : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(ASO_KEYWORD_STORAGE) || "[]") as unknown;
        manualKeywordsLoadedRef.current = true;
        if (Array.isArray(stored)) {
          const migrated = stored.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0).slice(0, 80);
          setManualKeywordsByCountry(migrated.length ? { [keywordCountryKey]: migrated } : {});
        } else if (stored && typeof stored === "object") {
          const nextStorage: AsoKeywordStorage = {};
          for (const [country, value] of Object.entries(stored as Record<string, unknown>)) {
            if (!Array.isArray(value)) continue;
            const normalizedCountry = asoKeywordCountryKey(country.toUpperCase());
            const keywords = value.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0).slice(0, 80);
            if (keywords.length) nextStorage[normalizedCountry] = keywords;
          }
          setManualKeywordsByCountry(nextStorage);
        }
      } catch {
        manualKeywordsLoadedRef.current = true;
        setManualKeywordsByCountry({});
      }
      try {
        const storedResults = JSON.parse(window.localStorage.getItem(ASO_RESULTS_STORAGE) || "{}") as unknown;
        if (storedResults && typeof storedResults === "object" && !Array.isArray(storedResults)) {
          const nextCache: Record<string, AsoCacheEntry> = {};
          for (const [key, value] of Object.entries(storedResults as Record<string, unknown>)) {
            if (!value || typeof value !== "object") continue;
            const entry = value as Partial<AsoCacheEntry>;
            if (typeof entry.refreshedAt !== "string" || !Array.isArray(entry.results)) continue;
            nextCache[key] = {
              refreshedAt: entry.refreshedAt,
              results: entry.results.filter((result): result is AsoSearchResult => !!result && typeof result === "object" && typeof (result as AsoSearchResult).appId === "string"),
            };
          }
          setResultsCache(nextCache);
        }
      } catch {
        setResultsCache({});
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [keywordCountryKey]);

  useEffect(() => {
    if (!manualKeywordsLoadedRef.current) return;
    window.localStorage.setItem(ASO_KEYWORD_STORAGE, JSON.stringify(manualKeywordsByCountry));
  }, [manualKeywordsByCountry]);

  useEffect(() => {
    window.localStorage.setItem(ASO_RESULTS_STORAGE, JSON.stringify(resultsCache));
  }, [resultsCache]);

  const fetchAsoResults = useCallback(async (keyword: string, options: { silent?: boolean } = {}) => {
    const term = keyword.trim();
    if (!term) return [];
    const key = rankingKey(term);
    const cached = resultsCache[key];
    if (asoWasRefreshedToday(cached)) {
      if (!options.silent) {
        setAsoError("");
        setSelectedKeyword(term);
        setSearchResults(cached.results);
      }
      return cached.results;
    }
    if (!options.silent) {
      setAsoLoading(true);
      setAsoError("");
      setSelectedKeyword(term);
    }
    try {
      const response = await fetch(`/api/apple-search?term=${encodeURIComponent(term)}&country=${encodeURIComponent(appleSearchCountry)}&limit=5`);
      const payload = await response.json() as { ok?: boolean; results?: AsoSearchResult[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Apple Search unavailable.");
      const results = payload.results ?? [];
      setResultsCache((current) => ({ ...current, [key]: { refreshedAt: new Date().toISOString(), results } }));
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
  }, [appleSearchCountry, rankingKey, resultsCache]);

  const refreshVisibleKeywords = useCallback(async () => {
    const targets = Array.from(new Set([currentKeyword, ...visibleRows.slice(0, 18).map((row) => row.keyword)].filter(Boolean)));
    if (!targets.length) return;
    setAsoLoading(true);
    setAsoError("");
    try {
      for (const keyword of targets) await fetchAsoResults(keyword, { silent: keyword !== currentKeyword });
    } finally {
      setAsoLoading(false);
    }
  }, [currentKeyword, fetchAsoResults, visibleRows]);

  const addKeywords = useCallback((value: string | string[]) => {
    const nextKeywords = Array.isArray(value) ? value.map((keyword) => keyword.trim().replace(/\s+/g, " ")).filter(Boolean) : parseKeywordInput(value);
    if (!nextKeywords.length) return;
    manualKeywordsLoadedRef.current = true;
    setManualKeywordsByCountry((currentStorage) => {
      const current = currentStorage[keywordCountryKey] ?? [];
      const merged = new Map<string, string>();
      for (const keyword of nextKeywords) merged.set(keyword.toLowerCase(), keyword);
      for (const keyword of current) merged.set(keyword.toLowerCase(), keyword);
      return { ...currentStorage, [keywordCountryKey]: Array.from(merged.values()).slice(0, 80) };
    });
    const next = nextKeywords[0];
    setKeywordQuery(next);
    setSelectedKeyword(next);
    setKeywordModalOpen(false);
    setSearchResults(resultsCache[rankingKey(next)]?.results ?? []);
  }, [keywordCountryKey, rankingKey, resultsCache]);

  const addKeyword = () => addKeywords(draftKeywords);

  const inspectKeyword = (keyword: string) => {
    setKeywordQuery(keyword);
    setSelectedKeyword(keyword);
    setSearchResults(resultsCache[rankingKey(keyword)]?.results ?? []);
  };

  const openRankedApp = (result: AsoSearchResult) => {
    window.open(`https://apps.apple.com/app/id${result.appId}`, "_blank", "noopener,noreferrer");
  };

  const selectedCountryLabel = selectedCountry === "WORLD" ? "All" : countryName(selectedCountry);
  const showAsoTableSkeleton = asoLoading && !Object.keys(resultsCache).length;

  if (!analytics.snapshots.length && !rows.length) {
    return <><section className="moduleMatrix"><Module label="ASO" title="Metadata" value="Pending" text="Run Apple sync." chartValues={[]} page="apps" setActivePage={setActivePage} /><Module label="Portfolio" title="Apps" value={formatNumber(apps.length)} text="Ready for Apple metadata." chartValues={[apps.length]} page="apps" setActivePage={setActivePage} /><Module label="Keywords" title="Coverage" value="0" text="No keywords synced." chartValues={[]} /></section><EmptyPanel title="No ASO metadata yet" text="Sync an App Store app to pull title, subtitle, keywords, descriptions and localizations." /></>;
  }
  return (
    <section className="asoWorkspace">
      <section className="asoMain">
        <div className="asoCommandBar">
          <button type="button" className={asoLoading ? "asoCircleButton isLoading" : "asoCircleButton"} aria-label="Refresh Apple Search rankings" title={asoWasRefreshedToday(currentCacheEntry) ? "Already refreshed today" : "Refresh Apple Search rankings"} onClick={refreshVisibleKeywords}>↻</button>
          <button type="button" className="asoFilterButton" onClick={() => inspectKeyword(rows[0]?.keyword ?? selectedApp?.name ?? "")}>Keywords⌄</button>
          <div className="asoPopoverAnchor">
            <button type="button" className="asoStoreButton" onClick={() => setCountryPickerOpen((open) => !open)}>{selectedCountry === "WORLD" ? "🌍" : countryFlag(selectedCountry)} {selectedCountryLabel}</button>
            {countryPickerOpen ? <AsoCountryPicker countries={countryRows} selectedCountry={selectedCountry} onSelect={(country) => { setSelectedCountry(country); setCountryPickerOpen(false); }} /> : null}
          </div>
          <span />
          <button type="button" className="asoPrimaryButton" onClick={() => { setDraftKeywords(keywordQuery); setKeywordModalOpen(true); }}>Add Keywords <span>+</span></button>
          <button type="button" className="asoSuggestionButton" onClick={() => setSuggestionModalOpen(true)}>{Math.max(2, Math.min(9, suggestions.length))} Suggestions</button>
          <button type="button" className="asoIconButton" aria-label="Open app setup" onClick={() => setActivePage("apps")}>⌑</button>
          <button type="button" className="asoFilterButton" onClick={refreshVisibleKeywords}>Last 7 days⌄</button>
          <button type="button" className="asoIconButton" aria-label="More">•••</button>
          <form className="asoSearchForm" onSubmit={(event) => { event.preventDefault(); inspectKeyword(keywordQuery); }}>
            <input className="asoSearch" value={keywordQuery} onChange={(event) => setKeywordQuery(event.target.value)} placeholder="Search keyword" aria-label="Search ASO keywords" />
          </form>
        </div>
        <div className="asoTable">
          <div className="asoRow asoHead"><span>Keyword</span><span>Notes</span><span>Last update</span><span>Store</span><span>Popularity</span><span>Difficulty</span><span>Trend</span><span>Position</span><span>Apps in Ranking</span></div>
          {showAsoTableSkeleton ? <AsoTableSkeleton /> : visibleRows.map((row) => {
            const rowCacheEntry = resultsCache[rankingKey(row.keyword)];
            const rowResults = rowCacheEntry?.results ?? [];
            const matchingApp = selectedApp?.appStoreId ? rowResults.find((result) => result.appId === selectedApp.appStoreId) : undefined;
            const position = matchingApp?.rank ?? "-";
            return (
              <div className={selectedKeyword === row.keyword ? "asoRow isSelected" : "asoRow"} role="button" tabIndex={0} onClick={() => inspectKeyword(row.keyword)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inspectKeyword(row.keyword); }} key={`${row.keyword}-${row.store}`} aria-label={`Inspect keyword ${row.keyword}`}>
                <strong>{row.keyword}</strong>
                <span>{row.source === "manual" ? "Manual" : ""}</span>
                <span>{formatAsoUpdatedAt(rowCacheEntry?.refreshedAt)}</span>
                <span>{countryFlag(selectedCountry === "WORLD" ? row.store : selectedCountry)} {selectedCountry === "WORLD" ? countryName(row.store) : selectedCountryLabel}</span>
                <span className={row.popularity < 18 ? "scoreBar low" : "scoreBar"}><em>{row.popularity}</em><i><b style={{ width: `${row.popularity}%` }} /></i></span>
                <span className={row.difficulty > 68 ? "scoreBar hard" : row.difficulty < 18 ? "scoreBar easy" : "scoreBar"}><em>{row.difficulty}</em><i><b style={{ width: `${row.difficulty}%` }} /></i></span>
                <button type="button" className={row.trend > 0 ? "asoTrend up" : row.trend < 0 ? "asoTrend down" : "asoTrend flat"} onClick={(event) => { event.stopPropagation(); setSelectedKeyword(row.keyword); setTrendModalOpen(true); }}><em>{row.trend > 0 ? `+${row.trend * 9}` : row.trend < 0 ? row.trend * 9 : "±0"}</em><AsoSparkline trend={row.trend} /></button>
                <span className="asoPosition">{position === 1 ? "🥇 1" : `# ${position}`}</span>
                <span className="rankingApps">{rowResults.length ? rowResults.slice(0, 5).map((result, appIndex) => <button type="button" className={`appBadge tone${appIndex % 6}`} title={`${result.rank}. ${result.name}`} onClick={(event) => { event.stopPropagation(); setSelectedKeyword(row.keyword); setSearchResults(rowResults); setRankingModalOpen(true); }} key={`${row.keyword}-${result.appId}-${appIndex}`}>{result.artworkUrl ? <span className="appBadgeImage" style={{ backgroundImage: `url(${result.artworkUrl})` }} aria-hidden="true" /> : result.name.slice(0, 2).toUpperCase()}</button>) : <RankingSkeletonBadges />}</span>
              </div>
            );
          })}
        </div>
      </section>
      {keywordModalOpen ? <AsoKeywordModal draftKeywords={draftKeywords} suggestions={suggestions} setDraftKeywords={setDraftKeywords} addKeyword={addKeyword} onClose={() => setKeywordModalOpen(false)} /> : null}
      {suggestionModalOpen ? <AsoSuggestionModal appName={appDisplayName(selectedApp?.name ?? "App")} country={selectedCountryLabel} suggestions={suggestions} onPick={(keyword) => { addKeywords([keyword]); setSuggestionModalOpen(false); }} onClose={() => setSuggestionModalOpen(false)} /> : null}
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

function campaignMetricForApp(metrics: AppStoreMetric[], appId: string) {
  return metrics.filter((metric) => metric.appId === appId).reduce((total, metric) => ({
    currency: metric.currency || total.currency,
    downloads: total.downloads + metric.downloads,
    revenue: total.revenue + metric.revenue,
    subscriptions: total.subscriptions + metric.subscriptions,
  }), { currency: "USD", downloads: 0, revenue: 0, subscriptions: 0 });
}

function CampaignsPage({ apps, metrics, socials, campaigns, setCampaigns, setActivePage }: { apps: StudioApp[]; metrics: AppStoreMetric[]; socials: SocialAccount[]; campaigns: Campaign[]; setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>; setActivePage: (page: PageKey) => void }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [draft, setDraft] = useState({
    appId: apps[0]?.id ?? "",
    channel: "Creators" as Campaign["channel"],
    endDate: isoDateOffset(14),
    goal: "Downloads" as Campaign["goal"],
    name: "",
    notes: "",
    spend: "",
    startDate: isoDateOffset(0),
    status: "Draft" as Campaign["status"],
  });
  const currency = metrics[0]?.currency || "USD";
  const totalSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const totalRevenue = campaigns.reduce((sum, campaign) => sum + campaignMetricForApp(metrics, campaign.appId).revenue, 0);
  const totalDownloads = campaigns.reduce((sum, campaign) => sum + campaignMetricForApp(metrics, campaign.appId).downloads, 0);
  const totalProfit = totalRevenue - totalSpend;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0];

  async function addCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const appId = draft.appId || apps[0]?.id;
    if (!appId || !draft.name.trim()) return;
    const spend = Number(draft.spend.replace(",", "."));
    const id = `campaign-${Date.now()}`;
    const nextCampaign: Campaign = {
      id,
      appId,
      channel: draft.channel,
      createdAt: new Date().toISOString(),
      endDate: draft.endDate,
      goal: draft.goal,
      name: draft.name.trim(),
      notes: draft.notes.trim(),
      spend: Number.isFinite(spend) && spend > 0 ? spend : 0,
      startDate: draft.startDate,
      status: draft.status,
    };
    setCampaigns((rows) => [nextCampaign, ...rows]);
    setSelectedCampaignId(nextCampaign.id);
    setDraft((current) => ({ ...current, name: "", notes: "", spend: "" }));
    try {
      const response = await fetch("/api/campaigns", {
        body: JSON.stringify({
          appId: nextCampaign.appId,
          budget: nextCampaign.spend,
          channel: nextCampaign.channel,
          endsAt: nextCampaign.endDate,
          goal: nextCampaign.goal,
          id: nextCampaign.id,
          name: nextCampaign.name,
          notes: nextCampaign.notes,
          startsAt: nextCampaign.startDate,
          status: nextCampaign.status,
          workspaceId: DEFAULT_WORKSPACE_ID,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { ok?: boolean; data?: { campaign?: BackendCampaign } };
      if (response.ok && payload.ok && payload.data?.campaign) {
        const savedCampaign = campaignFromBackend(payload.data.campaign);
        setCampaigns((rows) => rows.map((row) => row.id === nextCampaign.id ? savedCampaign : row));
        setSelectedCampaignId(savedCampaign.id);
      }
    } catch {
      // Keep the optimistic row locally if the backend is temporarily unavailable.
    }
  }

  if (!apps.length) return <EmptyPanel title="No app configured" text="Add an app before creating campaigns." />;

  return (
    <section className="campaignsPage">
      <section className="moduleMatrix campaignStats">
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>Spend</h2>
          <strong>{totalSpend ? formatCurrency(totalSpend, currency) : "—"}</strong>
        </LiquidGlass>
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>ROAS</h2>
          <strong>{totalSpend && totalRevenue ? `${(totalRevenue / totalSpend).toFixed(1)}x` : "—"}</strong>
        </LiquidGlass>
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>Profit</h2>
          <strong>{formatCurrency(totalProfit, currency)}</strong>
        </LiquidGlass>
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>CPI</h2>
          <strong>{totalSpend && totalDownloads ? formatUnitCurrency(totalSpend / totalDownloads, currency) : "—"}</strong>
        </LiquidGlass>
      </section>

      <LiquidGlass as="form" className="panel dataPanel campaignFormPanel" onSubmit={addCampaign}>
        <div className="panelHeader"><div><p className="caption">Create</p><h2>New campaign</h2></div><span className="pill">{campaigns.length} campaigns</span></div>
        <div className="campaignFormGrid">
          <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Campaign name" />
          <select value={draft.appId} onChange={(event) => setDraft((current) => ({ ...current, appId: event.target.value }))}>{apps.map((app) => <option value={app.id} key={app.id}>{appDisplayName(app.name)}</option>)}</select>
          <select value={draft.channel} onChange={(event) => setDraft((current) => ({ ...current, channel: event.target.value as Campaign["channel"] }))}><option>Creators</option><option>Paid Ads</option><option>ASO</option><option>Launch</option><option>Promo</option></select>
          <select value={draft.goal} onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value as Campaign["goal"] }))}><option>Downloads</option><option>Revenue</option><option>Awareness</option><option>Trials</option><option>Retention</option></select>
          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Campaign["status"] }))}><option>Draft</option><option>Live</option><option>Paused</option><option>Completed</option></select>
          <input type="number" min="0" step="0.01" value={draft.spend} onChange={(event) => setDraft((current) => ({ ...current, spend: event.target.value }))} placeholder="Spend" />
          <input type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
          <input type="date" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} />
          <input className="campaignNotesInput" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
        </div>
        <button className="primaryButton" type="submit">Create campaign</button>
      </LiquidGlass>

      <section className="campaignWorkArea">
        <LiquidGlass className="panel dataPanel campaignSheetPanel">
          <div className="panelHeader"><div><p className="caption">Sheet</p><h2>Campaign tracking</h2></div><span className="pill">{campaigns.length} rows</span></div>
          {campaigns.length ? (
            <div className="table campaignTable">
              <div className="tableRow tableHead campaignHead"><span>Campaign</span><span>App</span><span>Channel</span><span>Status</span><span>Goal</span><span>Spend</span><span>Revenue</span><span>Profit</span><span>ROAS</span><span>Downloads</span><span>CPI</span><span>Creators</span><span>Dates</span><span>Manage</span></div>
              {campaigns.map((campaign) => {
                const app = apps.find((row) => row.id === campaign.appId);
                const metric = campaignMetricForApp(metrics, campaign.appId);
                const linkedCreators = socials.filter((social) => social.appId === campaign.appId);
                const profit = metric.revenue - campaign.spend;
                const roas = campaign.spend && metric.revenue ? metric.revenue / campaign.spend : 0;
                const cpi = campaign.spend && metric.downloads ? campaign.spend / metric.downloads : 0;
                return (
                  <div className={selectedCampaign?.id === campaign.id ? "tableRow campaignRow isSelected" : "tableRow campaignRow"} role="button" tabIndex={0} onClick={() => setSelectedCampaignId(campaign.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedCampaignId(campaign.id); }} key={campaign.id}>
                    <span><strong>{campaign.name}</strong><small>{campaign.notes || campaign.goal}</small></span>
                    <span>{app ? appDisplayName(app.name) : "Unmapped"}</span>
                    <span>{campaign.channel}</span>
                    <span><b className={campaign.status === "Live" || campaign.status === "Completed" ? "statusOk" : "statusDraft"}>{campaign.status}</b></span>
                    <span>{campaign.goal}</span>
                    <span>{campaign.spend ? formatCurrency(campaign.spend, metric.currency) : "—"}</span>
                    <span>{metric.revenue ? formatCurrency(metric.revenue, metric.currency) : "—"}</span>
                    <span className={profit >= 0 ? "statusOk" : "statusBad"}>{formatCurrency(profit, metric.currency)}</span>
                    <span>{roas ? `${roas.toFixed(1)}x` : "—"}</span>
                    <span>{metric.downloads ? formatNumber(metric.downloads) : "—"}</span>
                    <span>{cpi ? formatUnitCurrency(cpi, metric.currency) : "—"}</span>
                    <span>{linkedCreators.length ? formatNumber(linkedCreators.length) : "—"}</span>
                    <span><small>{campaign.startDate} → {campaign.endDate}</small></span>
                    <span><button className="ghostButton dangerButton" type="button" onClick={(event) => { event.stopPropagation(); void fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: "DELETE" }).catch(() => null); setCampaigns((rows) => rows.filter((row) => row.id !== campaign.id)); }}>Delete</button></span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyPanel title="No campaigns yet" text="Create one campaign to start tracking spend, revenue, profit and creator coverage." />}
        </LiquidGlass>

        <CampaignDetail campaign={selectedCampaign} apps={apps} metrics={metrics} socials={socials} setActivePage={setActivePage} />
      </section>
    </section>
  );
}

function CampaignDetail({ campaign, apps, metrics, socials, setActivePage }: { campaign?: Campaign; apps: StudioApp[]; metrics: AppStoreMetric[]; socials: SocialAccount[]; setActivePage: (page: PageKey) => void }) {
  if (!campaign) return <LiquidGlass className="panel dataPanel campaignDetail"><h2>Select a campaign</h2></LiquidGlass>;
  const app = apps.find((row) => row.id === campaign.appId);
  const metric = campaignMetricForApp(metrics, campaign.appId);
  const creators = socials.filter((social) => social.appId === campaign.appId);
  const views = creators.reduce((sum, social) => sum + socialMetricValue(social, "views"), 0);
  const profit = metric.revenue - campaign.spend;
  return (
    <LiquidGlass className="panel dataPanel campaignDetail">
      <div className="panelHeader"><div><p className="caption">{campaign.channel}</p><h2>{campaign.name}</h2></div><span className="pill">{campaign.status}</span></div>
      <div className="campaignDetailStats">
        <span><strong>{app ? appDisplayName(app.name) : "Unmapped"}</strong><small>App</small></span>
        <span><strong>{formatCurrency(campaign.spend, metric.currency)}</strong><small>Spend</small></span>
        <span><strong>{metric.revenue ? formatCurrency(metric.revenue, metric.currency) : "—"}</strong><small>Revenue</small></span>
        <span><strong>{formatCurrency(profit, metric.currency)}</strong><small>Profit</small></span>
        <span><strong>{metric.downloads ? formatNumber(metric.downloads) : "—"}</strong><small>Downloads</small></span>
        <span><strong>{views ? formatNumber(views) : "—"}</strong><small>Creator views</small></span>
      </div>
      <div className="campaignActions">
        <button className="ghostButton" type="button" onClick={() => setActivePage("creators")}>Creators</button>
        <button className="ghostButton" type="button" onClick={() => setActivePage("revenue")}>Revenue</button>
        <button className="ghostButton" type="button" onClick={() => setActivePage("aso")}>ASO</button>
      </div>
    </LiquidGlass>
  );
}

function creativeEngagement(creative: Creative) {
  const views = creative.views ?? 0;
  if (!views) return 0;
  return (((creative.likes ?? 0) + (creative.comments ?? 0) + (creative.shares ?? 0) + (creative.favorites ?? 0)) / views) * 100;
}

function creativeMetricTotal(creatives: Creative[], key: "comments" | "favorites" | "likes" | "shares" | "views") {
  return creatives.reduce((sum, creative) => sum + (creative[key] ?? 0), 0);
}

function CreativePage({ apps, socials, creatives, setCreatives, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; creatives: Creative[]; setCreatives: React.Dispatch<React.SetStateAction<Creative[]>>; isFiltered?: boolean }) {
  const [selectedCreativeId, setSelectedCreativeId] = useState(creatives[0]?.id ?? "");
  const [draft, setDraft] = useState({
    angle: "Demo" as Creative["angle"],
    appId: apps[0]?.id ?? "",
    comments: "",
    favorites: "",
    format: "UGC" as Creative["format"],
    hook: "",
    likes: "",
    shares: "",
    socialId: socials[0]?.id ?? "",
    status: "Idea" as Creative["status"],
    title: "",
    url: "",
    views: "",
  });
  const totalViews = creativeMetricTotal(creatives, "views");
  const avgEngagement = creatives.length ? creatives.reduce((sum, creative) => sum + creativeEngagement(creative), 0) / creatives.length : 0;
  const winners = creatives.filter((creative) => creative.status === "Winner").length;
  const selectedCreative = creatives.find((creative) => creative.id === selectedCreativeId) ?? creatives[0];

  function parseOptionalMetric(value: string) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  async function addCreative(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const appId = draft.appId || apps[0]?.id;
    if (!appId || !draft.title.trim()) return;
    const id = `creative-${Date.now()}`;
    const nextCreative: Creative = {
      id,
      angle: draft.angle,
      appId,
      comments: parseOptionalMetric(draft.comments),
      createdAt: new Date().toISOString(),
      favorites: parseOptionalMetric(draft.favorites),
      format: draft.format,
      hook: draft.hook.trim(),
      likes: parseOptionalMetric(draft.likes),
      shares: parseOptionalMetric(draft.shares),
      socialId: draft.socialId,
      status: draft.status,
      title: draft.title.trim(),
      url: draft.url.trim(),
      views: parseOptionalMetric(draft.views),
    };
    setCreatives((rows) => [nextCreative, ...rows]);
    setSelectedCreativeId(nextCreative.id);
    setDraft((current) => ({ ...current, comments: "", favorites: "", hook: "", likes: "", shares: "", title: "", url: "", views: "" }));
    try {
      const response = await fetch("/api/creatives", {
        body: JSON.stringify({
          appId: nextCreative.appId,
          comments: nextCreative.comments ?? 0,
          favorites: nextCreative.favorites ?? 0,
          format: nextCreative.format,
          hook: nextCreative.hook,
          id: nextCreative.id,
          impressions: nextCreative.views ?? 0,
          likes: nextCreative.likes ?? 0,
          name: nextCreative.title,
          shares: nextCreative.shares ?? 0,
          socialAccountId: nextCreative.socialId,
          status: nextCreative.status,
          url: nextCreative.url,
          workspaceId: DEFAULT_WORKSPACE_ID,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { ok?: boolean; data?: { creative?: BackendCreative } };
      if (response.ok && payload.ok && payload.data?.creative) {
        const savedCreative = creativeFromBackend(payload.data.creative);
        setCreatives((rows) => rows.map((row) => row.id === nextCreative.id ? savedCreative : row));
        setSelectedCreativeId(savedCreative.id);
      }
    } catch {
      // Keep the optimistic row locally if the backend is temporarily unavailable.
    }
  }

  if (!apps.length) return <EmptyPanel title="No app configured" text="Add an app before building the creative library." />;

  return (
    <section className="creativesPage">
      <section className="moduleMatrix creativeStats">
        <LiquidGlass className="panel moduleCard marketingMetricCard"><span className="cardAccentRail" aria-hidden="true" /><h2>Creatives</h2><strong>{formatNumber(creatives.length)}</strong></LiquidGlass>
        <LiquidGlass className="panel moduleCard marketingMetricCard"><span className="cardAccentRail" aria-hidden="true" /><h2>Views</h2><strong>{totalViews ? formatNumber(totalViews) : "—"}</strong></LiquidGlass>
        <LiquidGlass className="panel moduleCard marketingMetricCard"><span className="cardAccentRail" aria-hidden="true" /><h2>Engagement</h2><strong>{avgEngagement ? `${avgEngagement.toFixed(1)}%` : "—"}</strong></LiquidGlass>
        <LiquidGlass className="panel moduleCard marketingMetricCard"><span className="cardAccentRail" aria-hidden="true" /><h2>Winners</h2><strong>{formatNumber(winners)}</strong></LiquidGlass>
      </section>

      <LiquidGlass as="form" className="panel dataPanel creativeFormPanel" onSubmit={addCreative}>
        <div className="panelHeader"><div><p className="caption">Create</p><h2>Add creative</h2></div><span className="pill">{creatives.length} creatives</span></div>
        <div className="creativeFormGrid">
          <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Creative title" />
          <select value={draft.appId} onChange={(event) => setDraft((current) => ({ ...current, appId: event.target.value }))}>{apps.map((app) => <option value={app.id} key={app.id}>{appDisplayName(app.name)}</option>)}</select>
          <select value={draft.socialId} onChange={(event) => setDraft((current) => ({ ...current, socialId: event.target.value }))}><option value="">No creator</option>{socials.map((social) => <option value={social.id} key={social.id}>{social.handle}</option>)}</select>
          <select value={draft.angle} onChange={(event) => setDraft((current) => ({ ...current, angle: event.target.value as Creative["angle"] }))}><option>Pain</option><option>Benefit</option><option>Proof</option><option>Demo</option><option>Offer</option><option>UGC</option></select>
          <select value={draft.format} onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value as Creative["format"] }))}><option>Talking head</option><option>Screen recording</option><option>UGC</option><option>Meme</option><option>Static</option><option>Other</option></select>
          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Creative["status"] }))}><option>Idea</option><option>Scripted</option><option>Posted</option><option>Winner</option><option>Fatigue</option><option>Archived</option></select>
          <input value={draft.hook} onChange={(event) => setDraft((current) => ({ ...current, hook: event.target.value }))} placeholder="Hook" />
          <input value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="Video URL" />
          <input type="number" min="0" value={draft.views} onChange={(event) => setDraft((current) => ({ ...current, views: event.target.value }))} placeholder="Views" />
          <input type="number" min="0" value={draft.likes} onChange={(event) => setDraft((current) => ({ ...current, likes: event.target.value }))} placeholder="Likes" />
          <input type="number" min="0" value={draft.comments} onChange={(event) => setDraft((current) => ({ ...current, comments: event.target.value }))} placeholder="Comments" />
          <input type="number" min="0" value={draft.shares} onChange={(event) => setDraft((current) => ({ ...current, shares: event.target.value }))} placeholder="Shares" />
          <input type="number" min="0" value={draft.favorites} onChange={(event) => setDraft((current) => ({ ...current, favorites: event.target.value }))} placeholder="Favorites" />
        </div>
        <button className="primaryButton" type="submit">Add creative</button>
      </LiquidGlass>

      <section className="creativeWorkArea">
        <LiquidGlass className="panel dataPanel creativeSheetPanel">
          <div className="panelHeader"><div><p className="caption">Library</p><h2>Creative tracking</h2></div><span className="pill">{creatives.length} rows</span></div>
          {creatives.length ? (
            <div className="table creativeTable">
              <div className="tableRow tableHead creativeHead"><span>Creative</span><span>App</span><span>Creator</span><span>Status</span><span>Angle</span><span>Format</span><span>Views</span><span>Likes</span><span>Comments</span><span>Shares</span><span>Favorites</span><span>Eng.</span><span>Hook</span><span>URL</span><span>Manage</span></div>
              {creatives.map((creative) => {
                const app = apps.find((row) => row.id === creative.appId);
                const social = socials.find((row) => row.id === creative.socialId);
                const loading = Boolean(social && isSocialLoading(social) && creative.views === undefined);
                const isSelected = selectedCreative?.id === creative.id;
                return (
                  <div className={isSelected ? "tableRow creativeRow isSelected" : "tableRow creativeRow"} role="button" tabIndex={0} onClick={() => setSelectedCreativeId(creative.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedCreativeId(creative.id); }} key={creative.id}>
                    <span><strong>{creative.title}</strong><small>{creative.url ? "Linked" : "Manual"}</small></span>
                    <span>{app ? appDisplayName(app.name) : "Unmapped"}</span>
                    <span>{social?.handle ?? "—"}</span>
                    <span><b className={creative.status === "Winner" || creative.status === "Posted" ? "statusOk" : "statusDraft"}>{creative.status}</b></span>
                    <span>{creative.angle}</span>
                    <span>{creative.format}</span>
                    <span className="socialMetricNumber"><SocialMetricCell value={creative.views ?? 0} loading={loading} /></span>
                    <span className="socialMetricNumber"><SocialMetricCell value={creative.likes ?? 0} loading={loading} /></span>
                    <span className="socialMetricNumber"><SocialMetricCell value={creative.comments ?? 0} loading={loading} /></span>
                    <span className="socialMetricNumber"><SocialMetricCell value={creative.shares ?? 0} loading={loading} /></span>
                    <span className="socialMetricNumber"><SocialMetricCell value={creative.favorites ?? 0} loading={loading} /></span>
                    <span className="socialMetricNumber"><SocialMetricCell value={creativeEngagement(creative)} loading={loading} suffix="%" /></span>
                    <span><small>{creative.hook || "—"}</small></span>
                    <span>{creative.url ? <a href={creative.url} target="_blank" rel="noreferrer">Open</a> : "—"}</span>
                    <span><button className="ghostButton dangerButton" type="button" onClick={(event) => { event.stopPropagation(); void fetch(`/api/creatives/${encodeURIComponent(creative.id)}`, { method: "DELETE" }).catch(() => null); setCreatives((rows) => rows.filter((row) => row.id !== creative.id)); }}>Delete</button></span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyPanel title={isFiltered ? "No creative matches this search" : "No creatives yet"} text={isFiltered ? "Clear the search or try another creative title, hook or creator." : "Add your first creative to track hooks, angles, formats and performance."} />}
        </LiquidGlass>
        <CreativeDetail creative={selectedCreative} apps={apps} socials={socials} />
      </section>
    </section>
  );
}

function CreativeDetail({ apps, creative, socials }: { apps: StudioApp[]; creative?: Creative; socials: SocialAccount[] }) {
  if (!creative) return <LiquidGlass className="panel dataPanel creativeDetail"><h2>Select a creative</h2></LiquidGlass>;
  const app = apps.find((row) => row.id === creative.appId);
  const social = socials.find((row) => row.id === creative.socialId);
  return (
    <LiquidGlass className="panel dataPanel creativeDetail">
      <div className="panelHeader"><div><p className="caption">{creative.status}</p><h2>{creative.title}</h2></div><span className="pill">{creative.angle}</span></div>
      <div className="creativeDetailStats">
        <span><strong>{app ? appDisplayName(app.name) : "Unmapped"}</strong><small>App</small></span>
        <span><strong>{social?.handle ?? "—"}</strong><small>Creator</small></span>
        <span><strong>{creative.views ? formatNumber(creative.views) : "—"}</strong><small>Views</small></span>
        <span><strong>{creativeEngagement(creative) ? `${creativeEngagement(creative).toFixed(1)}%` : "—"}</strong><small>Engagement</small></span>
      </div>
      <div className="creativeBrief">
        <span><small>Hook</small><strong>{creative.hook || "—"}</strong></span>
        <span><small>Format</small><strong>{creative.format}</strong></span>
        <span><small>URL</small>{creative.url ? <a href={creative.url} target="_blank" rel="noreferrer">Open video</a> : <strong>—</strong>}</span>
      </div>
    </LiquidGlass>
  );
}

function TrendPanel({ title, value, detail, points, variant, currency }: { title: string; value: string; detail: string; points: TrendPoint[]; variant: "currency" | "number"; currency: string }) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const safePoints = points.length ? points : Array.from({ length: 7 }, (_, index) => ({ label: `Point ${index + 1}`, value: 0 }));
  const safeValues = safePoints.map((point) => point.value);
  const chartLeft = 126;
  const chartRight = 1128;
  const chartTop = 26;
  const chartBottom = 296;
  const domainMin = Math.min(0, ...safeValues);
  const rawMax = Math.max(0, ...safeValues);
  const domainMax = rawMax === domainMin ? domainMin + 1 : rawMax;
  const domainRange = domainMax - domainMin;
  const svgPoints = safeValues.map((point, index) => {
    const x = safeValues.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + (index * (chartRight - chartLeft)) / (safeValues.length - 1);
    const y = chartBottom - ((point - domainMin) / domainRange) * (chartBottom - chartTop);
    return [x, y];
  });
  const path = svgPoints.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${path} L ${chartRight} ${chartBottom} L ${chartLeft} ${chartBottom} Z`;
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      value: domainMax - ratio * domainRange,
      y: chartTop + ratio * (chartBottom - chartTop),
    };
  });
  const xTickIndexes = Array.from(new Set(Array.from({ length: Math.min(6, safePoints.length) }, (_, index) => Math.round((index * (safePoints.length - 1)) / Math.max(1, Math.min(6, safePoints.length) - 1)))));
  const formatAxisValue = (axisValue: number) => new Intl.NumberFormat("en", {
    currency: variant === "currency" ? normalizeCurrency(currency) : undefined,
    maximumFractionDigits: axisValue > -10 && axisValue < 10 ? 1 : 0,
    notation: "compact",
    style: variant === "currency" ? "currency" : "decimal",
  }).format(axisValue);
  const activePoint = hoveredPoint === null ? null : safePoints[hoveredPoint];
  const activeCoordinates = hoveredPoint === null ? null : svgPoints[hoveredPoint];
  const tooltipWidth = 220;
  const tooltipHeight = 78;
  const tooltipX = activeCoordinates
    ? Math.max(chartLeft, Math.min(activeCoordinates[0] + 18, chartRight - tooltipWidth))
    : 0;
  const tooltipY = activeCoordinates
    ? Math.max(chartTop, activeCoordinates[1] - tooltipHeight - 18 < chartTop ? activeCoordinates[1] + 18 : activeCoordinates[1] - tooltipHeight - 18)
    : 0;
  const activeValue = activePoint
    ? variant === "currency" ? formatCurrency(activePoint.value, currency) : formatNumber(activePoint.value)
    : "";
  return (
    <LiquidGlass className="panel trendPanel">
      <div className="panelHeader"><div><p className="caption">Trend</p><h2>{title}</h2></div><span className="pill">{value}</span></div>
      <div className="chartButton">
        <svg viewBox="0 0 1180 360" role="img">
          <title>{title}</title>
          <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d7ad5c" stopOpacity="0.38" /><stop offset="100%" stopColor="#d7ad5c" stopOpacity="0" /></linearGradient></defs>
          {yTicks.map((tick) => <g className="yAxisTick" key={tick.y}><line className="gridLine" x1={chartLeft} x2={chartRight} y1={tick.y} y2={tick.y} /><text x={chartLeft - 22} y={tick.y + 5} textAnchor="end">{formatAxisValue(tick.value)}</text></g>)}
          {xTickIndexes.map((index) => <g className="xAxisTick" key={`${safePoints[index].label}-${index}`}><line className="verticalGridLine" x1={svgPoints[index][0]} x2={svgPoints[index][0]} y1={chartTop} y2={chartBottom} /><text x={svgPoints[index][0]} y={chartBottom + 30} textAnchor="middle">{safePoints[index].label}</text></g>)}
          <line className="axisLine" x1={chartLeft} x2={chartLeft} y1={chartTop} y2={chartBottom} />
          <line className="axisLine" x1={chartLeft} x2={chartRight} y1={chartBottom} y2={chartBottom} />
          <path className="areaPath" d={area} />
          <path className="orangeLine" d={path} />
          {svgPoints.map(([x, y], index) => (
            <g
              className="chartPoint"
              key={`${x}-${index}`}
              onBlur={() => setHoveredPoint(null)}
              onFocus={() => setHoveredPoint(index)}
              onPointerEnter={() => setHoveredPoint(index)}
              onPointerLeave={() => setHoveredPoint(null)}
              tabIndex={0}
              aria-label={`${safePoints[index].label}: ${variant === "currency" ? formatCurrency(safePoints[index].value, currency) : formatNumber(safePoints[index].value)}`}
            >
              <circle cx={x} cy={y} r="6" />
              <circle className="chartHit" cx={x} cy={y} r="22" />
            </g>
          ))}
          {activePoint && activeCoordinates ? (
            <g className="chartHoverOverlay" aria-hidden="true">
              <line className="chartHoverGuide" x1={activeCoordinates[0]} x2={activeCoordinates[0]} y1={chartTop} y2={chartBottom} />
              <g className="chartTooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
                <rect width={tooltipWidth} height={tooltipHeight} rx="8" />
                <text className="chartTooltipDate" x="16" y="25">{activePoint.label}</text>
                <circle cx="19" cy="54" r="5" />
                <text className="chartTooltipMetric" x="32" y="59">{title}</text>
                <text className="chartTooltipValue" x={tooltipWidth - 16} y="59" textAnchor="end">{activeValue}</text>
              </g>
            </g>
          ) : null}
        </svg>
      </div>
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

type IntegrationCardSpec = {
  action: string;
  description: string;
  icon: LucideIcon;
  isPrimary?: boolean;
  name: string;
  onAction: () => void | Promise<void>;
  provider: string;
  status: "Connected" | "Ready" | "Needs setup";
  surface: string;
};

type BackendIntegration = {
  appId: string | null;
  configJson: string;
  id: string;
  lastSyncedAt: string | null;
  provider: string;
  secretRef: string | null;
  status: string;
  workspaceId: string;
};

function IntegrationsPage({
  appFormCard,
  apps,
  metrics,
  setActivePage,
  socialFormCard,
  socials,
  syncAppStore,
  syncError,
  syncingAppId,
}: {
  appFormCard: ReactNode;
  apps: StudioApp[];
  metrics: AppStoreMetric[];
  setActivePage: (page: PageKey) => void;
  socialFormCard: ReactNode;
  socials: SocialAccount[];
  syncAppStore: (app: StudioApp) => void;
  syncError: string;
  syncingAppId: string;
}) {
  const workspaceId = "drift-studio";
  const [backendIntegrations, setBackendIntegrations] = useState<BackendIntegration[]>([]);
  const [connectError, setConnectError] = useState("");
  const [configProvider, setConfigProvider] = useState<IntegrationCardSpec | null>(null);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [savingProvider, setSavingProvider] = useState("");
  const appleReadyApps = apps.filter((app) => appleCredentialGaps(app).length === 0);
  const syncedApps = apps.filter((app) => metrics.some((metric) => metric.appId === app.id));
  const tiktokHandles = socials.filter((social) => social.platform.toLowerCase() === "tiktok");
  const backendByProvider = useMemo(() => new Map(backendIntegrations.map((integration) => [integration.provider, integration])), [backendIntegrations]);
  const hasAppleSearch = true;
  const hasManualExpenses = true;
  const hasAi = true;
  const hasBackend = true;
  const firstSyncableApp = appleReadyApps.find((app) => app.id !== syncingAppId) ?? appleReadyApps[0];
  const registerIntegration = useCallback(async (provider: string, status: string, config: Record<string, unknown> = {}) => {
    setSavingProvider(provider);
    try {
      const response = await fetch("/api/integrations", {
        body: JSON.stringify({ workspaceId, provider, status, config }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = await response.json() as { data?: { integration?: BackendIntegration }; ok?: boolean };
      if (payload.ok && payload.data?.integration) {
        setBackendIntegrations((current) => {
          const next = current.filter((integration) => integration.provider !== payload.data?.integration?.provider);
          return [payload.data.integration, ...next];
        });
      }
    } finally {
      setSavingProvider("");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/integrations?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((response) => response.json())
      .then((payload: { data?: { integrations?: BackendIntegration[] }; ok?: boolean }) => {
        if (alive && payload.ok) setBackendIntegrations(payload.data?.integrations ?? []);
      })
      .catch(() => {
        if (alive) setBackendIntegrations([]);
      })
      .finally(() => {
        if (alive) setLoadingIntegrations(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const connectedStatus = useCallback((provider: string, ready: boolean) => {
    const persisted = backendByProvider.get(provider);
    if (persisted?.status === "connected" || persisted?.status === "configured") return "Connected";
    if (ready) return "Ready";
    return "Needs setup";
  }, [backendByProvider]);

  const cards: IntegrationCardSpec[] = [
    {
      action: firstSyncableApp ? "Sync Apple" : "Add app",
      description: `${appleReadyApps.length}/${apps.length || 0} apps ready for App Store Connect reports.`,
      icon: CircleDollarSign,
      isPrimary: true,
      name: "App Store Connect",
      onAction: async () => {
        if (!firstSyncableApp) {
          setActivePage("apps");
          return;
        }
        await registerIntegration("app_store_connect", "connected", { readyApps: appleReadyApps.length });
        syncAppStore(firstSyncableApp);
      },
      provider: "app_store_connect",
      status: connectedStatus("app_store_connect", Boolean(appleReadyApps.length)),
      surface: "Revenue, downloads, countries, releases, ASO metadata",
    },
    {
      action: "Open ASO",
      description: "Live App Store public search powers keyword ranking and competitor apps.",
      icon: Search,
      name: "Apple Search",
      onAction: async () => {
        await registerIntegration("apple_search", "configured", { source: "itunes-search" });
        setActivePage("aso");
      },
      provider: "apple_search",
      status: connectedStatus("apple_search", hasAppleSearch),
      surface: "ASO, keyword suggestions, rankings",
    },
    {
      action: tiktokHandles.length ? "View tracking" : "Add @",
      description: `${tiktokHandles.length} public TikTok handle${tiktokHandles.length === 1 ? "" : "s"} mapped.`,
      icon: AtSign,
      isPrimary: !tiktokHandles.length,
      name: "TikTok Public",
      onAction: async () => {
        if (tiktokHandles.length) await registerIntegration("tiktok_public", "connected", { handles: tiktokHandles.length });
        setActivePage("social");
      },
      provider: "tiktok_public",
      status: connectedStatus("tiktok_public", Boolean(tiktokHandles.length)),
      surface: "Videos, views, likes, comments, shares, favorites",
    },
    {
      action: "Open subscriptions",
      description: "API-key connection point is reserved in the backend.",
      icon: Repeat,
      name: "RevenueCat",
      onAction: () => setConfigProvider(cards.find((item) => item.provider === "revenuecat") ?? null),
      provider: "revenuecat",
      status: connectedStatus("revenuecat", false),
      surface: "MRR, trials, renewals, cancellations, refunds",
    },
    {
      action: "Open paywall",
      description: "Webhook/API connection point is reserved in the backend.",
      icon: WalletCards,
      name: "Superwall",
      onAction: () => setConfigProvider(cards.find((item) => item.provider === "superwall") ?? null),
      provider: "superwall",
      status: connectedStatus("superwall", false),
      surface: "Paywall views, starts, offer CVR, experiments",
    },
    {
      action: "Add expense",
      description: "Manual expense categories are backed by the new expenses API.",
      icon: Percent,
      name: "Manual Expenses",
      onAction: async () => {
        await registerIntegration("manual_expenses", "configured");
        setActivePage("monetization");
      },
      provider: "manual_expenses",
      status: connectedStatus("manual_expenses", hasManualExpenses),
      surface: "Creators, ads, software, other spend and profit",
    },
    {
      action: "Open AI",
      description: "Local workspace assistant can answer from configured apps and metrics.",
      icon: Sparkles,
      name: "DriftOS AI",
      onAction: async () => {
        await registerIntegration("openai", "configured", { surface: "workspace_assistant" });
        setActivePage("overview");
      },
      provider: "openai",
      status: connectedStatus("openai", hasAi),
      surface: "Briefs, decisions, search, workspace Q&A",
    },
    {
      action: "Check backend",
      description: "D1 is mounted locally and ready for persistent resources.",
      icon: Plug,
      name: "D1 Backend",
      onAction: () => window.open("/api/backend/health", "_blank", "noopener,noreferrer"),
      provider: "d1_backend",
      status: hasBackend ? "Connected" : "Needs setup",
      surface: "Apps, integrations, sync jobs, metrics, expenses",
    },
  ];

  const connected = cards.filter((card) => card.status === "Connected").length;
  const ready = cards.filter((card) => card.status !== "Needs setup").length;

  return (
    <>
      <div className="integrationSummary">
        <LiquidGlass className="panel moduleCard noMiniChart"><span className="cardAccentRail" aria-hidden="true" /><h2>Connected</h2><strong>{connected}</strong><small>{ready}/{cards.length} usable</small></LiquidGlass>
        <LiquidGlass className="panel moduleCard noMiniChart"><span className="cardAccentRail" aria-hidden="true" /><h2>Apps</h2><strong>{apps.length}</strong><small>{syncedApps.length} synced</small></LiquidGlass>
        <LiquidGlass className="panel moduleCard noMiniChart"><span className="cardAccentRail" aria-hidden="true" /><h2>Social</h2><strong>{socials.length}</strong><small>{tiktokHandles.length} TikTok</small></LiquidGlass>
      </div>
      <LiquidGlass className="panel integrationsHub">
        <div className="panelHeader">
          <div>
            <p className="caption">Connections</p>
            <h2>Integrations</h2>
          </div>
          <span className="pill">{cards.length} services</span>
        </div>
        <div className="integrationGrid">
          {cards.map((card) => <IntegrationCard card={card} busy={loadingIntegrations || savingProvider === card.provider || (card.name === "App Store Connect" && Boolean(syncingAppId))} key={card.name} />)}
        </div>
      </LiquidGlass>
      {configProvider ? (
        <IntegrationConnectDialog
          busy={savingProvider === configProvider.provider}
          error={connectError}
          integration={backendByProvider.get(configProvider.provider)}
          provider={configProvider}
          onClose={() => {
            setConfigProvider(null);
            setConnectError("");
          }}
          onConnect={async (payload) => {
            setConnectError("");
            setSavingProvider(configProvider.provider);
            try {
              const response = await fetch("/api/integrations/connect", {
                body: JSON.stringify({ workspaceId, provider: configProvider.provider, ...payload }),
                headers: { "content-type": "application/json" },
                method: "POST",
              });
              const result = await response.json() as { data?: { integration?: BackendIntegration }; error?: { message?: string }; ok?: boolean };
              if (!response.ok || !result.ok || !result.data?.integration) {
                setConnectError(result.error?.message || "Connection failed.");
                return;
              }
              setBackendIntegrations((current) => {
                const next = current.filter((integration) => integration.provider !== result.data?.integration?.provider);
                return [result.data.integration, ...next];
              });
              setConfigProvider(null);
            } finally {
              setSavingProvider("");
            }
          }}
        />
      ) : null}
      {syncError ? <InlineError text={syncError} /> : null}
      <section className="setupGrid">{appFormCard}{socialFormCard}</section>
    </>
  );
}

function IntegrationConnectDialog({
  busy,
  error,
  integration,
  onClose,
  onConnect,
  provider,
}: {
  busy: boolean;
  error: string;
  integration?: BackendIntegration;
  onClose: () => void;
  onConnect: (payload: { apiKey: string; organizationId?: string; projectId?: string }) => Promise<void>;
  provider: IntegrationCardSpec;
}) {
  const [apiKey, setApiKey] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const connected = integration?.status === "connected";

  return (
    <div className="integrationDialogBackdrop" role="presentation">
      <form
        className="integrationDialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void onConnect({ apiKey, organizationId, projectId });
        }}
      >
        <div className="integrationDialogHeader">
          <div>
            <p className="caption">Connect provider</p>
            <h2>{provider.name}</h2>
          </div>
          <button aria-label="Close integration setup" className="modalCloseButton" type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="integrationDialogCopy">{provider.surface}</p>
        {connected ? <div className="integrationConnectedBanner">Connected with {JSON.parse(integration.configJson || "{}").apiKeyPreview ?? "saved key"}</div> : null}
        <label className="fieldLabel">
          API key
          <input autoFocus placeholder={provider.provider === "revenuecat" ? "RevenueCat secret API key" : "Superwall API key"} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <div className="integrationDialogGrid">
          <label className="fieldLabel">
            Project ID
            <input placeholder="Optional" value={projectId} onChange={(event) => setProjectId(event.target.value)} />
          </label>
          <label className="fieldLabel">
            Organization ID
            <input placeholder="Optional" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} />
          </label>
        </div>
        {error ? <InlineError text={error} /> : null}
        {busy ? (
          <div className="integrationDialogSkeleton">
            <SkeletonLine />
            <SkeletonLine />
          </div>
        ) : null}
        <div className="integrationDialogActions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button disabled={!apiKey.trim() || busy} type="submit">{busy ? "Checking..." : "Connect"}</button>
        </div>
      </form>
    </div>
  );
}

function IntegrationCard({ busy, card }: { busy: boolean; card: IntegrationCardSpec }) {
  const Icon = card.icon;
  return (
    <button className={card.isPrimary ? "integrationCard isPrimary" : "integrationCard"} type="button" onClick={card.onAction}>
      <span className="cardAccentRail" aria-hidden="true" />
      <span className={`integrationStatus ${card.status === "Connected" ? "connected" : card.status === "Ready" ? "ready" : "needsSetup"}`}>{busy ? <SkeletonLine className="integrationStatusSkeleton" /> : card.status}</span>
      <span className="integrationTop"><Icon size={22} strokeWidth={1.7} /><strong>{card.name}</strong></span>
      <span className="integrationSurface">{card.surface}</span>
      <span className="integrationDescription">{card.description}</span>
      <span className="integrationAction">{busy ? <SkeletonLine className="buttonSkeleton" /> : card.action}</span>
    </button>
  );
}

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
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const globeWrapRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<GlobeCountryFeature[]>([]);
  const [globeSize, setGlobeSize] = useState({ height: 520, width: 760 });
  const [geoMetric, setGeoMetric] = useState<GeoMetric>("revenue");
  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState("");
  const countries = aggregateCountries(metrics);
  const metricValue = useCallback((country: (typeof countries)[number]) => {
    if (geoMetric === "downloads") return country.downloads;
    if (geoMetric === "cvr") return country.downloads ? (country.proceedsUnits / country.downloads) * 100 : 0;
    return Math.abs(country.revenue);
  }, [geoMetric]);
  const hasMetricValue = useCallback((country: (typeof countries)[number]) => {
    if (geoMetric === "downloads") return country.downloads >= 1;
    if (geoMetric === "cvr") return country.downloads >= 1 && country.proceedsUnits >= 1;
    return Math.abs(country.revenue) >= 1;
  }, [geoMetric]);
  const sortedCountries = useMemo(
    () => [...countries].filter(hasMetricValue).sort((a, b) => metricValue(b) - metricValue(a)),
    [countries, hasMetricValue, metricValue],
  );
  const maxValue = Math.max(...sortedCountries.map(metricValue), 1);
  const pointData = useMemo<GlobeCountryPoint[]>(() => sortedCountries.flatMap((country) => {
    const position = countryPositions[country.country];
    if (!position) return [];
    const cvr = country.downloads ? (country.proceedsUnits / country.downloads) * 100 : null;
    return [{
      code: country.country,
      cvr,
      downloads: country.downloads,
      lat: position.lat,
      lng: position.lon,
      name: position.name,
      proceedsUnits: country.proceedsUnits,
      revenue: country.revenue,
      units: country.units,
      value: metricValue(country),
    }];
  }), [metricValue, sortedCountries]);
  const pointsByCode = useMemo(() => new Map(pointData.map((point) => [point.code, point])), [pointData]);

  useEffect(() => {
    let cancelled = false;
    fetch("/globe/countries.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Globe countries unavailable");
        return response.json() as Promise<{ features: GlobeCountryFeature[] }>;
      })
      .then((collection) => {
        if (!cancelled) setFeatures(collection.features);
      })
      .catch(() => {
        if (!cancelled) setFeatures([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const container = globeWrapRef.current;
    if (!container) return;
    const updateSize = () => setGlobeSize({ height: Math.max(420, Math.min(620, container.clientWidth * 0.72)), width: container.clientWidth });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.22;
  }, [autoRotate]);

  const countryCode = (feature: GlobeCountryFeature) => {
    const iso = feature.properties.ISO_A2;
    return iso && iso !== "-99" ? iso : feature.properties.POSTAL ?? "";
  };
  const focusCountry = (point: GlobeCountryPoint) => {
    setSelectedCountry(point.code);
    globeRef.current?.pointOfView({ altitude: 1.55, lat: point.lat, lng: point.lng }, 700);
  };
  const formatGeoValue = (point: GlobeCountryPoint) => geoMetric === "revenue"
    ? formatCurrency(point.revenue, currency)
    : geoMetric === "downloads"
      ? formatNumber(point.downloads)
      : point.cvr === null ? "N/A" : `${point.cvr.toFixed(1)}%`;

  return (
    <LiquidGlass className="panel revenueMapPanel">
      <div className="panelHeader">
        <h2>Revenue by country</h2>
        <div className="geoMetricTabs" role="tablist" aria-label="Country metric">
          {(["revenue", "downloads", "cvr"] as GeoMetric[]).map((metric) => <button className={geoMetric === metric ? "isActive" : ""} type="button" role="tab" aria-selected={geoMetric === metric} onClick={() => { setGeoMetric(metric); setSelectedCountry(""); }} key={metric}>{metric === "cvr" ? "CVR" : metric[0].toUpperCase() + metric.slice(1)}</button>)}
        </div>
      </div>
      <div className="mapGrid">
        <div className="worldGlobe" ref={globeWrapRef} aria-label={`Interactive globe filtered by ${geoMetric}`}>
          <label className="globeAutoRotate">
            <input type="checkbox" checked={autoRotate} onChange={(event) => setAutoRotate(event.target.checked)} />
            <span>Auto rotate</span>
          </label>
          <InteractiveGlobe
            ref={globeRef}
            width={globeSize.width}
            height={globeSize.height}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="/globe/earth-dark.jpg"
            showAtmosphere
            atmosphereColor="#cda65a"
            atmosphereAltitude={0.12}
            showGraticules
            polygonsData={features}
            polygonGeoJsonGeometry="geometry"
            polygonAltitude={(feature) => pointsByCode.has(countryCode(feature as GlobeCountryFeature)) ? 0.012 : 0.004}
            polygonCapColor={(feature) => {
              const point = pointsByCode.get(countryCode(feature as GlobeCountryFeature));
              if (!point) return "rgba(255,255,255,0.025)";
              const intensity = 0.18 + (point.value / maxValue) * 0.48;
              return `rgba(205,166,90,${intensity.toFixed(2)})`;
            }}
            polygonSideColor={(feature) => pointsByCode.has(countryCode(feature as GlobeCountryFeature)) ? "rgba(205,166,90,0.16)" : "rgba(255,255,255,0.015)"}
            polygonStrokeColor={() => "rgba(255,255,255,0.16)"}
            polygonsTransitionDuration={350}
            pointsData={pointData}
            pointLat="lat"
            pointLng="lng"
            pointAltitude={(point) => 0.03 + (((point as GlobeCountryPoint).value / maxValue) * 0.2)}
            pointRadius={(point) => 0.18 + (((point as GlobeCountryPoint).value / maxValue) * 0.34)}
            pointColor={(point) => (point as GlobeCountryPoint).code === selectedCountry ? "#ffffff" : "#d7ad5c"}
            pointLabel={(point) => {
              const item = point as GlobeCountryPoint;
              return `${item.name}: ${formatGeoValue(item)}`;
            }}
            onPointClick={(point) => focusCountry(point as GlobeCountryPoint)}
            onPolygonClick={(feature) => {
              const point = pointsByCode.get(countryCode(feature as GlobeCountryFeature));
              if (point) focusCountry(point);
            }}
            onGlobeReady={() => {
              const controls = globeRef.current?.controls();
              if (controls) {
                controls.autoRotate = autoRotate;
                controls.autoRotateSpeed = 0.22;
                controls.enableDamping = true;
              }
              globeRef.current?.pointOfView({ altitude: 1.85, lat: 24, lng: 8 }, 0);
            }}
          />
          <span className="globeHint">Drag to rotate · Scroll to zoom</span>
        </div>
        <div className="countryList">
          {pointData.length ? pointData.slice(0, 8).map((point, index) => {
            const detail = `${formatCurrency(point.revenue, currency)} · ${formatNumber(point.downloads)} downloads · ${point.cvr === null ? "CVR N/A" : `${point.cvr.toFixed(1)}% CVR`}`;
            return <button className={selectedCountry === point.code ? "countryRow isSelected" : "countryRow"} type="button" title={detail} onClick={() => focusCountry(point)} key={point.code}><b>{countryFlag(point.code)}</b><strong>{point.name}</strong><small>#{index + 1}</small><em>{formatGeoValue(point)}</em></button>;
          }) : <div className="countryRow emptyCountry"><span><b>·</b><strong>No country has this metric yet</strong></span><small>Countries appear in gold from the first qualifying value.</small></div>}
        </div>
      </div>
    </LiquidGlass>
  );
}

function AppTable({ apps, socials, metrics, onDeleteApp, syncAppStore, syncingAppId, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; onDeleteApp: (appId: string) => void; syncAppStore: (app: StudioApp) => void; syncingAppId: string; isFiltered?: boolean }) {
  if (!apps.length) return <EmptyPanel title={isFiltered ? "No app matches this search" : "No apps yet"} text={isFiltered ? "Clear the search or try another app name, platform, bundle ID or sync status." : "Add your first app with App Store Connect credentials before metrics can sync."} />;
  return <LiquidGlass className="panel dataPanel"><div className="panelHeader"><div><p className="caption">Apps</p><h2>Configured portfolio</h2></div><span className="pill">{apps.length} apps</span></div><div className="table"><div className="tableRow tableHead"><span>App</span><span>Credentials</span><span>Apple setup</span><span>Real KPIs</span><span>Sync</span><span>Manage</span></div>{apps.map((app) => {
    const metric = metrics.find((item) => item.appId === app.id);
    const missing = appleCredentialGaps(app);
    const credentialLabel = app.credentialPreset ? "Server preset" : app.privateKeyName || "Manual key";
    const appleSetupLabel = app.credentialPreset ? `Server preset · SKU ${app.sku || app.bundleId || "auto"}` : app.vendorNumber ? `Vendor ${app.vendorNumber} · SKU ${app.sku || app.bundleId || "auto"}` : "Vendor Number missing";
    return <div className="tableRow sixCols" key={app.id}><span className="appCell"><AppAvatar app={app} /><strong title={app.name}>{appDisplayName(app.name)}</strong><small>{app.bundleId || "Bundle pending"}</small></span><span><b className={app.status === "Ready to sync" ? "statusOk" : "statusDraft"}>{app.status}</b><small>{missing.length ? `Missing ${missing.join(", ")}` : credentialLabel}</small></span><span><strong>{app.appStoreId || "Missing"}</strong><small>{appleSetupLabel}</small></span><span><strong>{syncingAppId === app.id ? <SkeletonLine className="tableCellSkeleton value" /> : metric ? formatCurrency(metric.revenue, metric.currency) : missing.length ? "Setup incomplete" : "Not synced"}</strong><small>{syncingAppId === app.id ? <SkeletonLine className="tableCellSkeleton detail" /> : metric ? `${formatNumber(metric.downloads)} downloads · ${metric.release?.latestVersion ?? "release pending"} · ASO ${metric.aso?.metadataScore ?? 0}%` : missing.length ? `Needs ${missing.join(", ")}` : `${socials.filter((social) => social.appId === app.id).length} handles mapped`}</small></span><span><button className="ghostButton syncButton" type="button" disabled={Boolean(syncingAppId)} onClick={() => syncAppStore(app)}>{syncingAppId === app.id ? <SkeletonLine className="buttonSkeleton" /> : "Sync Apple"}</button></span><span><button className="ghostButton dangerButton" type="button" onClick={() => onDeleteApp(app.id)}>Delete app</button></span></div>;
  })}</div></LiquidGlass>;
}

function InlineError({ text }: { text: string }) {
  return <LiquidGlass className="panel inlineError" role="alert"><strong>Sync issue</strong><span>{text}</span></LiquidGlass>;
}

function socialMetricValue(social: SocialAccount, key: SocialMetricKey) {
  const views = social.views ?? ((social.avgViews ?? 0) * (social.posts ?? 0));
  if (key === "videos") return social.posts ?? 0;
  if (key === "views") return views;
  if (key === "avgViews") return social.avgViews ?? (social.posts ? views / social.posts : 0);
  if (key === "likes") return social.likes ?? 0;
  if (key === "comments") return social.comments ?? 0;
  if (key === "shares") return social.shares ?? 0;
  if (key === "favorites") return social.favorites ?? 0;
  if (social.engagementRate !== undefined) return social.engagementRate;
  return views ? ((social.likes ?? 0) / views) * 100 : 0;
}

function socialTotals(socials: SocialAccount[]) {
  const videos = socials.reduce((sum, social) => sum + socialMetricValue(social, "videos"), 0);
  const views = socials.reduce((sum, social) => sum + socialMetricValue(social, "views"), 0);
  const avgViews = videos ? views / videos : 0;
  const likes = socials.reduce((sum, social) => sum + socialMetricValue(social, "likes"), 0);
  const comments = socials.reduce((sum, social) => sum + socialMetricValue(social, "comments"), 0);
  const shares = socials.reduce((sum, social) => sum + socialMetricValue(social, "shares"), 0);
  const favorites = socials.reduce((sum, social) => sum + socialMetricValue(social, "favorites"), 0);
  const engagement = views ? (likes / views) * 100 : 0;
  return { avgViews, comments, engagement, favorites, likes, shares, videos, views };
}

function socialTrendValues(socials: SocialAccount[], key: SocialMetricKey) {
  const values = socials.map((social) => socialMetricValue(social, key)).filter((value) => value > 0);
  return values.length ? values : [];
}

function isSocialLoading(social: SocialAccount) {
  return social.status === "Provider pending";
}

function hasDetailedSocialMetrics(social: SocialAccount) {
  return Boolean(social.views || social.avgViews || social.comments || social.shares || social.favorites);
}

function needsSocialLookup(social: SocialAccount) {
  if (social.status === "Provider pending") return true;
  if (social.platform !== "TikTok") return false;
  if (social.status === "No public metrics") return false;
  return !hasDetailedSocialMetrics(social);
}

function socialMetricDisplay(value: number, loading: boolean, suffix = "") {
  if (loading) return <SkeletonLine className="socialMetricSkeleton" />;
  return value ? `${formatNumber(Math.round(value))}${suffix}` : "—";
}

function socialMetricText(value: number, loading: boolean, suffix = "") {
  if (loading) return "Loading";
  return value ? `${formatNumber(Math.round(value))}${suffix}` : "—";
}

const SOCIAL_LOOKUP_TIMEOUT_MS = 15_000;

function SocialTrackingPage({ apps, socials, setSocials, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; setSocials: React.Dispatch<React.SetStateAction<SocialAccount[]>>; isFiltered?: boolean }) {
  const [selectedMetric, setSelectedMetric] = useState<SocialMetricKey>("views");
  const [selectedHandleId, setSelectedHandleId] = useState<string | null>(null);
  const [activeLookups, setActiveLookups] = useState<Set<string>>(() => new Set());
  const inFlightLookups = useRef(new Set<string>());
  const lookupTargets = useMemo(() => socials.filter(needsSocialLookup).map((social) => ({
    handle: social.handle,
    id: social.id,
    platform: social.platform,
  })), [socials]);
  const lookupSignature = JSON.stringify(lookupTargets);

  useEffect(() => {
    const targets = JSON.parse(lookupSignature) as Array<{ handle: string; id: string; platform: string }>;
    for (const social of targets) {
      if (inFlightLookups.current.has(social.id)) continue;
      inFlightLookups.current.add(social.id);
      setActiveLookups((current) => new Set(current).add(social.id));
      setSocials((current) => current.map((row) => row.id === social.id ? { ...row, status: "Provider pending" } : row));
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), SOCIAL_LOOKUP_TIMEOUT_MS);
      fetch(`/api/social-profile?platform=${encodeURIComponent(social.platform)}&handle=${encodeURIComponent(social.handle)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((profile: Partial<SocialAccount> & { status?: SocialAccount["status"]; videoMetricsReady?: boolean }) => {
          const nextStatus = profile.videoMetricsReady ? "Ready for public tracking" : "No public metrics";
          setSocials((current) => current.map((row) => row.id === social.id ? {
            ...row,
            followers: Number.isFinite(profile.followers) ? profile.followers : row.followers,
            views: Number.isFinite(profile.views) ? profile.views : row.views,
            avgViews: Number.isFinite(profile.avgViews) ? profile.avgViews : row.avgViews,
            likes: Number.isFinite(profile.likes) ? profile.likes : row.likes,
            comments: Number.isFinite(profile.comments) ? profile.comments : row.comments,
            favorites: Number.isFinite(profile.favorites) ? profile.favorites : row.favorites,
            posts: Number.isFinite(profile.posts) ? profile.posts : row.posts,
            shares: Number.isFinite(profile.shares) ? profile.shares : row.shares,
            engagementRate: Number.isFinite(profile.engagementRate) ? profile.engagementRate : row.engagementRate,
            source: typeof profile.source === "string" ? profile.source : row.source,
            status: nextStatus,
          } : row));
        })
        .catch(() => {
          setSocials((current) => current.map((row) => row.id === social.id ? { ...row, status: "No public metrics" } : row));
        })
        .finally(() => {
          window.clearTimeout(timer);
          inFlightLookups.current.delete(social.id);
          setActiveLookups((current) => {
            const next = new Set(current);
            next.delete(social.id);
            return next;
          });
        });
    }
  }, [lookupSignature, setSocials]);

  const totals = socialTotals(socials);
  const selectedHandle = socials.find((social) => social.id === selectedHandleId) ?? socials[0];
  const hasMetrics = totals.videos > 0 || totals.views > 0 || totals.likes > 0 || totals.comments > 0 || totals.shares > 0 || totals.favorites > 0 || totals.engagement > 0;
  const isLoading = activeLookups.size > 0 || socials.some(isSocialLoading);
  const loadingCount = Math.max(activeLookups.size, socials.filter(isSocialLoading).length);
  const lookupIds = new Set([...activeLookups, ...socials.filter(isSocialLoading).map((social) => social.id)]);
  const metricIsLoading = (key: SocialMetricKey, value: number) => {
    if (value > 0) return false;
    return isLoading || socials.some((social) => lookupIds.has(social.id) || (social.platform === "TikTok" && social.status === "No public metrics" && !hasDetailedSocialMetrics(social) && key !== "videos" && key !== "likes"));
  };
  const metricCards = [
    { key: "videos" as const, title: "Videos", value: socialMetricDisplay(totals.videos, metricIsLoading("videos", totals.videos)), values: socialTrendValues(socials, "videos") },
    { key: "views" as const, title: "Views", value: socialMetricDisplay(totals.views, metricIsLoading("views", totals.views)), values: socialTrendValues(socials, "views") },
    { key: "avgViews" as const, title: "Avg views", value: socialMetricDisplay(totals.avgViews, metricIsLoading("avgViews", totals.avgViews)), values: socialTrendValues(socials, "avgViews") },
    { key: "likes" as const, title: "Likes", value: socialMetricDisplay(totals.likes, metricIsLoading("likes", totals.likes)), values: socialTrendValues(socials, "likes") },
    { key: "comments" as const, title: "Comments", value: socialMetricDisplay(totals.comments, metricIsLoading("comments", totals.comments)), values: socialTrendValues(socials, "comments") },
    { key: "shares" as const, title: "Shares", value: socialMetricDisplay(totals.shares, metricIsLoading("shares", totals.shares)), values: socialTrendValues(socials, "shares") },
    { key: "favorites" as const, title: "Favorites", value: socialMetricDisplay(totals.favorites, metricIsLoading("favorites", totals.favorites)), values: socialTrendValues(socials, "favorites") },
    { key: "engagement" as const, title: "Engagement", value: socialMetricDisplay(totals.engagement, metricIsLoading("engagement", totals.engagement), "%"), values: socialTrendValues(socials, "engagement") },
  ];

  if (!socials.length) {
    return <EmptyPanel title={isFiltered ? "No handle matches this search" : "No social handles yet"} text={isFiltered ? "Clear the search or try another handle, platform or mapped app." : "Use Add @ to map a TikTok, Instagram or YouTube handle to an app."} />;
  }

  return (
    <section className="socialTrackingPage">
      <section className="moduleMatrix socialMetricGrid">
        {metricCards.map((card) => (
          <LiquidGlass as="button" className={selectedMetric === card.key ? "panel moduleCard socialMetricCard isSelected" : "panel moduleCard socialMetricCard"} type="button" onClick={() => setSelectedMetric(card.key)} key={card.key}>
            <span className="cardAccentRail" aria-hidden="true" />
            <h2>{card.title}</h2>
            <strong>{card.value}</strong>
          </LiquidGlass>
        ))}
      </section>
      {hasMetrics && !(isLoading && !socialTrendValues(socials, selectedMetric).length) ? (
        <TrendPanel title={`${metricCards.find((card) => card.key === selectedMetric)?.title ?? "Social"} trend`} value={socialMetricText(socialMetricValue({ id: "total", handle: "total", platform: "TikTok", appId: "all", createdAt: "", status: "Ready for public tracking", posts: totals.videos, avgViews: totals.avgViews, likes: totals.likes, comments: totals.comments, shares: totals.shares, favorites: totals.favorites, engagementRate: totals.engagement }, selectedMetric), isLoading, selectedMetric === "engagement" ? "%" : "")} detail={`${formatNumber(totals.videos)} videos tracked`} points={socials.map((social) => ({ label: social.handle, value: socialMetricValue(social, selectedMetric) }))} variant="number" currency="USD" />
      ) : isLoading ? (
        <SocialDataSkeleton count={loadingCount} />
      ) : (
        <LiquidGlass className="panel dataPanel socialDataNotice"><h2>No public video metrics</h2><span>{formatNumber(socials.length)} handles mapped</span><button className="ghostButton" type="button" disabled title="TikTok public pages do not always expose video stats without auth.">Source limited</button></LiquidGlass>
      )}
      <section className="socialGrid">
        <SocialTable apps={apps} socials={socials} setSocials={setSocials} isFiltered={isFiltered} onSelect={setSelectedHandleId} selectedId={selectedHandle?.id} />
        <SocialHandleCard apps={apps} social={selectedHandle} />
      </section>
    </section>
  );
}

function SocialDataSkeleton({ count }: { count: number }) {
  return (
    <LiquidGlass className="panel dataPanel socialDataNotice socialLoadingPanel" aria-busy="true">
      <SkeletonLine className="skeletonTitle" />
      <SkeletonLine className="skeletonCaption" />
      <span>{formatNumber(count)} handle lookup{count > 1 ? "s" : ""}</span>
    </LiquidGlass>
  );
}

function SocialMetricCell({ suffix = "", value, loading }: { suffix?: string; value: number; loading: boolean }) {
  if (loading) return <SkeletonLine className="socialMetricSkeleton inline" />;
  return value ? <>{formatNumber(Math.round(value))}{suffix}</> : <>—</>;
}

function SocialTable({ apps, socials, setSocials, isFiltered = false, onSelect, selectedId }: { apps: StudioApp[]; socials: SocialAccount[]; setSocials: React.Dispatch<React.SetStateAction<SocialAccount[]>>; isFiltered?: boolean; onSelect?: (id: string) => void; selectedId?: string }) {
  if (!socials.length) return <EmptyPanel title={isFiltered ? "No handle matches this search" : "No social handles yet"} text={isFiltered ? "Clear the search or try another handle, platform or mapped app." : "Add a TikTok, Instagram or YouTube handle and map it to an app."} />;
  return (
    <LiquidGlass className="panel dataPanel socialTablePanel">
      <div className="panelHeader"><div><p className="caption">Social accounts</p><h2>Public handles</h2></div><span className="pill">{socials.length} handles</span></div>
      <div className="table socialTable socialMetricsTable">
        <div className="tableRow tableHead socialMetricsHead"><span>Handle</span><span>Platform</span><span>App</span><span>Videos</span><span>Views</span><span>Avg views</span><span>Likes</span><span>Comments</span><span>Shares</span><span>Favorites</span><span>Engagement</span><span>Manage</span></div>
        {socials.map((social) => {
          const app = apps.find((row) => row.id === social.appId);
          const videos = socialMetricValue(social, "videos");
          const views = socialMetricValue(social, "views");
          const avgViews = socialMetricValue(social, "avgViews");
          const likes = socialMetricValue(social, "likes");
          const comments = socialMetricValue(social, "comments");
          const shares = socialMetricValue(social, "shares");
          const favorites = socialMetricValue(social, "favorites");
          const engagement = socialMetricValue(social, "engagement");
          const isSelected = selectedId === social.id;
          const loading = isSocialLoading(social);
          return (
            <div
              className={isSelected ? "tableRow socialMetricsRow isSelected" : "tableRow socialMetricsRow"}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={() => onSelect?.(social.id)}
              onKeyDown={(event) => {
                if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                onSelect(social.id);
              }}
              key={social.id}
            >
              <span className="handleCell">{social.handle}</span>
              <span>{social.platform}</span>
              <span>{app ? appDisplayName(app.name) : "Unmapped"}</span>
              <span className="socialMetricNumber"><SocialMetricCell value={videos} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={views} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={avgViews} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={likes} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={comments} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={shares} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={favorites} loading={loading} /></span>
              <span className="socialMetricNumber"><SocialMetricCell value={engagement} loading={loading} suffix="%" /></span>
              <span><button className="ghostButton" type="button" onClick={(event) => { event.stopPropagation(); setSocials((rows) => rows.filter((row) => row.id !== social.id)); }}>Remove</button></span>
            </div>
          );
        })}
      </div>
    </LiquidGlass>
  );
}

function SocialHandleCard({ apps, social }: { apps: StudioApp[]; social?: SocialAccount }) {
  if (!social) return <LiquidGlass className="panel dataPanel socialHandleDetail"><h2>Select a handle</h2></LiquidGlass>;
  const app = apps.find((row) => row.id === social.appId);
  const videos = socialMetricValue(social, "videos");
  const views = socialMetricValue(social, "views");
  const likes = socialMetricValue(social, "likes");
  const comments = socialMetricValue(social, "comments");
  const shares = socialMetricValue(social, "shares");
  const favorites = socialMetricValue(social, "favorites");
  const engagement = socialMetricValue(social, "engagement");
  const loading = isSocialLoading(social);
  return (
    <LiquidGlass className="panel dataPanel socialHandleDetail">
      <div className="panelHeader"><div><p className="caption">{social.platform}</p><h2>{social.handle}</h2></div><span className="pill">{app ? appDisplayName(app.name) : "Unmapped"}</span></div>
      <div className="socialDetailStats">
        <span><strong><SocialMetricCell value={social.followers ?? 0} loading={loading} /></strong><small>Followers</small></span>
        <span><strong><SocialMetricCell value={videos} loading={loading} /></strong><small>Videos</small></span>
        <span><strong><SocialMetricCell value={views} loading={loading} /></strong><small>Views</small></span>
        <span><strong><SocialMetricCell value={likes} loading={loading} /></strong><small>Likes</small></span>
        <span><strong><SocialMetricCell value={comments} loading={loading} /></strong><small>Comments</small></span>
        <span><strong><SocialMetricCell value={shares} loading={loading} /></strong><small>Shares</small></span>
        <span><strong><SocialMetricCell value={favorites} loading={loading} /></strong><small>Favorites</small></span>
        <span><strong><SocialMetricCell value={engagement} loading={loading} suffix="%" /></strong><small>Engagement</small></span>
      </div>
    </LiquidGlass>
  );
}

function creatorStatus(social: SocialAccount) {
  if (isSocialLoading(social)) return "Syncing";
  if (social.status === "Ready for public tracking") return "Tracked";
  return "Source limited";
}

function Creators({ apps, socials, isFiltered = false }: { apps: StudioApp[]; socials: SocialAccount[]; isFiltered?: boolean }) {
  const totals = socialTotals(socials);

  if (!socials.length) return <EmptyPanel title={isFiltered ? "No creator matches this search" : "No creators yet"} text={isFiltered ? "Clear the search or try another creator handle." : "Add public handles in Social Tracking to build the creator CRM."} />;

  return (
    <section className="creatorsCrmPage">
      <section className="moduleMatrix creatorCrmStats">
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>Creators</h2>
          <strong>{formatNumber(socials.length)}</strong>
        </LiquidGlass>
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>Views</h2>
          <strong>{totals.views ? formatNumber(totals.views) : "—"}</strong>
        </LiquidGlass>
        <LiquidGlass className="panel moduleCard">
          <span className="cardAccentRail" aria-hidden="true" />
          <h2>Engagement</h2>
          <strong>{totals.engagement ? `${totals.engagement.toFixed(1)}%` : "—"}</strong>
        </LiquidGlass>
      </section>

      <LiquidGlass className="panel dataPanel creatorSheetPanel">
        <div className="panelHeader">
          <div><p className="caption">Sheet</p><h2>Creator tracking</h2></div>
          <span className="pill">{formatNumber(socials.length)} rows</span>
        </div>
        <div className="table creatorSheetTable">
          <div className="tableRow tableHead creatorSheetHead">
            <span>Creator</span>
            <span>App</span>
            <span>Platform</span>
            <span>Status</span>
            <span>Followers</span>
            <span>Videos</span>
            <span>Views</span>
            <span>Avg views</span>
            <span>Likes</span>
            <span>Comments</span>
            <span>Shares</span>
            <span>Favorites</span>
            <span>Eng.</span>
            <span>Cost</span>
            <span>CPM</span>
            <span>Last update</span>
          </div>
          {socials.map((social) => {
            const app = apps.find((row) => row.id === social.appId);
            const loading = isSocialLoading(social);
            const views = socialMetricValue(social, "views");
            const createdAt = new Date(social.createdAt);
            const dateLabel = Number.isNaN(createdAt.getTime()) ? "—" : createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return (
              <div className="tableRow creatorSheetRow" key={`creator-${social.id}`}>
                <span className="creatorIdentity"><strong>{social.handle}</strong><small>{social.followers ? `${formatNumber(social.followers)} followers` : "Public handle"}</small></span>
                <span>{app ? appDisplayName(app.name) : "Unmapped"}</span>
                <span>{social.platform}</span>
                <span><b className={social.status === "Ready for public tracking" ? "statusOk" : "statusDraft"}>{creatorStatus(social)}</b></span>
                <span className="socialMetricNumber"><SocialMetricCell value={social.followers ?? 0} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "videos")} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={views} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "avgViews")} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "likes")} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "comments")} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "shares")} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "favorites")} loading={loading} /></span>
                <span className="socialMetricNumber"><SocialMetricCell value={socialMetricValue(social, "engagement")} loading={loading} suffix="%" /></span>
                <span className="creatorSheetEmpty">—</span>
                <span className="creatorSheetEmpty">{views ? "Add cost" : "—"}</span>
                <span>{dateLabel}</span>
              </div>
            );
          })}
        </div>
      </LiquidGlass>
    </section>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <LiquidGlass className="panel emptyPanel"><p className="caption">Empty state</p><h2>{title}</h2><p>{text}</p></LiquidGlass>;
}

function Settings({ apps, socials, metrics, onDeleteApp }: { apps: StudioApp[]; socials: SocialAccount[]; metrics: AppStoreMetric[]; onDeleteApp: (appId: string) => void }) {
  return <LiquidGlass className="panel dataPanel"><div className="panelHeader"><div><p className="caption">Settings</p><h2>Apps</h2></div><span className="pill">{apps.length} configured</span></div><div className="settingsAppList">{apps.length ? apps.map((app) => <div className="settingsAppRow" key={`settings-${app.id}`}><AppAvatar app={app} className="appScopeAvatar" /><span><strong title={app.name}>{appDisplayName(app.name)}</strong><small>{app.bundleId || app.platform}</small></span><span><strong>{metrics.some((metric) => metric.appId === app.id) ? "Synced" : "Not synced"}</strong><small>{socials.filter((social) => social.appId === app.id).length} social accounts</small></span><button className="ghostButton dangerButton" type="button" onClick={() => onDeleteApp(app.id)} aria-label={`Delete ${appDisplayName(app.name)}`}><Trash2 size={18} strokeWidth={1.8} />Delete app</button></div>) : <p className="settingsEmpty">No apps configured.</p>}</div></LiquidGlass>;
}
