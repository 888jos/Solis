import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery, carouselSyncMutation, carouselSyncQuery } from "./lib/auth";

// Carousel Factory mirror (see convex/schema/content.ts).
// - authQuery / authMutation: the Carrousels page (src/features/carousels).
// - carouselSync*: `cf sync` on the Mac, with CAROUSEL_SYNC_TOKEN.

const SOURCE = "carousel_factory";
const TO_REVIEW = ["rendered", "in_review"] as const;
const DECISIONS = { ok: "approved", redo: "redo", no: "rejected" } as const;
const LIST_LIMIT = 200;

type Ctx = QueryCtx | MutationCtx;

async function byCid(ctx: Ctx, cid: string) {
  return ctx.db.query("carousels").withIndex("by_cid", (q) => q.eq("cid", cid)).unique();
}

async function cover(ctx: QueryCtx, c: Doc<"carousels"> | null) {
  return c && c.slides.length ? await ctx.storage.getUrl(c.slides[0]) : null;
}

async function reviewQueue(ctx: QueryCtx) {
  const lists = await Promise.all(
    TO_REVIEW.map((status) => ctx.db.query("carousels").withIndex("by_status_created", (q) => q.eq("status", status)).collect()),
  );
  return lists.flat().sort((a, b) => a.createdAt - b.createdAt);
}

async function lastSync(ctx: QueryCtx) {
  const runs = await ctx.db
    .query("syncRuns")
    .withIndex("by_source_started", (q) => q.eq("source", SOURCE))
    .order("desc")
    .take(20);
  const ok = runs.find((r) => r.status === "ok");
  return { at: ok ? (ok.finishedAt ?? ok.startedAt) : null, error: runs[0]?.status === "error" ? (runs[0].message ?? "erreur") : null };
}

/* ---------------------------------------------------------------- page */

/** One posting day: every account, its plan items and the carousels made from them. */
export const day = authQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const accounts = (await ctx.db.query("carouselAccounts").collect()).sort((a, b) => a.position - b.position);
    const plan = await ctx.db.query("carouselPlan").withIndex("by_date", (q) => q.eq("date", date)).collect();
    const items = await Promise.all(
      plan
        .sort((a, b) => a.itemId.localeCompare(b.itemId))
        .map(async (p) => {
          const c = p.carouselId ? await byCid(ctx, p.carouselId) : null;
          return {
            itemId: p.itemId,
            account: p.account,
            slot: p.slot,
            hookId: p.hookId,
            hook: p.hook,
            family: p.family,
            familyName: p.familyName,
            templateName: p.templateName,
            mentionApp: p.mentionApp,
            integrationName: p.integrationName,
            series: p.series ?? null,
            status: c?.status ?? p.status,
            error: p.error ?? null,
            carouselId: c ? c.cid : null,
            cover: await cover(ctx, c),
          };
        }),
    );
    const queue = await reviewQueue(ctx);
    return {
      accounts: accounts.map(({ name, persona, series, startDate, slots, perDay, warmupDays }) => ({
        name, persona, series, startDate, slots, perDay, warmupDays,
      })),
      items,
      toReview: queue.length,
      sync: await lastSync(ctx),
    };
  },
});

/** Gallery: newest first, filtered by status group and account. Counts are per status, before filtering. */
export const list = authQuery({
  args: { status: v.optional(v.string()), account: v.optional(v.string()) },
  handler: async (ctx, { status, account }) => {
    const all = await ctx.db.query("carousels").withIndex("by_created").order("desc").take(2000);
    const pool = account ? all.filter((c) => c.account === account) : all;
    const counts: Record<string, number> = {};
    for (const c of pool) counts[c.status] = (counts[c.status] ?? 0) + 1;
    const wanted: readonly string[] | null = status === "review" ? TO_REVIEW : status ? [status] : null;
    const shown = pool.filter((c) => !wanted || wanted.includes(c.status));
    const rows = await Promise.all(
      shown.slice(0, LIST_LIMIT).map(async (c) => ({
        cid: c.cid,
        account: c.account,
        templateName: c.templateName,
        topic: c.topic,
        status: c.status,
        slideCount: c.slideCount,
        qaStatus: c.qaStatus,
        createdAt: c.createdAt,
        cover: await cover(ctx, c),
      })),
    );
    return {
      rows,
      total: pool.length,
      shown: shown.length,
      counts,
      accounts: [...new Set(all.map((c) => c.account))].sort(),
      sync: await lastSync(ctx),
    };
  },
});

/** One carousel with its slides, QA, Claude's scores, plan item and the next one to review. */
export const detail = authQuery({
  args: { cid: v.string() },
  handler: async (ctx, { cid }) => {
    const c = await byCid(ctx, cid);
    if (!c) return null;
    const slides = (await Promise.all(c.slides.map((id) => ctx.storage.getUrl(id)))).filter((u): u is string => !!u);
    const p = c.planItemId
      ? await ctx.db.query("carouselPlan").withIndex("by_item", (q) => q.eq("itemId", c.planItemId!)).unique()
      : null;
    const queue = (await reviewQueue(ctx)).filter((x) => x.cid !== cid);
    return {
      cid: c.cid,
      account: c.account,
      templateName: c.templateName,
      topic: c.topic,
      status: c.status,
      slideCount: c.slideCount,
      caption: c.caption,
      qaStatus: c.qaStatus,
      qaIssues: c.qaIssues,
      hookOptions: c.hookOptions,
      scores: c.scores ?? null,
      createdAt: c.createdAt,
      decisionPending: c.decisionPending,
      slides,
      plan: p
        ? { date: p.date, slot: p.slot, hookId: p.hookId, hook: p.hook, family: p.family, familyName: p.familyName,
            mentionApp: p.mentionApp, integrationName: p.integrationName, series: p.series ?? null }
        : null,
      nextToReview: queue[0]?.cid ?? null,
      toReview: queue.length,
    };
  },
});

/** Valider / Refaire / Rejeter. Applied on the Mac at the next `cf sync`, like a Telegram button. */
export const decide = authMutation({
  args: { cid: v.string(), action: v.union(v.literal("ok"), v.literal("redo"), v.literal("no")) },
  handler: async (ctx, { cid, action }) => {
    const c = await byCid(ctx, cid);
    if (!c) throw new Error("Carrousel inconnu");
    const status = DECISIONS[action];
    const now = Date.now();
    await ctx.db.patch(c._id, { status, decisionPending: true, decision: { status, at: now }, updatedAt: now });
    if (c.planItemId) {
      const p = await ctx.db.query("carouselPlan").withIndex("by_item", (q) => q.eq("itemId", c.planItemId!)).unique();
      if (p) await ctx.db.patch(p._id, { status });
    }
    return { status };
  },
});

/* ---------------------------------------------------------------- sync from the Mac */

const accountV = v.object({
  name: v.string(),
  persona: v.string(),
  series: v.string(),
  startDate: v.string(),
  slots: v.array(v.string()),
  perDay: v.number(),
  warmupDays: v.number(),
});

export const syncAccounts = carouselSyncMutation({
  args: { accounts: v.array(accountV) },
  handler: async (ctx, { accounts }) => {
    const existing = new Map((await ctx.db.query("carouselAccounts").collect()).map((a) => [a.name, a]));
    const now = Date.now();
    for (const [position, a] of accounts.entries()) {
      const row = { ...a, position, syncedAt: now };
      const e = existing.get(a.name);
      if (e) await ctx.db.patch(e._id, row);
      else await ctx.db.insert("carouselAccounts", row);
      existing.delete(a.name);
    }
    for (const stale of existing.values()) await ctx.db.delete(stale._id);
    return accounts.length;
  },
});

const planItemV = v.object({
  itemId: v.string(),
  date: v.string(),
  account: v.string(),
  slot: v.string(),
  hookId: v.string(),
  hook: v.string(),
  family: v.string(),
  familyName: v.string(),
  template: v.string(),
  templateName: v.string(),
  mentionApp: v.boolean(),
  integration: v.string(),
  integrationName: v.string(),
  series: v.optional(v.string()),
  status: v.string(),
  carouselId: v.optional(v.string()),
  error: v.optional(v.string()),
});

/** Replaces the plan of each date in `dates` with `items` (items dropped on the Mac disappear here too). */
export const syncPlan = carouselSyncMutation({
  args: { dates: v.array(v.string()), items: v.array(planItemV) },
  handler: async (ctx, { dates, items }) => {
    const now = Date.now();
    const incoming = new Set(items.map((i) => i.itemId));
    for (const date of dates) {
      for (const row of await ctx.db.query("carouselPlan").withIndex("by_date", (q) => q.eq("date", date)).collect()) {
        if (!incoming.has(row.itemId)) await ctx.db.delete(row._id);
      }
    }
    for (const item of items) {
      let status = item.status;
      if (item.carouselId) {
        const c = await byCid(ctx, item.carouselId);
        if (c?.decisionPending) status = c.status; // a decision taken here wins until the Mac applies it
      }
      const row = { ...item, status, syncedAt: now };
      const e = await ctx.db.query("carouselPlan").withIndex("by_item", (q) => q.eq("itemId", item.itemId)).unique();
      if (e) await ctx.db.patch(e._id, row);
      else await ctx.db.insert("carouselPlan", row);
    }
    return items.length;
  },
});

/** Which carousels need their slides uploaded (new, or rendered again since the last upload). */
export const needSlides = carouselSyncQuery({
  args: { items: v.array(v.object({ cid: v.string(), hash: v.string() })) },
  handler: async (ctx, { items }) => {
    const out: string[] = [];
    for (const it of items) {
      const c = await byCid(ctx, it.cid);
      if (!c || c.slidesHash !== it.hash || c.slides.length === 0) out.push(it.cid);
    }
    return out;
  },
});

export const generateUploadUrl = carouselSyncMutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

const carouselV = v.object({
  cid: v.string(),
  account: v.string(),
  template: v.string(),
  templateName: v.string(),
  topic: v.string(),
  status: v.string(),
  slideCount: v.number(),
  caption: v.string(),
  qaStatus: v.string(),
  qaIssues: v.array(v.object({ level: v.string(), msg: v.string(), slide: v.optional(v.number()) })),
  hookOptions: v.array(v.string()),
  scores: v.optional(v.record(v.string(), v.number())),
  planItemId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  slidesHash: v.string(),
  slides: v.optional(v.array(v.id("_storage"))), // only when new slides were uploaded
});

export const syncCarousels = carouselSyncMutation({
  args: { carousels: v.array(carouselV) },
  handler: async (ctx, { carousels }) => {
    for (const { slides, slidesHash, ...meta } of carousels) {
      const e = await byCid(ctx, meta.cid);
      if (e) {
        const status = e.decisionPending ? e.status : meta.status;
        if (slides) {
          for (const old of e.slides) if (!slides.includes(old)) await ctx.storage.delete(old);
          await ctx.db.patch(e._id, { ...meta, status, slides, slidesHash });
        } else {
          await ctx.db.patch(e._id, { ...meta, status });
        }
      } else {
        await ctx.db.insert("carousels", { ...meta, slides: slides ?? [], slidesHash: slides ? slidesHash : "", decisionPending: false });
      }
    }
    return carousels.length;
  },
});

export const pendingDecisions = carouselSyncQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("carousels").withIndex("by_decision_pending", (q) => q.eq("decisionPending", true)).collect();
    return rows.map((c) => ({ cid: c.cid, status: c.decision?.status ?? c.status, at: c.decision?.at ?? c.updatedAt }));
  },
});

/** The Mac applied these decisions: they stop overriding what it pushes. */
export const ackDecisions = carouselSyncMutation({
  args: { decisions: v.array(v.object({ cid: v.string(), at: v.number() })) },
  handler: async (ctx, { decisions }) => {
    for (const d of decisions) {
      const c = await byCid(ctx, d.cid);
      // A newer decision taken while the Mac was syncing stays pending.
      if (c && c.decisionPending && (c.decision?.at ?? 0) <= d.at) await ctx.db.patch(c._id, { decisionPending: false });
    }
    return decisions.length;
  },
});

export const recordSync = carouselSyncMutation({
  args: {
    status: v.union(v.literal("ok"), v.literal("error")),
    startedAt: v.number(),
    rows: v.number(),
    message: v.optional(v.string()),
  },
  handler: (ctx, { status, startedAt, rows, message }) =>
    ctx.db.insert("syncRuns", { source: SOURCE, status, startedAt, finishedAt: Date.now(), rows, message }),
});
