import { internalQuery } from "./_generated/server";

const tableNames = [
  "alerts", "app_store_credentials", "apps", "aso_keyword_snapshots", "aso_keywords",
  "backend_events", "campaign_creator_assignments", "campaigns", "creatives", "creator_activity", "creator_audience_snapshots", "creator_notes", "creator_videos", "creators", "deal_terms",
  "daily_app_metrics", "daily_briefs", "daily_social_metrics",
  "integration_connections", "manual_expenses", "payouts", "sessions", "social_accounts",
  "sync_jobs", "users", "video_metric_snapshots", "workspace_memberships", "workspaces",
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
