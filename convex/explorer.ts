import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { loadSpend } from "./expenses";
import { APPS } from "./lib/apps";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";
import { bucketOf, bucketsBetween, loadSales } from "./revenue";
import { eventKind } from "./subscriptions";

// Chart explorer (page Graphiques, like RevenueCat charts): any metric, any resolution, split by a
// dimension, compared with the previous period. Every metric reads its real table; a metric without
// data returns empty series, never invented zeros.
//
// Additive metrics (sums) are summed per bucket; level metrics (subscribers, trials) take the value of
// the last reported day of each bucket.

type Bucket = "day" | "week" | "month";
type Unit = "eur" | "int";
type Point = { day: string; seg: string; value: number };

type MetricDef = {
  label: string;
  group: string;
  unit: Unit;
  additive: boolean;
  description: string;
  segments: string[]; // allowed split dimensions (first = default when splitting)
  /** Points in [from, to]; `segment` names the dimension to fill `seg` with ("none" → ""). */
  load: (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string) => Promise<Point[]>;
};

export const SEGMENT_LABEL: Record<string, string> = {
  none: "Aucun",
  app: "App",
  country: "Pays",
  product: "Produit",
  duration: "Durée",
  source: "Source",
  campaign: "Campagne",
  category: "Catégorie",
  vendor: "Fournisseur",
  account: "Compte",
  platform: "Réseau",
};

const APP_NAME = Object.fromEntries([...APPS.map((a) => [a.slug as string, a.name]), ["otto", "Otto"]]);

/* ---------- Loaders ---------- */

function salesMetric(pick: (s: Awaited<ReturnType<typeof loadSales>>[number]) => number, filter?: (s: Awaited<ReturnType<typeof loadSales>>[number]) => boolean) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> => {
    const rows = await loadSales(ctx, from, to, app);
    const out: Point[] = [];
    for (const s of rows) {
      if (filter && !filter(s)) continue;
      const value = pick(s);
      if (!value) continue;
      const seg = segment === "app" ? s.appSlug : segment === "country" ? s.country : segment === "product" ? s.title || s.sku : "";
      out.push({ day: s.date, seg, value });
    }
    return out;
  };
}

/** Net including Otto (Stripe net when connected, otherwise collected) on the studio view. */
async function loadNet(ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> {
  const out = app === "otto" ? [] : await salesMetric((s) => s.proceedsEur)(ctx, from, to, app, segment);
  if (app && app !== "otto") return out;
  if (segment !== "none" && segment !== "app") return out;
  const stripe = await ctx.db.query("stripeDaily").withIndex("by_project_day", (q) => q.eq("project", "otto").gte("day", from).lte("day", to)).collect();
  if (stripe.length) for (const r of stripe) out.push({ day: r.day, seg: segment === "app" ? "otto" : "", value: r.net });
  else for (const r of await ctx.db.query("ottoDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect()) out.push({ day: r.day, seg: segment === "app" ? "otto" : "", value: r.revenueCents / 100 });
  return out;
}

function subscriptionLevel(pick: (r: { activeStandard: number; activeIntroPaid: number; activePromo: number; activeIntroTrial: number; activeFreeOffer?: number }) => number) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> => {
    const days = (await ctx.db.query("appleReportDays").withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION").gte("date", from).lte("date", to)).collect())
      .filter((d) => d.status === "ok")
      .map((d) => d.date);
    const out: Point[] = [];
    for (const day of days) {
      const rows = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.eq("date", day)).collect();
      for (const r of rows) {
        if (app && r.appSlug !== app) continue;
        const value = pick(r);
        if (!value) continue;
        const seg = segment === "app" ? r.appSlug : segment === "country" ? r.country : segment === "product" ? r.subscriptionName : segment === "duration" ? r.durationLabel : "";
        out.push({ day, seg, value });
      }
    }
    return out;
  };
}

function subscriptionEvents(kinds: string[]) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> => {
    const rows = await ctx.db.query("appleSubscriptionEvents").withIndex("by_date", (q) => q.gte("date", from).lte("date", to)).collect();
    const out: Point[] = [];
    for (const e of rows) {
      if (app && e.appSlug !== app) continue;
      if (!kinds.includes(eventKind(e.event, e.offerType))) continue;
      const seg = segment === "app" ? e.appSlug : segment === "country" ? e.country : segment === "product" ? e.subscriptionName : segment === "duration" ? (e.durationLabel ?? "") : "";
      out.push({ day: e.date, seg, value: e.count });
    }
    return out;
  };
}

function ottoMetric(pick: (r: { reports: number; paid: number; aiCostMicroUsd: number }) => number) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null): Promise<Point[]> => {
    if (app && app !== "otto") return [];
    const rows = await ctx.db.query("ottoDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect();
    return rows.map((r) => ({ day: r.day, seg: "", value: pick(r) }));
  };
}

function storeMetric(pick: (r: { impressions: number; pageViews: number; firstDownloads: number }) => number) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> => {
    const all = (await ctx.db.query("storeFunnelDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect()).filter((r) => !app || r.appSlug === app);
    const ongoing = new Set(all.filter((r) => r.requestKind !== "snapshot").map((r) => `${r.appSlug}|${r.day}`));
    return all
      .filter((r) => r.requestKind !== "snapshot" || !ongoing.has(`${r.appSlug}|${r.day}`))
      .map((r) => ({ day: r.day, seg: segment === "app" ? r.appSlug : segment === "source" ? r.sourceType : "", value: pick(r) }));
  };
}

function adsMetric(pick: (r: { spendEur: number; installs: number }) => number) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> => {
    const rows = (await ctx.db.query("adDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect()).filter((r) => !app || r.appSlug === app);
    return rows.map((r) => ({ day: r.day, seg: segment === "campaign" ? r.campaignName : segment === "app" ? r.appSlug : "", value: pick(r) }));
  };
}

async function loadSpendPoints(ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> {
  const items = (await loadSpend(ctx, from, to, app)).filter((i) => !i.superseded);
  return items.map((i) => ({ day: i.date, seg: segment === "category" ? i.category : segment === "vendor" ? i.vendor : segment === "app" ? (i.appSlug ?? "studio") : "", value: i.amountEur }));
}

function videoMetric(pick: (r: { views: number; comments: number }) => number) {
  return async (ctx: QueryCtx, from: string, to: string, app: string | null, segment: string): Promise<Point[]> => {
    if (app && app !== "otto") return [];
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
    const rows = await ctx.db.query("ottoVideos").withIndex("by_posted", (q) => q.gte("postedAt", start).lt("postedAt", end)).collect();
    return rows.map((r) => ({ day: new Date(r.postedAt).toISOString().slice(0, 10), seg: segment === "account" ? `@${r.account}` : segment === "platform" ? (r.platform === "tiktok" ? "TikTok" : "Instagram") : "", value: pick(r) }));
  };
}

/* ---------- Catalog ---------- */

export const METRICS: Record<string, MetricDef> = {
  net: { label: "Net versé", group: "Revenus", unit: "eur", additive: true, description: "Ce qu'Apple verse (après TVA et commission, remboursements déduits), plus Otto", segments: ["app", "country", "product"], load: loadNet },
  gross: { label: "Chiffre d'affaires brut", group: "Revenus", unit: "eur", additive: true, description: "Ce que les clients ont payé sur l'App Store, TVA incluse", segments: ["app", "country", "product"], load: salesMetric((s) => s.grossEur) },
  refunds: { label: "Remboursements", group: "Revenus", unit: "eur", additive: true, description: "Montant brut remboursé par Apple", segments: ["app", "country", "product"], load: salesMetric((s) => -s.grossEur, (s) => s.units < 0) },
  paid: { label: "Abonnés actifs", group: "Abonnements", unit: "int", additive: false, description: "Abonnements payants actifs en fin de période (rapport Apple)", segments: ["app", "country", "product", "duration"], load: subscriptionLevel((r) => r.activeStandard + r.activeIntroPaid + r.activePromo) },
  trials: { label: "Essais en cours", group: "Abonnements", unit: "int", additive: false, description: "Essais gratuits actifs en fin de période", segments: ["app", "country", "product", "duration"], load: subscriptionLevel((r) => r.activeIntroTrial + (r.activeFreeOffer ?? 0)) },
  trialStarts: { label: "Essais démarrés", group: "Abonnements", unit: "int", additive: true, description: "Nouveaux essais gratuits (événements Apple)", segments: ["app", "country", "product", "duration"], load: subscriptionEvents(["trialStart"]) },
  conversions: { label: "Essais convertis", group: "Abonnements", unit: "int", additive: true, description: "Essais passés en payant", segments: ["app", "country", "product", "duration"], load: subscriptionEvents(["conversion"]) },
  newPaid: { label: "Nouveaux payants", group: "Abonnements", unit: "int", additive: true, description: "Essais convertis + abonnements directs", segments: ["app", "country", "product", "duration"], load: subscriptionEvents(["conversion", "newPaid"]) },
  renewals: { label: "Renouvellements", group: "Abonnements", unit: "int", additive: true, description: "Abonnements renouvelés", segments: ["app", "country", "product", "duration"], load: subscriptionEvents(["renewal"]) },
  cancels: { label: "Résiliations", group: "Abonnements", unit: "int", additive: true, description: "Abonnements arrêtés (volontaires ou échec de paiement)", segments: ["app", "country", "product", "duration"], load: subscriptionEvents(["cancel"]) },
  downloads: { label: "Téléchargements", group: "Acquisition", unit: "int", additive: true, description: "Premiers téléchargements (rapports Sales Apple)", segments: ["app", "country"], load: salesMetric((s) => s.units, (s) => s.isDownload) },
  impressions: { label: "Impressions App Store", group: "Acquisition", unit: "int", additive: true, description: "Icône vue dans une liste (recherche, tops, onglets)", segments: ["app", "source"], load: storeMetric((r) => r.impressions) },
  pageViews: { label: "Vues de la fiche", group: "Acquisition", unit: "int", additive: true, description: "Vues de la page produit App Store", segments: ["app", "source"], load: storeMetric((r) => r.pageViews) },
  storeDownloads: { label: "Téléch. par source", group: "Acquisition", unit: "int", additive: true, description: "1ers téléchargements du rapport Analytics, par source", segments: ["source", "app"], load: storeMetric((r) => r.firstDownloads) },
  adSpend: { label: "Dépense pub", group: "Acquisition", unit: "eur", additive: true, description: "Meta Ads", segments: ["campaign", "app"], load: adsMetric((r) => r.spendEur) },
  adInstalls: { label: "Installations pub", group: "Acquisition", unit: "int", additive: true, description: "Installations rapportées par Meta", segments: ["campaign", "app"], load: adsMetric((r) => r.installs) },
  spend: { label: "Dépenses", group: "Dépenses", unit: "eur", additive: true, description: "Relevés bancaires, saisies et paiements UGC", segments: ["category", "vendor", "app"], load: loadSpendPoints },
  ottoRevenue: { label: "Revenu Otto", group: "Otto", unit: "eur", additive: true, description: "Net Stripe quand Stripe est branché, sinon encaissé (frais non déduits)", segments: [], load: (ctx, from, to, _app, segment) => loadNet(ctx, from, to, "otto", segment) },
  ottoReports: { label: "Rapports Otto", group: "Otto", unit: "int", additive: true, description: "Rapports générés sur ottoknows.it", segments: [], load: ottoMetric((r) => r.reports) },
  ottoPayments: { label: "Paiements Otto", group: "Otto", unit: "int", additive: true, description: "Rapports payés", segments: [], load: ottoMetric((r) => r.paid) },
  ottoAiCost: { label: "Coût IA Otto", group: "Otto", unit: "eur", additive: true, description: "Coût des appels IA (converti du dollar à 1,10)", segments: [], load: ottoMetric((r) => r.aiCostMicroUsd / 1e6 / 1.1) },
  videoViews: { label: "Vues des vidéos", group: "Marketing", unit: "int", additive: true, description: "Vues des vidéos TikTok/Instagram, comptées au jour de publication (dernier relevé)", segments: ["account", "platform"], load: videoMetric((r) => r.views) },
  videoCount: { label: "Vidéos publiées", group: "Marketing", unit: "int", additive: true, description: "Nombre de vidéos publiées", segments: ["account", "platform"], load: videoMetric(() => 1) },
  videoComments: { label: "Commentaires", group: "Marketing", unit: "int", additive: true, description: "Commentaires des vidéos, au jour de publication", segments: ["account", "platform"], load: videoMetric((r) => r.comments) },
};

/* ---------- Aggregation ---------- */

const MAX_SEGMENTS = 8;

function toSeries(points: Point[], x: string[], bucket: Bucket, additive: boolean) {
  const index = new Map(x.map((k, i) => [k, i]));
  const segs = new Map<string, (number | null)[]>();
  // Level metrics: keep only the last reported day of each bucket.
  const lastDay = new Map<string, string>();
  if (!additive) for (const p of points) {
    const k = bucketOf(p.day, bucket);
    if (!lastDay.has(k) || p.day > lastDay.get(k)!) lastDay.set(k, p.day);
  }
  const touched = new Set<string>();
  for (const p of points) {
    const k = bucketOf(p.day, bucket);
    const i = index.get(k);
    if (i == null) continue;
    if (!additive && lastDay.get(k) !== p.day) continue;
    if (!segs.has(p.seg)) segs.set(p.seg, x.map(() => null));
    const arr = segs.get(p.seg)!;
    arr[i] = (arr[i] ?? 0) + p.value;
    touched.add(k);
  }
  // Additive metrics: a bucket with data for some segment is 0 (not a gap) for the others.
  if (additive) for (const arr of segs.values()) x.forEach((k, i) => arr[i] == null && touched.has(k) && (arr[i] = 0));
  return segs;
}

const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

export const catalog = authQuery({
  args: {},
  handler: async () => ({
    metrics: Object.entries(METRICS).map(([key, m]) => ({ key, label: m.label, group: m.group, unit: m.unit, additive: m.additive, description: m.description, segments: ["none", ...m.segments].map((s) => ({ key: s, label: SEGMENT_LABEL[s] ?? s })) })),
  }),
});

export const series = authQuery({
  args: {
    metric: v.string(),
    from: v.string(),
    to: v.string(),
    prevFrom: v.string(),
    prevTo: v.string(),
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    segment: v.string(),
    app: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { metric, from, to, prevFrom, prevTo, bucket, segment, app }) => {
    const def = METRICS[metric];
    if (!def) throw new Error(`Indicateur inconnu : ${metric}`);
    const seg = segment === "none" || def.segments.includes(segment) ? segment : "none";
    const x = bucketsBetween(from, to, bucket);
    const prevX = bucketsBetween(prevFrom, prevTo, bucket);

    const points = await def.load(ctx, from, to, app ?? null, seg);
    const raw = toSeries(points, x, bucket, def.additive);

    // Top segments by total; the rest goes into "Autres".
    const ranked = [...raw].map(([key, values]) => ({ key, values, total: values.reduce<number>((t, val) => t + (val ?? 0), 0) })).sort((a, b) => b.total - a.total);
    const kept = ranked.slice(0, MAX_SEGMENTS);
    const rest = ranked.slice(MAX_SEGMENTS);
    if (rest.length) kept.push({ key: "__other", values: x.map((_, i) => rest.reduce<number | null>((t, s) => (s.values[i] == null ? t : (t ?? 0) + (s.values[i] as number)), null)), total: rest.reduce((t, s) => t + s.total, 0) });

    const label = (key: string) => (key === "__other" ? `Autres (${rest.length})` : key === "" ? def.label : seg === "app" ? (APP_NAME[key] ?? (key === "studio" ? "Studio" : key)) : key);
    const totalSeries = x.map((_, i) => ranked.reduce<number | null>((t, s) => (s.values[i] == null ? t : (t ?? 0) + (s.values[i] as number)), null));

    const prevPoints = await def.load(ctx, prevFrom, prevTo, app ?? null, "none");
    const prevRaw = toSeries(prevPoints, prevX, bucket, def.additive).get("") ?? prevX.map(() => null);
    // Align the previous period on the current buckets by position.
    const previous = x.map((_, i) => r2(prevRaw[i] ?? null));

    const sum = (arr: (number | null)[]) => arr.reduce<number>((t, val) => t + (val ?? 0), 0);
    const lastOf = (arr: (number | null)[]) => [...arr].reverse().find((val) => val != null) ?? null;
    const summary = def.additive ? { current: r2(sum(totalSeries)), previous: prevPoints.length ? r2(sum(prevRaw)) : null } : { current: r2(lastOf(totalSeries)), previous: r2(lastOf(prevRaw)) };

    return {
      metric,
      label: def.label,
      unit: def.unit,
      additive: def.additive,
      segment: seg,
      x,
      prevX: prevX.slice(0, x.length),
      series: kept.map((s) => ({ key: s.key || "total", label: label(s.key), values: s.values.map(r2), total: r2(s.total) })),
      total: totalSeries.map(r2),
      previous,
      summary,
      hasData: points.length > 0,
    };
  },
});
