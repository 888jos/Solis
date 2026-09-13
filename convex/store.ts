/* eslint-disable @typescript-eslint/no-explicit-any */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const names = [
  "app_store_credentials", "apps", "aso_keyword_snapshots", "aso_keywords",
  "backend_events", "campaigns", "creatives", "creator_videos", "creators",
  "daily_app_metrics", "daily_briefs", "daily_social_metrics",
  "integration_connections", "manual_expenses", "sessions", "social_accounts",
  "sync_jobs", "users", "workspace_memberships", "workspaces",
] as const;
const tableName = v.string();
const filters = v.array(v.object({ field: v.string(), op: v.string(), value: v.any() }));

function assertTable(name: string): asserts name is (typeof names)[number] {
  if (!names.includes(name as (typeof names)[number])) throw new Error("Unknown table");
}

const indexedFields: Partial<Record<(typeof names)[number], Record<string, string>>> = {
  app_store_credentials: { appId: "by_app" },
  apps: { workspaceId: "by_workspace" },
  aso_keyword_snapshots: { workspaceId: "by_workspace", keywordId: "by_keyword_date" },
  aso_keywords: { workspaceId: "by_workspace", appId: "by_app_country_keyword" },
  backend_events: { workspaceId: "by_workspace_created", syncJobId: "by_sync_job" },
  campaigns: { workspaceId: "by_workspace" },
  creatives: { workspaceId: "by_workspace", campaignId: "by_campaign" },
  creator_videos: { workspaceId: "by_workspace", socialAccountId: "by_social_account", creatorId: "by_creator", campaignId: "by_campaign" },
  creators: { workspaceId: "by_workspace" },
  daily_app_metrics: { workspaceId: "by_workspace", appId: "by_app_date" },
  daily_briefs: { workspaceId: "by_workspace_date" },
  daily_social_metrics: { workspaceId: "by_workspace", socialAccountId: "by_account_date" },
  integration_connections: { workspaceId: "by_workspace" },
  manual_expenses: { workspaceId: "by_workspace_date" },
  sessions: { workspaceId: "by_workspace", userId: "by_user" },
  social_accounts: { workspaceId: "by_workspace", appId: "by_app" },
  sync_jobs: { workspaceId: "by_workspace_status" },
  users: { email: "by_email" },
  workspace_memberships: { workspaceId: "by_workspace_user", userId: "by_user" },
  workspaces: { id: "by_legacy_id", slug: "by_slug" },
};

async function matchingRows(ctx: any, name: (typeof names)[number], where: Array<{ field: string; op: string; value: any }>) {
  const equality = where.find((filter) => filter.op === "=" && filter.value !== null);
  const indexName = equality ? indexedFields[name]?.[equality.field] ?? (equality.field === "id" ? "by_legacy_id" : undefined) : undefined;
  let rows = indexName && equality
    ? await ctx.db.query(name).withIndex(indexName, (q: any) => q.eq(equality.field, equality.value)).collect()
    : await ctx.db.query(name).collect();
  rows = rows.filter((row: any) => where.every(({ field, op, value }) => {
    const actual = row[field];
    switch (op) {
      case "=": return actual === value;
      case "!=": return actual !== value;
      case ">": return actual > value;
      case ">=": return actual >= value;
      case "<": return actual < value;
      case "<=": return actual <= value;
      case "is null": return actual === null || actual === undefined;
      case "is not null": return actual !== null && actual !== undefined;
      default: throw new Error(`Unsupported comparison ${op}`);
    }
  }));
  return rows;
}

export const select = internalQuery({
  args: {
    tableName,
    where: v.optional(filters),
    orderBy: v.optional(v.object({ field: v.string(), direction: v.string() })),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertTable(args.tableName);
    const rows = await matchingRows(ctx, args.tableName, args.where ?? []);
    if (args.orderBy) {
      const { field, direction } = args.orderBy;
      rows.sort((a: any, b: any) => {
        const order = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
        return direction === "desc" ? -order : order;
      });
    }
    const result = args.limit === undefined ? rows : rows.slice(0, args.limit);
    return result.map((document: any) => {
      const row = { ...document };
      delete row._id;
      delete row._creationTime;
      return row;
    });
  },
});

export const insert = internalMutation({
  args: { tableName, row: v.any() },
  handler: async (ctx, args) => {
    assertTable(args.tableName);
    if (args.row?.id !== undefined) {
      const existing = await ctx.db.query(args.tableName).withIndex("by_legacy_id", (q: any) => q.eq("id", args.row.id)).first();
      if (existing) throw new Error(`Duplicate id in ${args.tableName}`);
    }
    return await ctx.db.insert(args.tableName, args.row);
  },
});

export const update = internalMutation({
  args: { tableName, where: filters, values: v.any() },
  handler: async (ctx, args) => {
    assertTable(args.tableName);
    const rows = await matchingRows(ctx, args.tableName, args.where);
    for (const row of rows) {
      const patch = Object.fromEntries(Object.entries(args.values).filter(([, value]) => value !== undefined));
      await ctx.db.patch(row._id, patch);
    }
    return rows.length;
  },
});

export const remove = internalMutation({
  args: { tableName, where: filters },
  handler: async (ctx, args) => {
    assertTable(args.tableName);
    const rows = await matchingRows(ctx, args.tableName, args.where);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
