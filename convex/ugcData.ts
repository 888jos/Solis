import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

// Airtable UGC base (appDXNkfK2prnjyud) → ugc* tables. Read-only on the Airtable side.
// Records arrive in the Airtable REST shape ({ id, createdTime, fields: { "Field name": value } }),
// from either the REST sync (convex/sources/airtable.ts) or a snapshot import (importSnapshot).
// Personal data (emails, phone numbers, messages, outreach names) is never stored.

export const AIRTABLE_BASE_ID = "appDXNkfK2prnjyud";
export const UGC_SOURCE = "airtable_ugc";

export const AIRTABLE_TABLES = {
  creators: {
    id: "tblos6CTgZSfEjHBM",
    fields: ["Name", "Status", "Primary account", "Program", "Stage", "SideShift campaign", "Country", "TikTok account URL", "Start date", "Trial start", "Fixed start", "Stage note"],
  },
  productions: {
    id: "tblAeXrRoHfCVkEQt",
    fields: ["Production", "Creator", "Production status", "Publication date", "Platform", "Published video URL", "Views", "Likes", "Comments", "Shares", "Attributed cost USD", "Cost source", "Last stats update", "Script"],
  },
  outreach: {
    id: "tblCBn0yJfSAO5sy3",
    fields: ["Label", "First contact", "Last reply date", "Last message by"],
  },
  applications: {
    id: "tblOWYSjg2qZQViio",
    fields: ["Application date", "Program", "Decision", "Source", "Linked creator"],
  },
} as const;

export type AirtableRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };

const recordValidator = v.object({ id: v.string(), createdTime: v.optional(v.string()), fields: v.any() });

function str(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return str(value[0]);
  if (typeof value === "object" && "name" in (value as object)) return str((value as { name: unknown }).name);
  return undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function linkId(value: unknown): string | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const first = value[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "id" in first) return String((first as { id: unknown }).id);
  return undefined;
}

function day(value: unknown): string | undefined {
  const s = str(value);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
}

/** Monthly fixed amount, only when Airtable spells it out (e.g. "$300/month" in the stage note). */
function monthlyUsd(note: string | undefined): number | undefined {
  const m = note?.match(/\$\s?(\d{2,5})\s*\/\s*month/i);
  return m ? Number(m[1]) : undefined;
}

function normalizeCreator(r: AirtableRecord, now: number) {
  const f = r.fields;
  const name = str(f["Name"]);
  if (!name) return null; // empty rows in the Airtable grid
  return {
    airtableId: r.id,
    name,
    handle: str(f["Primary account"]),
    status: str(f["Status"]),
    program: str(f["Program"]),
    stage: str(f["Stage"]),
    campaign: str(f["SideShift campaign"]),
    country: str(f["Country"]),
    tiktokUrl: str(f["TikTok account URL"]),
    startDate: day(f["Start date"]),
    trialStart: day(f["Trial start"]),
    fixedStart: day(f["Fixed start"]),
    fixedMonthlyUsd: monthlyUsd(str(f["Stage note"])),
    createdAt: r.createdTime ? Date.parse(r.createdTime) : undefined,
    updatedAt: now,
  };
}

function normalizeVideo(r: AirtableRecord, now: number) {
  const f = r.fields;
  const status = str(f["Production status"]);
  if (!status && !str(f["Production"]) && !linkId(f["Creator"])) return null; // empty grid row
  return {
    airtableId: r.id,
    creatorAirtableId: linkId(f["Creator"]),
    label: str(f["Production"]),
    status,
    url: str(f["Published video URL"]),
    platform: str(f["Platform"]),
    postedAt: day(f["Publication date"]),
    views: num(f["Views"]) ?? 0,
    likes: num(f["Likes"]),
    comments: num(f["Comments"]),
    shares: num(f["Shares"]),
    script: linkId(f["Script"]),
    costUsd: num(f["Attributed cost USD"]),
    costSource: str(f["Cost source"]),
    statsUpdatedAt: day(f["Last stats update"]),
    updatedAt: now,
  };
}

function normalizeOutreach(r: AirtableRecord, now: number) {
  const f = r.fields;
  return {
    airtableId: r.id,
    firstContact: day(f["First contact"]),
    label: str(f["Label"]),
    lastReplyDate: day(f["Last reply date"]),
    lastMessageBy: str(f["Last message by"]),
    updatedAt: now,
  };
}

function normalizeApplication(r: AirtableRecord, now: number) {
  const f = r.fields;
  const appliedAt = str(f["Application date"]) ?? r.createdTime;
  if (!appliedAt) return null;
  return {
    airtableId: r.id,
    appliedAt,
    program: str(f["Program"]),
    decision: str(f["Decision"]),
    source: str(f["Source"]),
    creatorAirtableId: linkId(f["Linked creator"]),
    updatedAt: now,
  };
}

type UgcTable = "ugcCreators" | "ugcVideos" | "ugcOutreach" | "ugcApplications";

/** Full replace of one table from a snapshot: upsert by airtableId, delete rows Airtable no longer has. */
async function replaceTable(ctx: MutationCtx, table: UgcTable, rows: ({ airtableId: string } & Record<string, unknown>)[]) {
  const existing = await ctx.db.query(table).collect();
  const byId = new Map(existing.map((doc) => [doc.airtableId, doc]));
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.airtableId);
    const doc = byId.get(row.airtableId);
    if (doc) await ctx.db.replace(doc._id, row as any);
    else await ctx.db.insert(table, row as any);
  }
  for (const doc of existing) if (!seen.has(doc.airtableId)) await ctx.db.delete(doc._id);
  return rows.length;
}

const snapshotArgs = {
  creators: v.array(recordValidator),
  productions: v.array(recordValidator),
  outreach: v.array(recordValidator),
  applications: v.array(recordValidator),
};

type SnapshotInput = { creators: AirtableRecord[]; productions: AirtableRecord[]; outreach: AirtableRecord[]; applications: AirtableRecord[] };

async function applySnapshot(ctx: MutationCtx, input: SnapshotInput) {
  const now = Date.now();
  const nonNull = <T>(x: T | null): x is T => x !== null;
  const counts = {
    creators: await replaceTable(ctx, "ugcCreators", input.creators.map((r) => normalizeCreator(r, now)).filter(nonNull)),
    videos: await replaceTable(ctx, "ugcVideos", input.productions.map((r) => normalizeVideo(r, now)).filter(nonNull)),
    outreach: await replaceTable(ctx, "ugcOutreach", input.outreach.map((r) => normalizeOutreach(r, now))),
    applications: await replaceTable(ctx, "ugcApplications", input.applications.map((r) => normalizeApplication(r, now)).filter(nonNull)),
  };
  return counts;
}

function countsMessage(c: { creators: number; videos: number; outreach: number; applications: number }) {
  return `${c.creators} créateurs, ${c.videos} productions, ${c.applications} candidatures, ${c.outreach} contacts`;
}

/** Used by the REST sync (sources/airtable.ts). */
export const applyApiSnapshot = internalMutation({
  args: { runId: v.id("syncRuns"), ...snapshotArgs },
  handler: async (ctx, { runId, ...input }) => {
    const counts = await applySnapshot(ctx, input);
    const rows = counts.creators + counts.videos + counts.outreach + counts.applications;
    await ctx.db.patch(runId, { status: "ok", rows, message: `API Airtable · ${countsMessage(counts)}`, finishedAt: Date.now() });
    return counts;
  },
});

/**
 * Manual snapshot import while AIRTABLE_TOKEN is missing: records read from Airtable (MCP) and sent as JSON.
 * `snapshotAt` = when the records were read (ISO). Run: npx convex run ugcData:importSnapshot "$(cat snapshot.json)"
 */
export const importSnapshot = internalMutation({
  args: { snapshotAt: v.string(), ...snapshotArgs },
  handler: async (ctx, { snapshotAt, ...input }) => {
    const counts = await applySnapshot(ctx, input);
    const at = Date.parse(snapshotAt);
    const rows = counts.creators + counts.videos + counts.outreach + counts.applications;
    await ctx.db.insert("syncRuns", {
      source: UGC_SOURCE,
      status: "ok",
      startedAt: at,
      finishedAt: at,
      rows,
      message: `snapshot ${snapshotAt.slice(0, 10)} · ${countsMessage(counts)}`,
    });
    return counts;
  },
});
