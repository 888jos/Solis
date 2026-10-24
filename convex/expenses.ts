import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { CATEGORY_KEYS, classify, EXCLUDED, eurRates, loadRules, seedMissingRules, toEur } from "./expensesData";
import { APP_SLUGS } from "./lib/apps";
import { authAction, authMutation, authQuery } from "./lib/auth";
import { addDays, isoDay } from "./lib/dates";
import { assertAmount, assertCurrency, assertDay, assertMaxItems, assertMaxLength } from "./lib/validate";

// Model of the Dépenses page. Everything is aggregated here; the client only gets compact results.
// UGC payouts (ugcPayouts, filled by the UGC feature) are included in every total as category "ugc"
// without being copied into the expenses table. Bank lines of a vendor that has an admin cost API
// connected ("OpenAI API", "Anthropic API") are superseded by the API rows from the first API day on,
// so the same spend is never counted twice.

/** Import/preview rows per call: keeps each call far below Convex read/write and argument limits. */
const MAX_IMPORT_ROWS = 500;
const MAX_PREVIEW_ROWS = 2000;

function assertCategory(category: string, allowExcluded = false) {
  if (!(CATEGORY_KEYS as readonly string[]).includes(category) && !(allowExcluded && category === EXCLUDED)) throw new Error(`Catégorie inconnue : ${category.slice(0, 30)}`);
}

function assertAppSlug(appSlug: string | undefined) {
  if (appSlug && !(APP_SLUGS as readonly string[]).includes(appSlug)) throw new Error(`App inconnue : ${appSlug.slice(0, 30)}`);
}

const API_VENDORS: Record<string, string> = { openai_api: "OpenAI API", anthropic_api: "Anthropic API" };
const CHART_GROUPS = ["ugc", "ai", "infra", "tools", "ads", "rest"] as const;
const groupOf = (category: string) => ((CHART_GROUPS as readonly string[]).includes(category) && category !== "rest" ? category : "rest");

export type SpendItem = {
  id: string;
  date: string;
  vendor: string;
  label: string;
  category: string;
  amountEur: number;
  amountOriginal: number;
  currency: string;
  source: string;
  appSlug: string | null;
  recurring: boolean;
  recurringFromId: string | null;
  note: string | null;
  superseded: boolean;
  readOnly: boolean;
};

/**
 * Every real expense between two days (inclusive), UGC payouts included. Superseded rows are
 * returned flagged (callers skip them in totals). Reusable by other features' queries.
 */
export async function loadSpend(ctx: QueryCtx, from: string, to: string, app?: string | null): Promise<SpendItem[]> {
  const rows = await ctx.db.query("expenses").withIndex("by_date", (q) => q.gte("date", from).lte("date", to)).collect();
  const apiStart = new Map<string, string>();
  for (const [source, vendor] of Object.entries(API_VENDORS)) {
    const first = await ctx.db.query("expenses").withIndex("by_source_date", (q) => q.eq("source", source)).first();
    if (first) apiStart.set(vendor, first.date);
  }
  const out: SpendItem[] = [];
  for (const r of rows) {
    if (app && r.appSlug !== app) continue;
    const start = apiStart.get(r.vendor);
    const superseded = !!start && !(r.source in API_VENDORS) && r.date >= start;
    out.push({
      id: r._id,
      date: r.date,
      vendor: r.vendor,
      label: r.label,
      category: r.category,
      amountEur: r.amountEur,
      amountOriginal: r.amountOriginal,
      currency: r.currency,
      source: r.source,
      appSlug: r.appSlug ?? null,
      recurring: r.recurring === "monthly",
      recurringFromId: r.recurringFromId ?? null,
      note: r.note ?? null,
      superseded,
      readOnly: false,
    });
  }
  if (!app) {
    const payouts = await ctx.db.query("ugcPayouts").withIndex("by_month", (q) => q.gte("month", from.slice(0, 7)).lte("month", to.slice(0, 7))).collect();
    const names = new Map<string, string>();
    for (const p of payouts) {
      if (p.status === "estimated") continue;
      const date = `${p.month}-01`;
      if (date < from || date > to) continue;
      let name = "Créateur";
      if (p.creatorAirtableId) {
        if (!names.has(p.creatorAirtableId)) {
          const c = await ctx.db.query("ugcCreators").withIndex("by_airtable", (q) => q.eq("airtableId", p.creatorAirtableId as string)).first();
          names.set(p.creatorAirtableId, c?.name ?? "Créateur");
        }
        name = names.get(p.creatorAirtableId) as string;
      }
      out.push({
        id: `ugc:${p._id}`,
        date,
        vendor: "Créateurs UGC",
        label: `${name} · ${p.kind}${p.status === "due" ? " (à payer)" : ""}`,
        category: "ugc",
        amountEur: p.amountEur,
        amountOriginal: p.amountUsd,
        currency: "USD",
        source: "ugc_airtable",
        appSlug: null,
        recurring: false,
        recurringFromId: null,
        note: null,
        superseded: false,
        readOnly: true,
      });
    }
  }
  return out;
}

function weekStart(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

function bucketKey(day: string, bucket: "day" | "week" | "month") {
  return bucket === "day" ? day : bucket === "week" ? weekStart(day) : day.slice(0, 7);
}

function bucketsBetween(from: string, to: string, bucket: "day" | "week" | "month") {
  const keys: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = bucketKey(d, bucket);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

function monthAdd(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const periodArgs = {
  from: v.string(),
  to: v.string(),
  prevFrom: v.string(),
  prevTo: v.string(),
  bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
  app: v.optional(v.string()),
};

export const summary = authQuery({
  args: periodArgs,
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket, app }) => {
    const thisMonth = isoDay(new Date()).slice(0, 7);
    const firstExpense = await ctx.db.query("expenses").withIndex("by_date").first();
    const firstPayout = app ? null : await ctx.db.query("ugcPayouts").withIndex("by_month").first();
    const firstDay = [firstExpense?.date, firstPayout ? `${firstPayout.month}-01` : undefined].filter(Boolean).sort()[0] ?? null;

    // Burn: last 3 complete months, only months covered by data.
    const burnMonths = [3, 2, 1].map((n) => monthAdd(thisMonth, -n)).filter((m) => firstDay && m >= firstDay.slice(0, 7));
    const burnFrom = burnMonths.length ? `${burnMonths[0]}-01` : from;
    const burnTo = burnMonths.length ? addDays(`${monthAdd(burnMonths[burnMonths.length - 1], 1)}-01`, -1) : to;

    const loadFrom = [from, prevFrom, burnFrom].sort()[0];
    const loadTo = [to, prevTo, burnTo].sort().reverse()[0];
    const all = await loadSpend(ctx, loadFrom, loadTo, app);
    const items = all.filter((i) => !i.superseded);

    const inPeriod = items.filter((i) => i.date >= from && i.date <= to);
    const total = round2(inPeriod.reduce((s, i) => s + i.amountEur, 0));
    const prevItems = items.filter((i) => i.date >= prevFrom && i.date <= prevTo);
    const prevCovered = !!firstDay && firstDay <= prevTo;
    const prevTotal = prevCovered ? round2(prevItems.reduce((s, i) => s + i.amountEur, 0)) : null;

    const burnByMonth = burnMonths.map((m) => ({ month: m, total: round2(items.filter((i) => i.date.startsWith(m)).reduce((s, i) => s + i.amountEur, 0)) }));
    const burn = burnByMonth.length ? { avg: round2(burnByMonth.reduce((s, m) => s + m.total, 0) / burnByMonth.length), months: burnByMonth } : null;

    const vendorMap = new Map<string, { total: number; count: number; category: string }>();
    const catMap = new Map<string, number>();
    for (const i of inPeriod) {
      const cur = vendorMap.get(i.vendor) ?? { total: 0, count: 0, category: i.category };
      cur.total += i.amountEur;
      cur.count++;
      vendorMap.set(i.vendor, cur);
      catMap.set(i.category, (catMap.get(i.category) ?? 0) + i.amountEur);
    }
    const vendors = [...vendorMap].map(([vendor, s]) => ({ vendor, total: round2(s.total), count: s.count, category: s.category })).sort((a, b) => b.total - a.total);
    const categories = [...catMap].map(([category, t]) => ({ category, total: round2(t) })).sort((a, b) => b.total - a.total);

    const x = bucketsBetween(from, to, bucket);
    const index = new Map(x.map((k, i) => [k, i]));
    const groups = Object.fromEntries(CHART_GROUPS.map((g) => [g, x.map(() => 0)])) as Record<(typeof CHART_GROUPS)[number], number[]>;
    for (const i of inPeriod) {
      const at = index.get(bucketKey(i.date, bucket));
      if (at == null) continue;
      groups[groupOf(i.category) as (typeof CHART_GROUPS)[number]][at] += i.amountEur;
    }
    const series = CHART_GROUPS.map((g) => ({ group: g, values: groups[g].map(round2) })).filter((s) => s.values.some((val) => val > 0));

    return {
      firstDay,
      count: inPeriod.length,
      total,
      prevTotal,
      burn,
      top: vendors[0] ? { ...vendors[0], share: total > 0 ? vendors[0].total / total : 0 } : null,
      x,
      series,
      vendors: vendors.slice(0, 12),
      vendorCount: vendors.length,
      categories,
      ugcTotal: round2(inPeriod.filter((i) => i.source === "ugc_airtable").reduce((s, i) => s + i.amountEur, 0)),
      supersededCount: all.filter((i) => i.superseded && i.date >= from && i.date <= to).length,
    };
  },
});

/** Detail rows for the table (filtered server-side, capped). */
export const list = authQuery({
  args: { from: v.string(), to: v.string(), app: v.optional(v.string()), category: v.optional(v.string()), search: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { from, to, app, category, search, limit }) => {
    let items = await loadSpend(ctx, from, to, app);
    if (category) items = items.filter((i) => i.category === category);
    const q = search?.trim().toLowerCase();
    if (q) items = items.filter((i) => `${i.vendor} ${i.label} ${i.note ?? ""}`.toLowerCase().includes(q));
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amountEur - a.amountEur));
    const counted = items.filter((i) => !i.superseded);
    return {
      matched: items.length,
      totalEur: round2(counted.reduce((s, i) => s + i.amountEur, 0)),
      rows: items.slice(0, Math.min(limit ?? 200, 1000)),
    };
  },
});

/** Totals for other features (profitability, overview): spend per day, UGC included, no double counting. */
export const totals = authQuery({
  args: { from: v.string(), to: v.string(), app: v.optional(v.string()) },
  handler: async (ctx, { from, to, app }) => {
    const items = (await loadSpend(ctx, from, to, app)).filter((i) => !i.superseded);
    const byDay = new Map<string, number>();
    for (const i of items) byDay.set(i.date, (byDay.get(i.date) ?? 0) + i.amountEur);
    return {
      total: round2(items.reduce((s, i) => s + i.amountEur, 0)),
      byDay: [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, amountEur]) => ({ date, amountEur: round2(amountEur) })),
    };
  },
});

/** Rules, import history, coverage and API source status. */
export const meta = authQuery({
  args: {},
  handler: async (ctx) => {
    const rules = (await ctx.db.query("expenseRules").collect())
      .map((r) => ({ id: r._id, pattern: r.pattern, vendor: r.vendor, category: r.category, appSlug: r.appSlug ?? null, builtin: !!r.builtin }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor, "fr") || a.pattern.localeCompare(b.pattern));
    const batches = (await ctx.db.query("importBatches").order("desc").take(10)).map((b) => ({
      id: b._id,
      fileName: b.fileName,
      format: b.format,
      importedAt: b.importedAt,
      rowsTotal: b.rowsTotal,
      rowsImported: b.rowsImported,
      rowsSkipped: b.rowsSkipped,
      rowsCredit: b.rowsCredit ?? 0,
      totalEur: b.totalEur ?? 0,
      dateFrom: b.dateFrom ?? null,
      dateTo: b.dateTo ?? null,
      status: b.status ?? "done",
    }));
    const bankFirst = await ctx.db.query("expenses").withIndex("by_source_date", (q) => q.eq("source", "bank_csv")).first();
    const bankLast = await ctx.db.query("expenses").withIndex("by_source_date", (q) => q.eq("source", "bank_csv")).order("desc").first();
    const anyExpense = await ctx.db.query("expenses").first();
    const anyPayout = await ctx.db.query("ugcPayouts").first();
    const templates = await ctx.db.query("expenses").withIndex("by_recurring", (q) => q.eq("recurring", "monthly")).collect();
    const aiSources = [];
    for (const [source, vendor] of Object.entries(API_VENDORS)) {
      const env = source === "openai_api" ? "OPENAI_ADMIN_KEY" : "ANTHROPIC_ADMIN_KEY";
      const runs = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", source)).order("desc").take(20);
      const last = runs[0] ?? null;
      const lastOk = runs.find((r) => r.status === "ok") ?? null;
      aiSources.push({
        source,
        vendor,
        env,
        configured: !!process.env[env],
        lastRun: last ? { status: last.status, at: last.finishedAt ?? last.startedAt, message: last.message ?? null } : null,
        lastOkAt: lastOk ? lastOk.finishedAt ?? lastOk.startedAt : null,
      });
    }
    return {
      rules,
      batches,
      bank: bankFirst && bankLast ? { from: bankFirst.date, to: bankLast.date } : null,
      hasData: !!anyExpense || !!anyPayout,
      hasUgc: !!anyPayout,
      recurring: templates.map((t) => ({ id: t._id, vendor: t.vendor, amountEur: t.amountEur, day: Number(t.date.slice(8, 10)) })),
      aiSources,
    };
  },
});

/* ---------- Bank CSV import ---------- */

/** Dry run: which rows already exist, and how the rules classify the others. */
export const previewImport = authQuery({
  args: { rows: v.array(v.object({ externalId: v.string(), label: v.string(), vendorHint: v.optional(v.string()) })), dateFrom: v.string(), dateTo: v.string() },
  handler: async (ctx, { rows, dateFrom, dateTo }) => {
    assertMaxItems(rows, MAX_PREVIEW_ROWS, "Aperçu");
    assertDay(dateFrom, "Date de début");
    assertDay(dateTo, "Date de fin");
    const existing = new Set(
      (await ctx.db.query("expenses").withIndex("by_date", (q) => q.gte("date", dateFrom).lte("date", dateTo)).collect()).map((e) => e.externalId),
    );
    for (const t of await ctx.db.query("expenseTombstones").collect()) existing.add(t.externalId);
    const rules = await loadRules(ctx);
    return rows.map((r) => {
      const c = classify(rules, r.label, r.vendorHint);
      return { duplicate: existing.has(r.externalId), vendor: c.vendor, category: c.category, appSlug: c.appSlug ?? null, excluded: c.excluded, matched: !!c.ruleId };
    });
  },
});

export const startImport = authMutation({
  args: { fileName: v.string(), format: v.string(), rowsTotal: v.number(), rowsCredit: v.number(), dateFrom: v.string(), dateTo: v.string() },
  handler: async (ctx, args) => {
    assertMaxLength(args.fileName, 200, "Nom de fichier");
    assertMaxLength(args.format, 50, "Format");
    assertDay(args.dateFrom, "Date de début");
    assertDay(args.dateTo, "Date de fin");
    if (![args.rowsTotal, args.rowsCredit].every((n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000)) throw new Error("Nombre de lignes invalide");
    if (!(await ctx.db.query("expenseRules").first())) await seedMissingRules(ctx);
    return ctx.db.insert("importBatches", { ...args, importedAt: Date.now(), rowsImported: 0, rowsSkipped: 0, totalEur: 0, status: "running" });
  },
});

export const importChunk = authAction({
  args: {
    batchId: v.id("importBatches"),
    rows: v.array(v.object({ date: v.string(), label: v.string(), amount: v.number(), currency: v.string(), externalId: v.string(), vendorHint: v.optional(v.string()) })),
  },
  handler: async (ctx, { batchId, rows }): Promise<{ imported: number; skipped: number; excluded: number }> => {
    assertMaxItems(rows, MAX_IMPORT_ROWS, "Import");
    for (const r of rows) {
      assertDay(r.date);
      assertAmount(r.amount);
      assertCurrency(r.currency);
      assertMaxLength(r.label, 500, "Libellé");
      assertMaxLength(r.externalId, 300, "Identifiant de transaction");
      assertMaxLength(r.vendorHint, 500, "Fournisseur");
    }
    const rates = await eurRates(ctx, rows);
    const prepared = rows.map((r) => ({
      date: r.date,
      label: r.label,
      amountOriginal: r.amount,
      currency: r.currency.toUpperCase(),
      amountEur: toEur(rates, r.date, r.currency, r.amount),
      externalId: r.externalId,
      vendorHint: r.vendorHint,
    }));
    return ctx.runMutation(internal.expensesData.insertChunk, { batchId, rows: prepared });
  },
});

export const finishImport = authMutation({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    await ctx.db.patch(batchId, { status: "done" });
    return ctx.db.get(batchId);
  },
});

/** Undo an import: deletes every expense of the batch (in pages), then the batch. */
export const undoImport = authMutation({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    if (!(await ctx.db.get(batchId))) throw new Error("Import introuvable");
    await ctx.scheduler.runAfter(0, internal.expensesData.deleteBatchPage, { batchId });
    return null;
  },
});

/* ---------- Manual entry / edit / delete ---------- */

export const saveExpense = authAction({
  args: {
    id: v.optional(v.id("expenses")),
    date: v.string(),
    vendor: v.string(),
    label: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    appSlug: v.optional(v.string()),
    recurring: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"expenses">> => {
    assertDay(args.date);
    if (!args.vendor.trim()) throw new Error("Fournisseur manquant");
    assertAmount(args.amount);
    if (!(args.amount > 0)) throw new Error("Le montant doit être positif");
    assertMaxLength(args.vendor, 200, "Fournisseur");
    assertMaxLength(args.label, 500, "Libellé");
    assertMaxLength(args.note, 2000, "Note");
    assertCategory(args.category);
    assertAppSlug(args.appSlug);
    const currency = args.currency.trim().toUpperCase() || "EUR";
    assertCurrency(currency);
    const rates = await eurRates(ctx, [{ date: args.date, currency }]);
    return ctx.runMutation(internal.expensesData.writeManual, {
      id: args.id,
      date: args.date,
      vendor: args.vendor.trim(),
      label: args.label?.trim() || args.vendor.trim(),
      category: args.category,
      amountOriginal: args.amount,
      currency,
      amountEur: toEur(rates, args.date, currency, args.amount),
      appSlug: args.appSlug || undefined,
      recurring: args.recurring,
      note: args.note?.trim() || undefined,
    });
  },
});

/** Imported/API/recurring rows leave a tombstone so a re-import or re-materialization never brings them back. */
export const deleteExpense = authMutation({
  args: { id: v.id("expenses"), withCopies: v.optional(v.boolean()) },
  handler: async (ctx, { id, withCopies }) => {
    const row = await ctx.db.get(id);
    if (!row) return 0;
    let deleted = 0;
    if (row.recurring === "monthly" && withCopies) {
      for (const copy of await ctx.db.query("expenses").withIndex("by_recurring_from", (q) => q.eq("recurringFromId", id)).collect()) {
        await ctx.db.delete(copy._id);
        deleted++;
      }
    }
    if (row.source !== "manual") await ctx.db.insert("expenseTombstones", { externalId: row.externalId, label: row.label, deletedAt: Date.now() });
    await ctx.db.delete(id);
    return deleted + 1;
  },
});

/* ---------- Rules ---------- */

export const saveRule = authMutation({
  args: { id: v.optional(v.id("expenseRules")), pattern: v.string(), vendor: v.string(), category: v.string(), appSlug: v.optional(v.string()) },
  handler: async (ctx, { id, ...rule }) => {
    const clean = { pattern: rule.pattern.trim(), vendor: rule.vendor.trim(), category: rule.category, appSlug: rule.appSlug || undefined };
    if (!clean.pattern) throw new Error("Motif manquant");
    assertMaxLength(clean.pattern, 200, "Motif");
    assertMaxLength(clean.vendor, 200, "Fournisseur");
    assertCategory(clean.category, true);
    assertAppSlug(clean.appSlug);
    if (!clean.vendor && clean.category !== EXCLUDED) throw new Error("Fournisseur manquant");
    if (clean.pattern.startsWith("/") && clean.pattern.endsWith("/") && clean.pattern.length > 2) {
      try {
        new RegExp(clean.pattern.slice(1, -1), "i");
      } catch {
        throw new Error("Expression régulière invalide");
      }
    }
    if (id) {
      await ctx.db.patch(id, clean);
      return id;
    }
    return ctx.db.insert("expenseRules", { ...clean, createdAt: Date.now() });
  },
});

export const deleteRule = authMutation({
  args: { id: v.id("expenseRules") },
  handler: (ctx, { id }) => ctx.db.delete(id),
});

export const restoreDefaultRules = authMutation({
  args: {},
  handler: (ctx) => seedMissingRules(ctx),
});

/** Re-runs the rules on every imported bank line not edited by hand. "excluded" lines are removed (tombstoned). */
export const applyRules = authMutation({
  args: {},
  handler: async (ctx) => {
    const rules = await loadRules(ctx);
    const rows = await ctx.db.query("expenses").withIndex("by_source_date", (q) => q.eq("source", "bank_csv")).collect();
    let changed = 0;
    let excluded = 0;
    for (const r of rows) {
      if (r.manualOverride) continue;
      const c = classify(rules, r.label, r.vendorHint);
      if (c.excluded) {
        await ctx.db.insert("expenseTombstones", { externalId: r.externalId, label: r.label, deletedAt: Date.now() });
        await ctx.db.delete(r._id);
        excluded++;
        continue;
      }
      if (c.vendor !== r.vendor || c.category !== r.category || (c.appSlug ?? undefined) !== (r.appSlug ?? undefined)) {
        await ctx.db.patch(r._id, { vendor: c.vendor, category: c.category, appSlug: c.appSlug, updatedAt: Date.now() });
        changed++;
      }
    }
    return { scanned: rows.length, changed, excluded };
  },
});

/* ---------- AI cost APIs ---------- */

export const syncAiCosts = authAction({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => ctx.runAction(internal.sources.aiCosts.backfill, {}),
});
