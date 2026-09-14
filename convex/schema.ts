import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Legacy rows were imported with their existing string IDs. Keep the initial
// compatibility schema deliberately permissive so the import is lossless;
// public application functions will validate each write at their boundary.
const legacyRow = v.any();
const legacyTable = () => defineTable(legacyRow).index("by_legacy_id", ["id"]);

export default defineSchema({
  app_store_credentials: legacyTable().index("by_app", ["appId"]),
  apps: legacyTable().index("by_workspace", ["workspaceId"]).index("by_workspace_store_id", ["workspaceId", "appStoreId"]),
  aso_keyword_snapshots: legacyTable().index("by_keyword_date", ["keywordId", "date"]).index("by_workspace", ["workspaceId"]),
  aso_keywords: legacyTable().index("by_app_country_keyword", ["appId", "countryCode", "keyword"]).index("by_workspace", ["workspaceId"]),
  backend_events: legacyTable().index("by_workspace_created", ["workspaceId", "createdAt"]).index("by_sync_job", ["syncJobId"]),
  alerts: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]).index("by_workspace_resolved", ["workspaceId", "resolvedAt"]),
  campaigns: legacyTable().index("by_workspace", ["workspaceId"]).index("by_workspace_status", ["workspaceId", "status"]),
  campaign_creator_assignments: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]).index("by_campaign", ["campaignId"]),
  creatives: legacyTable().index("by_workspace", ["workspaceId"]).index("by_campaign", ["campaignId"]),
  creator_videos: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]).index("by_social_account", ["socialAccountId"]).index("by_campaign", ["campaignId"]),
  creator_activity: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]),
  creator_audience_snapshots: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]),
  creator_notes: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]),
  creators: legacyTable().index("by_workspace", ["workspaceId"]).index("by_workspace_platform_handle", ["workspaceId", "platform", "handle"]),
  deal_terms: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]).index("by_campaign", ["campaignId"]),
  daily_app_metrics: legacyTable().index("by_app_date", ["appId", "date"]).index("by_workspace", ["workspaceId"]),
  daily_briefs: legacyTable().index("by_workspace_date", ["workspaceId", "date"]),
  daily_social_metrics: legacyTable().index("by_account_date", ["socialAccountId", "date"]).index("by_workspace", ["workspaceId"]),
  integration_connections: legacyTable().index("by_workspace", ["workspaceId"]).index("by_provider", ["workspaceId", "provider"]),
  manual_expenses: legacyTable().index("by_workspace_date", ["workspaceId", "spentAt"]),
  payouts: legacyTable().index("by_workspace", ["workspaceId"]).index("by_creator", ["creatorId"]).index("by_video", ["videoId"]),
  sessions: legacyTable().index("by_user", ["userId"]).index("by_workspace", ["workspaceId"]),
  social_accounts: legacyTable().index("by_workspace", ["workspaceId"]).index("by_app", ["appId"]).index("by_platform_handle", ["workspaceId", "platform", "handle"]),
  sync_jobs: legacyTable().index("by_workspace_status", ["workspaceId", "status"]).index("by_provider_kind", ["provider", "kind"]),
  video_metric_snapshots: legacyTable().index("by_workspace", ["workspaceId"]).index("by_video", ["videoId"]),
  users: legacyTable().index("by_email", ["email"]),
  workspace_memberships: legacyTable().index("by_workspace_user", ["workspaceId", "userId"]).index("by_user", ["userId"]),
  workspaces: legacyTable().index("by_slug", ["slug"]),
});
