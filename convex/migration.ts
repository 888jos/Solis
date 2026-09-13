import { internalQuery } from "./_generated/server";

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
