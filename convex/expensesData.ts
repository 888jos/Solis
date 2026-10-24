import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isoDay } from "./lib/dates";
import { FX_CURRENCIES, fetchEurRates, ratesForDay } from "./lib/fx";

// Model internals of the Dépenses feature: categorisation rules, FX conversion, import batches,
// recurring costs and API cost upserts. Public functions live in convex/expenses.ts.

export const CATEGORY_KEYS = ["ugc", "ai", "infra", "tools", "apple", "ads", "freelance", "fees", "other"] as const;
/** Pseudo-category for rules: matching bank lines are not expenses (own transfers, refunds...). */
export const EXCLUDED = "excluded";

type RuleSeed = { pattern: string; vendor: string; category: string; appSlug?: string };

// Default rules for Drift Studio's real stack. Longest pattern wins, then insertion order.
export const DEFAULT_RULES: RuleSeed[] = [
  // AI: subscriptions are separate vendors from API usage (API usage may also come from the admin cost APIs).
  { pattern: "chatgpt", vendor: "ChatGPT (abonnement)", category: "ai" },
  { pattern: "claude.ai", vendor: "Claude (abonnement)", category: "ai" },
  { pattern: "claude pro", vendor: "Claude (abonnement)", category: "ai" },
  { pattern: "claude max", vendor: "Claude (abonnement)", category: "ai" },
  { pattern: "openai", vendor: "OpenAI API", category: "ai" },
  { pattern: "anthropic", vendor: "Anthropic API", category: "ai" },
  { pattern: "cursor", vendor: "Cursor", category: "ai" },
  { pattern: "midjourney", vendor: "Midjourney", category: "ai" },
  { pattern: "elevenlabs", vendor: "ElevenLabs", category: "ai" },
  { pattern: "replicate", vendor: "Replicate", category: "ai" },
  // Subscription / analytics tooling
  { pattern: "superwall", vendor: "Superwall", category: "tools" },
  { pattern: "revenuecat", vendor: "RevenueCat", category: "tools" },
  { pattern: "amplitude", vendor: "Amplitude", category: "tools", appSlug: "cortifree" },
  { pattern: "posthog", vendor: "PostHog", category: "tools", appSlug: "questirl" },
  // Infra
  { pattern: "convex", vendor: "Convex", category: "infra" },
  { pattern: "cloudflare", vendor: "Cloudflare", category: "infra" },
  { pattern: "vercel", vendor: "Vercel", category: "infra" },
  { pattern: "firebase", vendor: "Firebase", category: "infra" },
  { pattern: "google cloud", vendor: "Google Cloud", category: "infra" },
  { pattern: "sentry", vendor: "Sentry", category: "infra" },
  { pattern: "resend", vendor: "Resend", category: "infra" },
  // Domains
  { pattern: "ovh", vendor: "OVHcloud", category: "infra" },
  { pattern: "gandi", vendor: "Gandi", category: "infra" },
  { pattern: "namecheap", vendor: "Namecheap", category: "infra" },
  { pattern: "godaddy", vendor: "GoDaddy", category: "infra" },
  { pattern: "porkbun", vendor: "Porkbun", category: "infra" },
  { pattern: "ionos", vendor: "IONOS", category: "infra" },
  { pattern: "hostinger", vendor: "Hostinger", category: "infra" },
  { pattern: "squarespace", vendor: "Squarespace Domains", category: "infra" },
  // Apple
  { pattern: "apple developer", vendor: "Apple Developer", category: "apple" },
  { pattern: "developer.apple", vendor: "Apple Developer", category: "apple" },
  { pattern: "apple search ads", vendor: "Apple Search Ads", category: "ads" },
  { pattern: "searchads", vendor: "Apple Search Ads", category: "ads" },
  { pattern: "apple.com/bill", vendor: "Apple (App Store)", category: "apple" },
  // Workspace and design tools
  { pattern: "google workspace", vendor: "Google Workspace", category: "tools" },
  { pattern: "gsuite", vendor: "Google Workspace", category: "tools" },
  { pattern: "notion", vendor: "Notion", category: "tools" },
  { pattern: "airtable", vendor: "Airtable", category: "tools" },
  { pattern: "canva", vendor: "Canva", category: "tools" },
  { pattern: "capcut", vendor: "CapCut", category: "tools" },
  { pattern: "figma", vendor: "Figma", category: "tools" },
  { pattern: "github", vendor: "GitHub", category: "tools" },
  { pattern: "1password", vendor: "1Password", category: "tools" },
  { pattern: "linear", vendor: "Linear", category: "tools" },
  // UGC and freelances
  { pattern: "sideshift", vendor: "SideShift", category: "ugc", appSlug: "cortifree" },
  { pattern: "upwork", vendor: "Upwork", category: "freelance" },
  { pattern: "fiverr", vendor: "Fiverr", category: "freelance" },
  { pattern: "malt", vendor: "Malt", category: "freelance" },
  // Ads
  { pattern: "facebk", vendor: "Meta Ads", category: "ads" },
  { pattern: "facebook", vendor: "Meta Ads", category: "ads" },
  { pattern: "meta ads", vendor: "Meta Ads", category: "ads" },
  { pattern: "tiktok", vendor: "TikTok Ads", category: "ads" },
  { pattern: "google ads", vendor: "Google Ads", category: "ads" },
  // Bank fees
  { pattern: "frais bancaires", vendor: "Frais bancaires", category: "fees" },
  { pattern: "cotisation", vendor: "Frais bancaires", category: "fees" },
  { pattern: "commission", vendor: "Frais bancaires", category: "fees" },
  { pattern: "abonnement qonto", vendor: "Qonto", category: "fees" },
];

/* ---------- Categorisation ---------- */

export type RuleLike = Pick<Doc<"expenseRules">, "pattern" | "vendor" | "category" | "appSlug"> & { _id?: Id<"expenseRules">; _creationTime?: number };

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Longest pattern first, then oldest first. */
export function sortRules<R extends RuleLike>(rules: R[]): R[] {
  return [...rules].sort((a, b) => b.pattern.length - a.pattern.length || (a._creationTime ?? 0) - (b._creationTime ?? 0));
}

export function ruleMatches(rule: RuleLike, text: string): boolean {
  const p = rule.pattern.trim();
  if (!p) return false;
  if (p.length > 2 && p.startsWith("/") && p.endsWith("/")) {
    try {
      return new RegExp(p.slice(1, -1), "i").test(text);
    } catch {
      return false;
    }
  }
  return normalize(text).includes(normalize(p));
}

const NOISE = /^(prlv|sepa|cb|carte|paiement|achat|facture|vir|virement|prelevement|prélèvement|retrait|dab|inst|instantane|europeen|emis|recu|de|du|par|ref|sct|op|x\d+|\d+)$/i;

/** Best-effort vendor name from a raw bank label when no rule matches. */
export function guessVendor(label: string, hint?: string): string {
  if (hint && hint.trim()) return titleCase(hint.trim().slice(0, 40));
  const words = label
    .replace(/[*_]/g, " ")
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (!kept.length && NOISE.test(w)) continue;
    if (/\d{3,}/.test(w)) break;
    if (NOISE.test(w) && kept.length) break;
    kept.push(w);
    if (kept.length === 3) break;
  }
  const name = kept.join(" ").trim();
  return name ? titleCase(name) : label.slice(0, 40);
}

function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function classify(rules: RuleLike[], label: string, hint?: string) {
  const text = hint ? `${label} ${hint}` : label;
  const rule = rules.find((r) => ruleMatches(r, text));
  if (rule) return { vendor: rule.vendor, category: rule.category, appSlug: rule.appSlug, ruleId: rule._id ?? null, excluded: rule.category === EXCLUDED };
  return { vendor: guessVendor(label, hint), category: "other", appSlug: undefined, ruleId: null, excluded: false };
}

export async function loadRules(ctx: QueryCtx) {
  return sortRules(await ctx.db.query("expenseRules").collect());
}

async function seedMissingRules(ctx: MutationCtx) {
  const existing = await ctx.db.query("expenseRules").collect();
  const have = new Set(existing.map((r) => r.pattern.toLowerCase()));
  let added = 0;
  for (const rule of DEFAULT_RULES) {
    if (have.has(rule.pattern.toLowerCase())) continue;
    await ctx.db.insert("expenseRules", { ...rule, builtin: true, createdAt: Date.now() });
    added++;
  }
  return added;
}

export const seedDefaultRules = internalMutation({ args: {}, handler: (ctx) => seedMissingRules(ctx) });
export { seedMissingRules };

/* ---------- FX (shared fxRates table, see convex/lib/fx.ts) ---------- */

/** Stored rates per requested day; `date` is the day they come from (nearest earlier stored day). */
export const fxLookup = internalQuery({
  args: { days: v.array(v.string()) },
  handler: async (ctx, { days }) => {
    const out: Record<string, { date: string | null; rates: Record<string, number> }> = {};
    for (const day of days) out[day] = await ratesForDay(ctx.db, day);
    return out;
  },
});

/** 1 EUR = perEur units, per "date|CUR". Fetches and stores missing days through internal.fx.upsertDay. */
export async function eurRates(ctx: ActionCtx, items: { date: string; currency: string }[]): Promise<Map<string, number>> {
  const need = new Map<string, Set<string>>();
  for (const it of items) {
    const cur = it.currency.toUpperCase();
    if (cur === "EUR") continue;
    need.set(it.date, (need.get(it.date) ?? new Set()).add(cur));
  }
  const result = new Map<string, number>();
  if (!need.size) return result;
  const stored: Record<string, { date: string | null; rates: Record<string, number> }> = await ctx.runQuery(internal.expensesData.fxLookup, { days: [...need.keys()] });
  for (const [day, currencies] of need) {
    let rates = stored[day]?.date === day ? stored[day].rates : null;
    if (!rates || [...currencies].some((c) => !rates![c])) {
      const fetched = await fetchEurRates(day, [...FX_CURRENCIES, ...currencies]);
      if (fetched) {
        await ctx.runMutation(internal.fx.upsertDay, { date: day, rates: fetched });
        rates = fetched;
      } else {
        // Day not published yet (today / weekend lag): nearest earlier stored day.
        rates = stored[day]?.rates ?? {};
      }
    }
    for (const cur of currencies) {
      if (!rates[cur]) throw new Error(`Pas de taux de change ${cur} pour le ${day}`);
      result.set(`${day}|${cur}`, rates[cur]);
    }
  }
  return result;
}

export function toEur(rates: Map<string, number>, date: string, currency: string, amount: number) {
  const cur = currency.toUpperCase();
  if (cur === "EUR") return amount;
  const perEur = rates.get(`${date}|${cur}`);
  if (!perEur) throw new Error(`Pas de taux ${cur} pour le ${date}`);
  return Math.round((amount / perEur) * 100) / 100;
}

/* ---------- Bank import ---------- */

export const importRow = v.object({
  date: v.string(),
  label: v.string(),
  amountOriginal: v.number(), // positive debit in original currency
  currency: v.string(),
  amountEur: v.number(),
  externalId: v.string(),
  vendorHint: v.optional(v.string()),
});

export const insertChunk = internalMutation({
  args: { batchId: v.id("importBatches"), rows: v.array(importRow) },
  handler: async (ctx, { batchId, rows }) => {
    const batch = await ctx.db.get(batchId);
    if (!batch) throw new Error("Import introuvable");
    const rules = await loadRules(ctx);
    let imported = 0;
    let skipped = 0;
    let excluded = 0;
    let total = 0;
    for (const row of rows) {
      const dup = await ctx.db.query("expenses").withIndex("by_external", (q) => q.eq("externalId", row.externalId)).first();
      const tomb = dup ? null : await ctx.db.query("expenseTombstones").withIndex("by_external", (q) => q.eq("externalId", row.externalId)).first();
      if (dup || tomb) {
        skipped++;
        continue;
      }
      const c = classify(rules, row.label, row.vendorHint);
      if (c.excluded) {
        excluded++;
        continue;
      }
      await ctx.db.insert("expenses", {
        date: row.date,
        vendor: c.vendor,
        label: row.label,
        category: c.category,
        amountEur: row.amountEur,
        amountOriginal: row.amountOriginal,
        currency: row.currency.toUpperCase(),
        source: "bank_csv",
        appSlug: c.appSlug,
        externalId: row.externalId,
        importBatchId: batchId,
        vendorHint: row.vendorHint,
        updatedAt: Date.now(),
      });
      imported++;
      total += row.amountEur;
    }
    await ctx.db.patch(batchId, {
      rowsImported: batch.rowsImported + imported,
      rowsSkipped: batch.rowsSkipped + skipped + excluded,
      totalEur: Math.round(((batch.totalEur ?? 0) + total) * 100) / 100,
    });
    return { imported, skipped, excluded };
  },
});

/** Deletes a batch's expenses in pages (self-scheduling), then the batch itself. */
export const deleteBatchPage = internalMutation({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, { batchId }) => {
    const page = await ctx.db.query("expenses").withIndex("by_batch", (q) => q.eq("importBatchId", batchId)).take(1000);
    for (const row of page) await ctx.db.delete(row._id);
    if (page.length === 1000) {
      await ctx.scheduler.runAfter(0, internal.expensesData.deleteBatchPage, { batchId });
      return { deleted: page.length, done: false };
    }
    if (await ctx.db.get(batchId)) await ctx.db.delete(batchId);
    return { deleted: page.length, done: true };
  },
});

/* ---------- Manual expenses + recurring ---------- */

export const writeManual = internalMutation({
  args: {
    id: v.optional(v.id("expenses")),
    date: v.string(),
    vendor: v.string(),
    label: v.string(),
    category: v.string(),
    amountOriginal: v.number(),
    currency: v.string(),
    amountEur: v.number(),
    appSlug: v.optional(v.string()),
    recurring: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, recurring, ...fields }) => {
    const base = { ...fields, currency: fields.currency.toUpperCase(), recurring: recurring ? ("monthly" as const) : undefined, updatedAt: Date.now() };
    let expenseId: Id<"expenses">;
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing) throw new Error("Dépense introuvable");
      if (existing.source === "manual") {
        await ctx.db.patch(id, base);
      } else {
        // Imported / API / recurring copies: only the classification is editable.
        await ctx.db.patch(id, { vendor: fields.vendor, category: fields.category, appSlug: fields.appSlug, note: fields.note, manualOverride: true, updatedAt: Date.now() });
      }
      expenseId = id;
    } else {
      expenseId = await ctx.db.insert("expenses", { ...base, source: "manual", externalId: `manual:${crypto.randomUUID()}` });
    }
    const doc = await ctx.db.get(expenseId);
    if (doc?.recurring === "monthly") await materializeTemplate(ctx, doc);
    return expenseId;
  },
});

function monthAdd(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function dayInMonth(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

async function materializeTemplate(ctx: MutationCtx, t: Doc<"expenses">) {
  const today = isoDay(new Date());
  const day = Number(t.date.slice(8, 10));
  let created = 0;
  for (let month = monthAdd(t.date.slice(0, 7), 1); month <= today.slice(0, 7); month = monthAdd(month, 1)) {
    const date = dayInMonth(month, day);
    if (date > today) break;
    const externalId = `rec:${t._id}:${month}`;
    const exists = await ctx.db.query("expenses").withIndex("by_external", (q) => q.eq("externalId", externalId)).first();
    if (exists) continue;
    const tomb = await ctx.db.query("expenseTombstones").withIndex("by_external", (q) => q.eq("externalId", externalId)).first();
    if (tomb) continue;
    await ctx.db.insert("expenses", {
      date,
      vendor: t.vendor,
      label: t.label,
      category: t.category,
      amountEur: t.amountEur,
      amountOriginal: t.amountOriginal,
      currency: t.currency,
      source: "recurring",
      appSlug: t.appSlug,
      externalId,
      recurringFromId: t._id,
      updatedAt: Date.now(),
    });
    created++;
  }
  return created;
}

/** Cron target (daily is enough): creates this month's occurrence of every monthly expense. */
export const materializeRecurring = internalMutation({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("expenses").withIndex("by_recurring", (q) => q.eq("recurring", "monthly")).collect();
    let created = 0;
    for (const t of templates) created += await materializeTemplate(ctx, t);
    return { templates: templates.length, created };
  },
});

/* ---------- API cost sources (OpenAI / Anthropic admin APIs) ---------- */

export const upsertApiCosts = internalMutation({
  args: {
    source: v.string(), // "openai_api" | "anthropic_api"
    vendor: v.string(),
    days: v.array(v.object({ date: v.string(), amountUsd: v.number(), amountEur: v.number(), label: v.string() })),
  },
  handler: async (ctx, { source, vendor, days }) => {
    let written = 0;
    for (const d of days) {
      const externalId = `${source}:${d.date}`;
      const existing = await ctx.db.query("expenses").withIndex("by_external", (q) => q.eq("externalId", externalId)).first();
      if (d.amountUsd <= 0) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      const fields = { date: d.date, vendor, label: d.label, category: "ai", amountEur: d.amountEur, amountOriginal: d.amountUsd, currency: "USD", source, externalId, updatedAt: Date.now() };
      if (existing) {
        if (existing.amountOriginal !== d.amountUsd || existing.amountEur !== d.amountEur) {
          await ctx.db.patch(existing._id, existing.manualOverride ? { amountEur: d.amountEur, amountOriginal: d.amountUsd, label: d.label } : fields);
          written++;
        }
      } else {
        await ctx.db.insert("expenses", fields);
        written++;
      }
    }
    return written;
  },
});

/** Maintenance: forget tombstones (e.g. after test imports) so those lines can be imported again. */
export const removeTombstones = internalMutation({
  args: { externalIds: v.optional(v.array(v.string())) },
  handler: async (ctx, { externalIds }) => {
    const rows = await ctx.db.query("expenseTombstones").collect();
    let removed = 0;
    for (const t of rows) {
      if (externalIds && !externalIds.includes(t.externalId)) continue;
      await ctx.db.delete(t._id);
      removed++;
    }
    return removed;
  },
});
