import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { APPS } from "./lib/apps";
import { authMutation, authQuery } from "./lib/auth";
import { addDays, isoDay } from "./lib/dates";
import { assertAmount, assertDay, assertMaxLength } from "./lib/validate";
import { loadSales } from "./revenue";

// Pilotage model (page Aujourd'hui): goals, experiments, annotations and the daily action list.
// Every number is computed from stored real data (appleSales, appleSubscriptionDaily, ottoDaily,
// ottoVideos...). A metric that has no data for a project returns null, never 0.

export const PROJECTS = ["studio", ...APPS.map((a) => a.slug as string), "otto"] as const;
const APP_SLUGS = new Set<string>(APPS.map((a) => a.slug));

type Unit = "eur" | "int" | "pct" | "decimal";
type MetricDef = {
  label: string;
  unit: Unit;
  /** Additive metrics (sums) are projected to the end of the month; levels and rates are not. */
  additive: boolean;
  projects: (p: string) => boolean;
  /** Last day with data (Apple publishes a day late). */
  source: "apple" | "otto";
};

const appleOrStudio = (p: string) => p === "studio" || APP_SLUGS.has(p);
const anyProject = () => true;
const ottoOnly = (p: string) => p === "otto";

export const METRICS: Record<string, MetricDef> = {
  net: { label: "Net versé", unit: "eur", additive: true, projects: anyProject, source: "apple" },
  downloads: { label: "Téléchargements", unit: "int", additive: true, projects: appleOrStudio, source: "apple" },
  paid: { label: "Abonnés actifs", unit: "int", additive: false, projects: appleOrStudio, source: "apple" },
  reports: { label: "Rapports générés", unit: "int", additive: true, projects: ottoOnly, source: "otto" },
  payments: { label: "Paiements", unit: "int", additive: true, projects: ottoOnly, source: "otto" },
  conversion: { label: "Conversion rapport → paiement", unit: "pct", additive: false, projects: ottoOnly, source: "otto" },
  medianViews: { label: "Vues médianes par vidéo", unit: "int", additive: false, projects: ottoOnly, source: "otto" },
  commentsPer1k: { label: "Commentaires pour 1 000 vues", unit: "decimal", additive: false, projects: ottoOnly, source: "otto" },
};

function parisDay(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return isoDay(new Date(ms));
  }
}

async function latestAppleDay(ctx: QueryCtx): Promise<string | null> {
  const rows = await ctx.db.query("appleReportDays").withIndex("by_type_date", (q) => q.eq("reportType", "SALES")).order("desc").take(30);
  return rows.find((r) => r.status === "ok" || r.status === "empty")?.date ?? null;
}

/** Last day each source has data for. */
async function dataDays(ctx: QueryCtx) {
  return { apple: await latestAppleDay(ctx), otto: addDays(parisDay(Date.now()), -1) };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Value of a metric for a project over [from, to] (days included). */
export async function metricValue(ctx: QueryCtx, project: string, metric: string, from: string, to: string): Promise<number | null> {
  const def = METRICS[metric];
  if (!def || !def.projects(project) || to < from) return null;
  const isApple = project === "studio" || APP_SLUGS.has(project);
  const app = APP_SLUGS.has(project) ? project : null;

  if (metric === "net") {
    let total = 0;
    if (isApple) for (const s of await loadSales(ctx, from, to, app)) total += s.proceedsEur;
    if (project === "studio" || project === "otto") {
      const rows = await ctx.db.query("ottoDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect();
      if (project === "otto" && !rows.length) return null;
      for (const r of rows) total += r.revenueCents / 100;
    }
    return Math.round(total * 100) / 100;
  }
  if (metric === "downloads") {
    let total = 0;
    for (const s of await loadSales(ctx, from, to, app)) if (s.isDownload) total += s.units;
    return total;
  }
  if (metric === "paid") {
    const head = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.lte("date", to)).order("desc").first();
    if (!head || head.date < from) return null;
    const rows = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.eq("date", head.date)).collect();
    return rows.filter((r) => !app || r.appSlug === app).reduce((t, r) => t + r.activeStandard + r.activeIntroPaid + r.activePromo, 0);
  }
  if (metric === "reports" || metric === "payments" || metric === "conversion") {
    const rows = await ctx.db.query("ottoDaily").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect();
    if (!rows.length) return null;
    const reports = rows.reduce((t, r) => t + r.reports, 0);
    const paid = rows.reduce((t, r) => t + r.paid, 0);
    if (metric === "reports") return reports;
    if (metric === "payments") return paid;
    return reports ? paid / reports : null;
  }
  if (metric === "medianViews" || metric === "commentsPer1k") {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
    const videos = (await ctx.db.query("ottoVideos").withIndex("by_posted", (q) => q.gte("postedAt", start).lt("postedAt", end)).collect());
    if (!videos.length) return null;
    if (metric === "medianViews") return median(videos.map((x) => x.views));
    const views = videos.reduce((t, x) => t + x.views, 0);
    return views ? (videos.reduce((t, x) => t + x.comments, 0) / views) * 1000 : null;
  }
  return null;
}

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m, 0)));
};

async function goalProgress(ctx: QueryCtx, goal: { project: string; metric: string; month: string; target: number }, days: { apple: string | null; otto: string }) {
  const def = METRICS[goal.metric];
  const first = `${goal.month}-01`;
  const last = monthEnd(goal.month);
  const dataDay = def ? days[def.source] : null;
  const to = dataDay && dataDay < last ? dataDay : last;
  const value = to >= first ? await metricValue(ctx, goal.project, goal.metric, first, to) : null;
  const total = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
  const elapsed = to >= first ? Math.round((Date.parse(to) - Date.parse(first)) / 86400000) + 1 : 0;
  const projection = value == null ? null : def?.additive && elapsed > 0 ? (value * total) / elapsed : value;
  const ratio = projection == null || goal.target === 0 ? null : projection / goal.target;
  return { value, projection, ratio, elapsed, total, dataTo: to >= first ? to : null };
}

async function experimentResult(ctx: QueryCtx, e: { project: string; metric: string; startDay: string; endDay: string }, days: { apple: string | null; otto: string }) {
  const def = METRICS[e.metric];
  const dataDay = def ? days[def.source] : null;
  const afterTo = dataDay && dataDay < e.endDay ? dataDay : e.endDay;
  if (!dataDay || afterTo < e.startDay) return { before: null, after: null, change: null, days: 0, from: null, to: null };
  const n = Math.round((Date.parse(afterTo) - Date.parse(e.startDay)) / 86400000) + 1;
  const before = await metricValue(ctx, e.project, e.metric, addDays(e.startDay, -n), addDays(e.startDay, -1));
  const after = await metricValue(ctx, e.project, e.metric, e.startDay, afterTo);
  const change = before == null || after == null || before === 0 ? null : (after - before) / Math.abs(before);
  return { before, after, change, days: n, from: e.startDay, to: afterTo };
}

/* ---------------- Queries ---------------- */

export const catalog = authQuery({
  args: {},
  handler: async () => ({
    projects: PROJECTS.map((p) => p as string),
    metrics: Object.entries(METRICS).map(([key, d]) => ({ key, label: d.label, unit: d.unit, projects: PROJECTS.filter((p) => d.projects(p)).map((p) => p as string) })),
  }),
});

export const goals = authQuery({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const days = await dataDays(ctx);
    const rows = await ctx.db.query("goals").withIndex("by_month", (q) => q.eq("month", month)).collect();
    const out = [];
    for (const g of rows) out.push({ ...g, unit: METRICS[g.metric]?.unit ?? "int", metricLabel: METRICS[g.metric]?.label ?? g.metric, ...(await goalProgress(ctx, g, days)) });
    return out;
  },
});

export const experiments = authQuery({
  args: {},
  handler: async (ctx) => {
    const days = await dataDays(ctx);
    const rows = await ctx.db.query("experiments").withIndex("by_start").order("desc").take(50);
    const out = [];
    for (const e of rows) out.push({ ...e, unit: METRICS[e.metric]?.unit ?? "int", metricLabel: METRICS[e.metric]?.label ?? e.metric, result: await experimentResult(ctx, e, days) });
    return out;
  },
});

/** Manual annotations + App Store releases, newest first. */
export const annotations = authQuery({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const manual = await ctx.db.query("annotations").withIndex("by_day", (q) => q.gte("day", from).lte("day", to)).collect();
    const versions = await ctx.db.query("appVersions").collect();
    const releases = versions
      .filter((r) => r.releasedAt && r.releasedAt.slice(0, 10) >= from && r.releasedAt.slice(0, 10) <= to)
      .map((r) => ({ _id: null, day: r.releasedAt!.slice(0, 10), project: r.appSlug, kind: "release" as const, label: `Version ${r.versionString} en ligne` }));
    return [...manual.map((a) => ({ _id: a._id, day: a.day, project: a.project, kind: a.kind, label: a.label })), ...releases].sort((a, b) => b.day.localeCompare(a.day));
  },
});

/** Shared with the Telegram brief and the weekly review. */
export const todayInternal = internalQuery({ args: {}, handler: (ctx) => buildToday(ctx) });

export const today = authQuery({ args: {}, handler: (ctx) => buildToday(ctx) });

type Action = { key: string; severity: "critical" | "warning" | "neutral"; title: string; detail: string | null; href: string };

async function buildToday(ctx: QueryCtx) {
  const now = Date.now();
  const todayParis = parisDay(now);
  const days = await dataDays(ctx);
  const actions: Action[] = [];

  // 1. Sources down (opened by the hourly watchdog).
  const alerts = (await ctx.db.query("alerts").withIndex("by_opened").order("desc").take(200)).filter((a) => a.resolvedAt === undefined);
  for (const a of alerts) actions.push({ key: a.key, severity: a.kind === "source" ? "critical" : "warning", title: a.message, detail: a.kind === "source" ? "Synchro à réparer" : "Écart inhabituel", href: a.kind === "source" ? "/sources" : "/" });

  // 2. Versions validated by Apple, waiting for Jos.
  const versions = await ctx.db.query("appVersions").collect();
  for (const r of versions.filter((x) => x.state === "PENDING_DEVELOPER_RELEASE")) {
    actions.push({ key: `release:${r.versionId}`, severity: "warning", title: `Publier ${APPS.find((a) => a.slug === r.appSlug)?.name ?? r.appSlug} ${r.versionString}`, detail: "Validée par Apple, en attente de ta publication", href: "/versions" });
  }
  for (const r of versions.filter((x) => x.state === "REJECTED" || x.state === "METADATA_REJECTED")) {
    actions.push({ key: `rejected:${r.versionId}`, severity: "critical", title: `${APPS.find((a) => a.slug === r.appSlug)?.name ?? r.appSlug} ${r.versionString} rejetée`, detail: "Lire le motif dans App Store Connect", href: "/versions" });
  }

  // 3. Low reviews without an answer (last 30 days).
  const since = addDays(todayParis, -30);
  let unanswered = 0;
  for (const a of APPS) {
    const rows = await ctx.db.query("appReviews").withIndex("by_app_created", (q) => q.eq("appSlug", a.slug).gte("createdAt", since)).collect();
    unanswered += rows.filter((r) => r.rating <= 3 && !r.hasResponse).length;
  }
  if (unanswered) actions.push({ key: "reviews", severity: "warning", title: `Répondre à ${unanswered} avis ≤ 3★`, detail: "Derniers 30 jours, sans réponse", href: "/avis" });

  // 4. Otto videos waiting for validation.
  const snap = await ctx.db.query("ottoSnapshot").first();
  const toValidate = snap?.validation.filter((x) => x.status === "a_valider").reduce((t, x) => t + x.count, 0) ?? 0;
  if (toValidate) actions.push({ key: "otto-validate", severity: toValidate > 50 ? "warning" : "neutral", title: `Valider ${toValidate} vidéos Otto`, detail: "File du bot Telegram", href: "/projets/otto" });

  // 5. Experiments past their end date, not decided.
  const exps = await ctx.db.query("experiments").withIndex("by_start").order("desc").take(50);
  for (const e of exps.filter((x) => x.status === "running" && x.endDay < todayParis)) {
    actions.push({ key: `exp:${e._id}`, severity: "warning", title: `Trancher l'expérience « ${e.title} »`, detail: `Terminée le ${e.endDay}`, href: "/aujourdhui#experiences" });
  }

  // 6. Goals behind pace this month.
  const month = todayParis.slice(0, 7);
  const goalRows = await ctx.db.query("goals").withIndex("by_month", (q) => q.eq("month", month)).collect();
  for (const g of goalRows) {
    const p = await goalProgress(ctx, g, days);
    if (p.ratio != null && p.ratio < 0.9 && p.elapsed >= 5) {
      actions.push({ key: `goal:${g._id}`, severity: "warning", title: `Objectif en retard : ${METRICS[g.metric]?.label ?? g.metric} (${g.project})`, detail: `Projection à ${Math.round(p.ratio * 100)} % de la cible`, href: "/aujourdhui#objectifs" });
    }
  }
  if (!goalRows.length) actions.push({ key: "no-goals", severity: "neutral", title: "Fixer les objectifs du mois", detail: "Sans cible, pas de cap", href: "/aujourdhui#objectifs" });

  // 7. Expenses: nothing imported for 35 days → the margin is blind.
  const lastBatch = await ctx.db.query("importBatches").order("desc").first();
  if (!lastBatch || now - lastBatch._creationTime > 35 * 86400000) {
    actions.push({ key: "bank", severity: "warning", title: "Importer le relevé bancaire", detail: lastBatch ? "Dernier import il y a plus de 35 jours" : "Aucun import : la marge est inconnue", href: "/depenses" });
  }

  const rank = { critical: 0, warning: 1, neutral: 2 };
  actions.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // Yesterday at a glance: last Apple day per app vs the same weekday a week before; Otto yesterday.
  const pulse: { project: string; metric: string; day: string; value: number | null; prev: number | null }[] = [];
  if (days.apple) {
    const prevDay = addDays(days.apple, -7);
    for (const a of APPS) {
      pulse.push({ project: a.slug, metric: "net", day: days.apple, value: await metricValue(ctx, a.slug, "net", days.apple, days.apple), prev: await metricValue(ctx, a.slug, "net", prevDay, prevDay) });
    }
    pulse.push({ project: "studio", metric: "downloads", day: days.apple, value: await metricValue(ctx, "studio", "downloads", days.apple, days.apple), prev: await metricValue(ctx, "studio", "downloads", prevDay, prevDay) });
  }
  const ottoPrev = addDays(days.otto, -7);
  for (const m of ["reports", "payments", "net"]) {
    pulse.push({ project: "otto", metric: m, day: days.otto, value: await metricValue(ctx, "otto", m, days.otto, days.otto), prev: await metricValue(ctx, "otto", m, ottoPrev, ottoPrev) });
  }

  return { today: todayParis, dataDays: days, actions, pulse };
}

/* ---------------- Mutations ---------------- */

function assertProjectMetric(project: string, metric: string) {
  if (!(PROJECTS as readonly string[]).includes(project)) throw new Error(`Projet inconnu : ${project}`);
  const def = METRICS[metric];
  if (!def) throw new Error(`Indicateur inconnu : ${metric}`);
  if (!def.projects(project)) throw new Error(`« ${def.label} » n'existe pas pour ${project}`);
}

export const setGoal = authMutation({
  args: { project: v.string(), metric: v.string(), month: v.string(), target: v.number() },
  handler: async (ctx, args) => {
    assertProjectMetric(args.project, args.metric);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) throw new Error("Mois invalide (AAAA-MM)");
    assertAmount(args.target, "Cible");
    const existing = (await ctx.db.query("goals").withIndex("by_month", (q) => q.eq("month", args.month)).collect()).find((g) => g.project === args.project && g.metric === args.metric);
    if (existing) return ctx.db.patch(existing._id, { target: args.target });
    await ctx.db.insert("goals", { ...args, createdAt: Date.now() });
  },
});

export const removeGoal = authMutation({ args: { id: v.id("goals") }, handler: (ctx, { id }) => ctx.db.delete(id) });

export const addExperiment = authMutation({
  args: { project: v.string(), title: v.string(), hypothesis: v.string(), metric: v.string(), startDay: v.string(), endDay: v.string() },
  handler: async (ctx, args) => {
    assertProjectMetric(args.project, args.metric);
    assertDay(args.startDay, "Début");
    assertDay(args.endDay, "Fin");
    if (args.endDay < args.startDay) throw new Error("La fin est avant le début");
    if (!args.title.trim()) throw new Error("Donne un titre à l'expérience");
    assertMaxLength(args.title, 120, "Titre");
    assertMaxLength(args.hypothesis, 600, "Hypothèse");
    await ctx.db.insert("experiments", { ...args, title: args.title.trim(), hypothesis: args.hypothesis.trim(), status: "running", createdAt: Date.now() });
  },
});

export const decideExperiment = authMutation({
  args: { id: v.id("experiments"), decision: v.union(v.literal("keep"), v.literal("drop"), v.literal("inconclusive")), note: v.optional(v.string()) },
  handler: async (ctx, { id, decision, note }) => {
    assertMaxLength(note, 600, "Note");
    await ctx.db.patch(id, { status: "done", decision, note: note?.trim() || undefined });
  },
});

export const removeExperiment = authMutation({ args: { id: v.id("experiments") }, handler: (ctx, { id }) => ctx.db.delete(id) });

export const addAnnotation = authMutation({
  args: { day: v.string(), project: v.string(), kind: v.union(v.literal("price"), v.literal("campaign"), v.literal("content"), v.literal("product"), v.literal("other")), label: v.string() },
  handler: async (ctx, args) => {
    assertDay(args.day, "Date");
    if (!(PROJECTS as readonly string[]).includes(args.project)) throw new Error(`Projet inconnu : ${args.project}`);
    if (!args.label.trim()) throw new Error("Écris ce qui s'est passé");
    assertMaxLength(args.label, 160, "Libellé");
    await ctx.db.insert("annotations", { ...args, label: args.label.trim(), createdAt: Date.now() });
  },
});

export const removeAnnotation = authMutation({ args: { id: v.id("annotations") }, handler: (ctx, { id }) => ctx.db.delete(id) });
