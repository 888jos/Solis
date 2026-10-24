import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { loadSpend } from "./expenses";
import { authQuery } from "./lib/auth";
import { APPS } from "./lib/apps";
import { addDays } from "./lib/dates";
import { telegramConfigured, sendTelegram } from "./sources/telegram";
import type { SourceStatusRow } from "./sources";
import { eventKind } from "./subscriptions";

// Telegram brief: a short French message built only from stored real data.
//  - daily (cron 06:30 UTC): latest published Apple sales day, net by app vs the same weekday a week
//    before, trials / conversions / new paid of that day, yesterday's spend, month to date, reviews
//    of the last 24 h, sources in trouble.
//  - weekly (cron Monday): last Monday→Sunday vs the week before.
// Apple publishes a Pacific-time day around 13:00 UTC the next day, so at 06:30 UTC the latest
// complete sales day is usually D-2. The message always names the day it talks about.

type Kind = "daily" | "weekly";

/* ---------- Formatting (no Intl dependency in the Convex runtime) ---------- */

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function eur(n: number): string {
  const abs = Math.abs(n);
  const s = abs < 100 ? abs.toFixed(2) : Math.round(abs).toString();
  const [i, d] = s.split(".");
  return `${n < 0 ? "−" : ""}${groupThousands(i)}${d ? `,${d}` : ""} €`;
}

function pctChange(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "=" : "nouveau";
  const p = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return p === 0 ? "=" : `${p > 0 ? "+" : "−"}${Math.abs(p)} %`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Calendar day in Paris (falls back to UTC if the runtime lacks the zone). */
function parisDay(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/* ---------- Data ---------- */

type AppNumbers = Record<string, number>;

async function reportDays(ctx: QueryCtx, reportType: string, from: string, to: string) {
  const rows = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", reportType).gte("date", from).lte("date", to))
    .collect();
  return new Set(rows.filter((r) => r.status === "ok" || r.status === "empty").map((r) => r.date));
}

async function latestSalesDay(ctx: QueryCtx, notAfter: string): Promise<string | null> {
  const rows = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", "SALES").lte("date", notAfter))
    .order("desc")
    .take(30);
  return rows.find((r) => r.status === "ok" || r.status === "empty")?.date ?? null;
}

async function sales(ctx: QueryCtx, from: string, to: string) {
  const rows = await ctx.db.query("appleSales").withIndex("by_date", (q) => q.gte("date", from).lte("date", to)).collect();
  const net: AppNumbers = {};
  let gross = 0;
  for (const r of rows) {
    net[r.appSlug] = (net[r.appSlug] ?? 0) + r.proceedsEur;
    gross += r.grossEur;
  }
  const total = Object.values(net).reduce((s, n) => s + n, 0);
  return { net, total, gross };
}

async function subEvents(ctx: QueryCtx, from: string, to: string) {
  const rows = await ctx.db.query("appleSubscriptionEvents").withIndex("by_date", (q) => q.gte("date", from).lte("date", to)).collect();
  const out = { trials: 0, conversions: 0, newPaid: 0, refunds: 0, byApp: {} as Record<string, { trials: number; conversions: number; newPaid: number }> };
  for (const r of rows) {
    const k = eventKind(r.event, r.offerType);
    const a = (out.byApp[r.appSlug] ??= { trials: 0, conversions: 0, newPaid: 0 });
    if (k === "trialStart") (out.trials += r.count), (a.trials += r.count);
    else if (k === "conversion") (out.conversions += r.count), (a.conversions += r.count);
    else if (k === "newPaid") (out.newPaid += r.count), (a.newPaid += r.count);
    else if (k === "refund") out.refunds += r.count;
  }
  return out;
}

async function spend(ctx: QueryCtx, from: string, to: string) {
  const items = (await loadSpend(ctx, from, to)).filter((i) => !i.superseded);
  const total = items.reduce((s, i) => s + i.amountEur, 0);
  const byVendor = new Map<string, number>();
  for (const i of items) byVendor.set(i.vendor, (byVendor.get(i.vendor) ?? 0) + i.amountEur);
  const top = [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([vendor, amount]) => ({ vendor, amount }));
  return { total, count: items.length, top };
}

async function reviewsSince(ctx: QueryCtx, sinceIso: string) {
  const out: { appSlug: string; rating: number; title: string | null; territory: string; createdAt: string }[] = [];
  for (const app of APPS) {
    const rows = await ctx.db
      .query("appReviews")
      .withIndex("by_app_created", (q) => q.eq("appSlug", app.slug).gte("createdAt", sinceIso))
      .collect();
    for (const r of rows) out.push({ appSlug: r.appSlug, rating: r.rating, title: r.title ?? null, territory: r.territory, createdAt: r.createdAt });
  }
  return out;
}

export const dailyData = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const today = parisDay(now);
    const yesterday = addDays(today, -1);
    const salesDay = await latestSalesDay(ctx, yesterday);
    const monthStart = `${today.slice(0, 7)}-01`;
    // On the 1st, "month to date" is still about the month that just ended.
    const mtdStart = today.endsWith("-01") ? `${yesterday.slice(0, 7)}-01` : monthStart;
    const eventDays = salesDay ? await reportDays(ctx, "SUBSCRIPTION_EVENT", salesDay, salesDay) : new Set<string>();
    return {
      today,
      yesterday,
      salesDay,
      cur: salesDay ? await sales(ctx, salesDay, salesDay) : null,
      prev: salesDay ? await sales(ctx, addDays(salesDay, -7), addDays(salesDay, -7)) : null,
      events: salesDay && eventDays.has(salesDay) ? await subEvents(ctx, salesDay, salesDay) : null,
      spendYesterday: await spend(ctx, yesterday, yesterday),
      mtd: {
        start: mtdStart,
        salesTo: salesDay && salesDay >= mtdStart ? salesDay : null,
        net: salesDay && salesDay >= mtdStart ? (await sales(ctx, mtdStart, salesDay)).total : 0,
        spend: (await spend(ctx, mtdStart, yesterday < mtdStart ? mtdStart : yesterday)).total,
      },
      reviews: await reviewsSince(ctx, new Date(now - 86400000).toISOString()),
    };
  },
});

export const weeklyData = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const today = parisDay(now);
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const weekStart = addDays(today, -dow - 7);
    const weekEnd = addDays(weekStart, 6);
    const prevStart = addDays(weekStart, -7);
    const prevEnd = addDays(weekStart, -1);
    const covered = await reportDays(ctx, "SALES", weekStart, weekEnd);
    const covEvents = await reportDays(ctx, "SUBSCRIPTION_EVENT", weekStart, weekEnd);
    const salesCur = await sales(ctx, weekStart, weekEnd);
    const salesPrev = await sales(ctx, prevStart, prevEnd);
    const spendCur = await spend(ctx, weekStart, weekEnd);
    const spendPrev = await spend(ctx, prevStart, prevEnd);
    return {
      weekStart,
      weekEnd,
      salesDaysCovered: covered.size,
      eventDaysCovered: covEvents.size,
      cur: salesCur,
      prev: salesPrev,
      events: await subEvents(ctx, weekStart, weekEnd),
      eventsPrev: await subEvents(ctx, prevStart, prevEnd),
      spendCur,
      spendPrev,
      reviews: (await reviewsSince(ctx, `${weekStart}T00:00:00Z`)).filter((r) => r.createdAt < `${addDays(weekEnd, 1)}T00:00:00Z`),
    };
  },
});

/* ---------- Composition ---------- */

type DailyData = {
  today: string;
  yesterday: string;
  salesDay: string | null;
  cur: { net: AppNumbers; total: number; gross: number } | null;
  prev: { net: AppNumbers; total: number; gross: number } | null;
  events: { trials: number; conversions: number; newPaid: number; refunds: number } | null;
  spendYesterday: { total: number; count: number; top: { vendor: string; amount: number }[] };
  mtd: { start: string; salesTo: string | null; net: number; spend: number };
  reviews: { appSlug: string; rating: number; title: string | null; territory: string }[];
};

const appName = (slug: string) => APPS.find((a) => a.slug === slug)?.name ?? slug;

function reviewsBlock(reviews: { appSlug: string; rating: number; title: string | null }[], label: string): string[] {
  if (!reviews.length) return [`<b>Avis ${label}</b> : aucun nouveau`];
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const lines = [`<b>Avis ${label}</b> : ${reviews.length} nouveau${reviews.length > 1 ? "x" : ""}, moyenne ${avg.toFixed(1).replace(".", ",")} ★`];
  const low = reviews.filter((r) => r.rating <= 2).slice(0, 3);
  for (const r of low) lines.push(`  ${appName(r.appSlug)} ${r.rating}★${r.title ? ` « ${esc(r.title.slice(0, 60))} »` : ""}`);
  return lines;
}

function syncBlock(statuses: SourceStatusRow[]): string[] {
  const bad = statuses.filter((s) => s.health === "error" || s.health === "interrupted" || s.health === "late");
  if (!bad.length) return ["<b>Syncs</b> : tout est à jour"];
  const lines = [`<b>Syncs</b> : ${bad.length} à regarder`];
  for (const s of bad.slice(0, 5)) {
    const why = s.health === "late" ? "en retard" : s.health === "interrupted" ? "interrompue" : (s.lastErrorMessage ?? "erreur").slice(0, 90);
    lines.push(`  ${esc(s.name)} : ${esc(why)}`);
  }
  return lines;
}

function composeDaily(d: DailyData, statuses: SourceStatusRow[]): string {
  const out: string[] = [`<b>Solis · ${dayLabel(d.today)}</b>`, ""];
  if (!d.salesDay || !d.cur || !d.prev) {
    out.push("<b>Ventes</b> : aucun rapport Apple en base");
  } else {
    const prevDay = addDays(d.salesDay, -7);
    out.push(`<b>Net Apple du ${dayLabel(d.salesDay)}</b> : ${eur(d.cur.total)} (${pctChange(d.cur.total, d.prev.total)} vs ${dayLabel(prevDay)})`);
    for (const app of APPS) {
      const c = d.cur.net[app.slug] ?? 0;
      const p = d.prev.net[app.slug] ?? 0;
      if (c === 0 && p === 0) continue;
      out.push(`  ${app.name} ${eur(c)} (${pctChange(c, p)})`);
    }
    if (d.cur.gross > 0) out.push(`  Brut payé par les clients ${eur(d.cur.gross)}`);
    if (d.events) out.push(`Essais ${d.events.trials} · conversions ${d.events.conversions} · nouveaux payants ${d.events.newPaid}${d.events.refunds ? ` · remboursements ${d.events.refunds}` : ""}`);
    else out.push("Essais et conversions : rapport Apple pas encore publié");
  }
  out.push("");
  const sp = d.spendYesterday;
  out.push(`<b>Dépenses du ${dayLabel(d.yesterday)}</b> : ${sp.count ? `${eur(sp.total)} (${sp.top.map((t) => esc(t.vendor)).join(", ")})` : "aucune enregistrée"}`);
  const month = MONTHS_LONG[Number(d.mtd.start.slice(5, 7)) - 1];
  const mtdNet = d.mtd.salesTo ? d.mtd.net : 0;
  out.push(`<b>${month[0].toUpperCase()}${month.slice(1)}</b> : net ${eur(mtdNet)} · dépenses ${eur(d.mtd.spend)} · marge ${eur(mtdNet - d.mtd.spend)}`);
  out.push("");
  out.push(...reviewsBlock(d.reviews, "24 h"));
  out.push(...syncBlock(statuses));
  return out.join("\n");
}

type WeeklyData = {
  weekStart: string;
  weekEnd: string;
  salesDaysCovered: number;
  eventDaysCovered: number;
  cur: { net: AppNumbers; total: number; gross: number };
  prev: { net: AppNumbers; total: number; gross: number };
  events: { trials: number; conversions: number; newPaid: number; refunds: number };
  eventsPrev: { trials: number; conversions: number; newPaid: number; refunds: number };
  spendCur: { total: number; count: number; top: { vendor: string; amount: number }[] };
  spendPrev: { total: number };
  reviews: { appSlug: string; rating: number; title: string | null }[];
};

function composeWeekly(w: WeeklyData, statuses: SourceStatusRow[]): string {
  const out: string[] = [`<b>Solis · semaine du ${dayLabel(w.weekStart)} au ${dayLabel(w.weekEnd)}</b>`, ""];
  out.push(`<b>Net Apple</b> : ${eur(w.cur.total)} (${pctChange(w.cur.total, w.prev.total)} vs semaine d'avant)`);
  for (const app of APPS) {
    const c = w.cur.net[app.slug] ?? 0;
    const p = w.prev.net[app.slug] ?? 0;
    if (c === 0 && p === 0) continue;
    out.push(`  ${app.name} ${eur(c)} (${pctChange(c, p)})`);
  }
  if (w.salesDaysCovered < 7) out.push(`  ${7 - w.salesDaysCovered} jour(s) pas encore publiés par Apple`);
  out.push(`Essais ${w.events.trials} (${pctChange(w.events.trials, w.eventsPrev.trials)}) · conversions ${w.events.conversions} · nouveaux payants ${w.events.newPaid}`);
  if (w.eventDaysCovered < 7) out.push(`  événements d'abonnement : ${w.eventDaysCovered}/7 jours publiés`);
  out.push("");
  out.push(`<b>Dépenses</b> : ${eur(w.spendCur.total)} (${pctChange(w.spendCur.total, w.spendPrev.total)})${w.spendCur.top.length ? ` · ${w.spendCur.top.map((t) => `${esc(t.vendor)} ${eur(t.amount)}`).join(", ")}` : ""}`);
  out.push(`<b>Marge</b> : ${eur(w.cur.total - w.spendCur.total)}`);
  out.push("");
  out.push(...reviewsBlock(w.reviews, "de la semaine"));
  out.push(...syncBlock(statuses));
  return out.join("\n");
}

/* ---------- Delivery ---------- */

export const alreadySent = internalQuery({
  args: { date: v.string(), kind: v.union(v.literal("daily"), v.literal("weekly")) },
  handler: async (ctx, { date, kind }) => {
    const rows = await ctx.db.query("briefs").withIndex("by_date", (q) => q.eq("date", date)).collect();
    return rows.some((r) => r.kind === kind && r.sentAt);
  },
});

export const store = internalMutation({
  args: { date: v.string(), kind: v.union(v.literal("daily"), v.literal("weekly")), text: v.string(), sentAt: v.optional(v.number()), error: v.optional(v.string()) },
  handler: (ctx, args) => ctx.db.insert("briefs", args),
});

async function deliver(ctx: ActionCtx, kind: Kind, force: boolean, dryRun: boolean): Promise<{ status: string; text: string }> {
  const now = Date.now();
  const date = parisDay(now);
  if (!force && !dryRun && (await ctx.runQuery(internal.brief.alreadySent, { date, kind }))) return { status: "already sent", text: "" };
  const statuses: SourceStatusRow[] = await ctx.runQuery(internal.sources.statusesInternal, {});
  const text =
    kind === "daily"
      ? composeDaily((await ctx.runQuery(internal.brief.dailyData, { now })) as DailyData, statuses)
      : composeWeekly((await ctx.runQuery(internal.brief.weeklyData, { now })) as WeeklyData, statuses);
  if (dryRun) return { status: "dry run", text };

  const runId = await ctx.runMutation(internal.syncRuns.start, { source: "telegram_brief" });
  if (!telegramConfigured()) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant sur Convex" });
    await ctx.runMutation(internal.brief.store, { date, kind, text, error: "Telegram non configuré" });
    return { status: "skipped", text };
  }
  const res = await sendTelegram(text);
  const label = kind === "daily" ? "brief du jour" : "récap de la semaine";
  if (res.ok) {
    await ctx.runMutation(internal.brief.store, { date, kind, text, sentAt: Date.now() });
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: 1, message: `${label} envoyé` });
    return { status: "sent", text };
  }
  await ctx.runMutation(internal.brief.store, { date, kind, text, error: res.error });
  await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: `${label} : ${res.error}` });
  return { status: `error: ${res.error}`, text };
}

/** Cron 06:30 UTC. Sends at most one daily brief per Paris day. */
export const sendDaily = internalAction({
  args: {},
  handler: (ctx): Promise<{ status: string; text: string }> => deliver(ctx, "daily", false, false),
});

/** Cron Monday. At most one weekly recap per day. */
export const sendWeekly = internalAction({
  args: {},
  handler: (ctx): Promise<{ status: string; text: string }> => deliver(ctx, "weekly", false, false),
});

/** Manual send (Sources page button, CLI test). */
export const sendDailyNow = internalAction({
  args: {},
  handler: (ctx): Promise<{ status: string; text: string }> => deliver(ctx, "daily", true, false),
});

/** Builds the message without sending: `npx convex run brief:preview '{"kind":"weekly"}'`. */
export const preview = internalAction({
  args: { kind: v.optional(v.union(v.literal("daily"), v.literal("weekly"))) },
  handler: (ctx, { kind }): Promise<{ status: string; text: string }> => deliver(ctx, kind ?? "daily", true, true),
});

/** Last briefs, for the Réglages page. */
export const recent = authQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("briefs").order("desc").take(5);
    return rows.map((r) => ({ id: r._id, date: r.date, kind: r.kind, text: r.text, sentAt: r.sentAt ?? null, error: r.error ?? null, createdAt: r._creationTime }));
  },
});
