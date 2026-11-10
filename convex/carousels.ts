import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authMutation, authQuery, carouselSyncMutation, carouselSyncQuery } from "./lib/auth";
import { carouselEditsV } from "./schema/content";

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

/** App of each account (factory brand id). Accounts synced before the field existed count as CortiFree. */
export const APPS = [
  { id: "cortifree", label: "CortiFree" },
  { id: "questirl", label: "Quest IRL" },
] as const;
const DEFAULT_APP = "cortifree";

async function appOfAccounts(ctx: QueryCtx) {
  const rows = await ctx.db.query("carouselAccounts").collect();
  return new Map(rows.map((a) => [a.name, a.app || DEFAULT_APP]));
}

function appOf(map: Map<string, string>, account: string) {
  return map.get(account) ?? DEFAULT_APP;
}

async function reviewQueue(ctx: QueryCtx, app?: string) {
  const apps = app ? await appOfAccounts(ctx) : null;
  const lists = await Promise.all(
    TO_REVIEW.map((status) => ctx.db.query("carousels").withIndex("by_status_created", (q) => q.eq("status", status)).collect()),
  );
  return lists
    .flat()
    .filter((c) => !apps || appOf(apps, c.account) === app)
    .sort((a, b) => a.createdAt - b.createdAt);
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

function appCounts(accounts: { app?: string }[]) {
  return APPS.map((a) => ({ ...a, accounts: accounts.filter((x) => (x.app || DEFAULT_APP) === a.id).length }));
}

/** One posting day: every account, its plan items and the carousels made from them. */
export const day = authQuery({
  args: { date: v.string(), app: v.optional(v.string()) },
  handler: async (ctx, { date, app }) => {
    const wanted = app || DEFAULT_APP;
    const allAccounts = (await ctx.db.query("carouselAccounts").collect()).sort((a, b) => a.position - b.position);
    const accounts = allAccounts.filter((a) => (a.app || DEFAULT_APP) === wanted);
    const names = new Set(accounts.map((a) => a.name));
    const plan = (await ctx.db.query("carouselPlan").withIndex("by_date", (q) => q.eq("date", date)).collect()).filter((p) =>
      names.has(p.account),
    );
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
    const queue = await reviewQueue(ctx, wanted);
    return {
      apps: appCounts(allAccounts),
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
  args: { status: v.optional(v.string()), account: v.optional(v.string()), app: v.optional(v.string()) },
  handler: async (ctx, { status, account, app }) => {
    const wantedApp = app || DEFAULT_APP;
    const apps = await appOfAccounts(ctx);
    const all = (await ctx.db.query("carousels").withIndex("by_created").order("desc").take(2000)).filter(
      (c) => appOf(apps, c.account) === wantedApp,
    );
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
      apps: appCounts(await ctx.db.query("carouselAccounts").collect()),
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
    const app = appOf(await appOfAccounts(ctx), c.account);
    const queue = (await reviewQueue(ctx, app)).filter((x) => x.cid !== cid);
    return {
      cid: c.cid,
      account: c.account,
      app,
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
      editor: c.editor ?? null,
      pendingEdit: c.pendingEdit?.edits ?? null,
      editStatus: c.editStatus ?? null,
      photos: await photoUrls(ctx, c),
    };
  },
});

/* ---------------------------------------------------------------- editor */

type Edits = Infer<typeof carouselEditsV>;

/** Thumbnails of the photos the editor shows: the slides' current photos and those of a pending edit. */
async function photoUrls(ctx: QueryCtx, c: Doc<"carousels">) {
  const ids = new Set<string>();
  for (const s of (c.editor?.slides ?? []) as { images?: string[] }[]) for (const id of s.images ?? []) ids.add(id);
  for (const i of c.pendingEdit?.edits.images ?? []) ids.add(i.imageId);
  const out: Record<string, { url: string; name: string; category: string }> = {};
  for (const id of ids) {
    const b = await ctx.db.query("carouselBank").withIndex("by_image", (q) => q.eq("imageId", id)).unique();
    const url = b ? await ctx.storage.getUrl(b.storageId) : null;
    if (b && url) out[id] = { url, name: b.name, category: b.category };
  }
  return out;
}

/** A newer save wins field by field over an edit the Mac has not applied yet. */
function mergeEdits(old: Edits | undefined, next: Edits): Edits {
  if (!old) return next;
  const text = new Map(old.text.map((t) => [t.path, t]));
  for (const t of next.text) text.set(t.path, t);
  const style = new Map(old.style.map((s) => [s.slide, s]));
  for (const s of next.style) style.set(s.slide, s);
  const images = new Map(old.images.map((i) => [`${i.slide}.${i.slot}`, i]));
  for (const i of next.images) images.set(`${i.slide}.${i.slot}`, i);
  return { text: [...text.values()], style: [...style.values()], images: [...images.values()] };
}

/** Enregistrer: stored here until `cf sync --edits` applies it on the Mac (re-render) and acknowledges. */
export const saveEdits = authMutation({
  args: { cid: v.string(), edits: carouselEditsV },
  handler: async (ctx, { cid, edits }) => {
    const c = await byCid(ctx, cid);
    if (!c) throw new Error("Carrousel inconnu");
    if (!c.editor) throw new Error("Ce carrousel n'est pas encore modifiable : attendre la prochaine synchro du Mac");
    if (edits.text.length + edits.style.length + edits.images.length === 0) return { pending: !!c.editPending };
    for (const s of edits.style) {
      if (s.color && !/^#[0-9a-fA-F]{6}$/.test(s.color)) throw new Error(`Couleur invalide : ${s.color}`);
      if (s.scale !== undefined && (s.scale < 0.6 || s.scale > 1.8)) throw new Error("Taille hors limites (60 à 180 %)");
    }
    const now = Date.now();
    await ctx.db.patch(c._id, {
      pendingEdit: { edits: mergeEdits(c.editPending ? c.pendingEdit?.edits : undefined, edits), at: now },
      editPending: true,
      editStatus: { state: "pending", at: now },
    });
    return { pending: true };
  },
});

/** Photo picker: bank categories with their counts, and the thumbnails of one category. */
export const bank = authQuery({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    const all = await ctx.db.query("carouselBank").collect();
    const counts: Record<string, number> = {};
    for (const b of all) counts[b.category] = (counts[b.category] ?? 0) + 1;
    const rows = category ? all.filter((b) => b.category === category).sort((a, b) => a.name.localeCompare(b.name)) : [];
    const images = await Promise.all(
      rows.map(async (b) => ({ imageId: b.imageId, name: b.name, category: b.category, url: await ctx.storage.getUrl(b.storageId) })),
    );
    return { counts, images: images.filter((i): i is typeof i & { url: string } => !!i.url) };
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
  app: v.optional(v.string()),
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
  editor: v.optional(v.any()), // what the editor shows (see convex/schema/content.ts)
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

/** Edits saved in the editor that the Mac has not applied yet. */
export const pendingEdits = carouselSyncQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("carousels").withIndex("by_edit_pending", (q) => q.eq("editPending", true)).collect();
    return rows.filter((c) => c.pendingEdit).map((c) => ({ cid: c.cid, at: c.pendingEdit!.at, edits: c.pendingEdit!.edits }));
  },
});

/** The Mac applied (or refused) these edits. A newer save made meanwhile stays pending. */
export const ackEdits = carouselSyncMutation({
  args: { results: v.array(v.object({ cid: v.string(), at: v.number(), ok: v.boolean(), message: v.string() })) },
  handler: async (ctx, { results }) => {
    const now = Date.now();
    for (const r of results) {
      const c = await byCid(ctx, r.cid);
      if (!c) continue;
      const newer = c.pendingEdit && c.pendingEdit.at > r.at;
      if (newer) continue;
      await ctx.db.patch(c._id, {
        pendingEdit: undefined,
        editPending: false,
        editStatus: r.ok ? { state: "done", at: now } : { state: "error", at: now, message: r.message },
      });
    }
    return results.length;
  },
});

export const bankIds = carouselSyncQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("carouselBank").collect()).map((b) => b.imageId),
});

export const syncBank = carouselSyncMutation({
  args: {
    images: v.array(
      v.object({ imageId: v.string(), category: v.string(), name: v.string(), storageId: v.id("_storage"), width: v.number(), height: v.number() }),
    ),
  },
  handler: async (ctx, { images }) => {
    for (const img of images) {
      const e = await ctx.db.query("carouselBank").withIndex("by_image", (q) => q.eq("imageId", img.imageId)).unique();
      if (e) {
        if (e.storageId !== img.storageId) await ctx.storage.delete(e.storageId);
        await ctx.db.patch(e._id, img);
      } else await ctx.db.insert("carouselBank", img);
    }
    return images.length;
  },
});

export const pruneBank = carouselSyncMutation({
  args: { imageIds: v.array(v.string()) },
  handler: async (ctx, { imageIds }) => {
    for (const id of imageIds) {
      const e = await ctx.db.query("carouselBank").withIndex("by_image", (q) => q.eq("imageId", id)).unique();
      if (e) {
        await ctx.storage.delete(e.storageId);
        await ctx.db.delete(e._id);
      }
    }
    return imageIds.length;
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
