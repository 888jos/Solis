import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

const tableNames = [
  "app_store_credentials", "apps", "aso_keyword_snapshots", "aso_keywords",
  "backend_events", "campaigns", "creatives", "creator_videos", "creators",
  "daily_app_metrics", "daily_briefs", "daily_social_metrics",
  "integration_connections", "manual_expenses", "sessions", "social_accounts",
  "sync_jobs", "users", "workspace_memberships", "workspaces",
] as const;

export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const result: Record<string, number> = {};
    for (const tableName of tableNames) {
      result[tableName] = (await ctx.db.query(tableName).collect()).length;
    }
    return result;
  },
});

export const records = internalQuery({
  args: { tableName: v.string() },
  handler: async (ctx, args) => {
    if (!tableNames.includes(args.tableName as (typeof tableNames)[number])) {
      throw new Error("Unknown migration table");
    }
    return await ctx.db.query(args.tableName as (typeof tableNames)[number]).collect();
  },
});
