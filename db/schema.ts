import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
  ],
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerEmail: text("owner_email"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_slug_unique").on(table.slug),
  ],
);

export const workspaceMemberships = sqliteTable(
  "workspace_memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: text("user_id").notNull().references(() => users.id),
    role: text("role").notNull().default("owner"),
    ...timestamps,
  },
  (table) => [
    index("workspace_memberships_user_idx").on(table.userId),
    uniqueIndex("workspace_memberships_unique").on(table.workspaceId, table.userId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_workspace_idx").on(table.workspaceId),
  ],
);

export const apps = sqliteTable(
  "apps",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    name: text("name").notNull(),
    displayName: text("display_name"),
    platform: text("platform").notNull().default("ios"),
    bundleId: text("bundle_id"),
    appStoreId: text("app_store_id"),
    sku: text("sku"),
    developerName: text("developer_name"),
    artworkUrl: text("artwork_url"),
    primaryCurrency: text("primary_currency").notNull().default("USD"),
    status: text("status").notNull().default("draft"),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("apps_workspace_idx").on(table.workspaceId),
    uniqueIndex("apps_workspace_app_store_unique").on(table.workspaceId, table.appStoreId),
  ],
);

export const appStoreCredentials = sqliteTable(
  "app_store_credentials",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").notNull().references(() => apps.id),
    credentialPreset: text("credential_preset"),
    keyId: text("key_id"),
    issuerId: text("issuer_id"),
    privateKeySecretRef: text("private_key_secret_ref"),
    vendorNumber: text("vendor_number"),
    status: text("status").notNull().default("pending"),
    lastValidatedAt: integer("last_validated_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("app_store_credentials_app_idx").on(table.appId),
    uniqueIndex("app_store_credentials_app_unique").on(table.appId),
  ],
);

export const integrationConnections = sqliteTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").references(() => apps.id),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("needs_configuration"),
    configJson: text("config_json").notNull().default("{}"),
    secretRef: text("secret_ref"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("integration_connections_workspace_idx").on(table.workspaceId),
    uniqueIndex("integration_connections_unique").on(table.workspaceId, table.appId, table.provider),
  ],
);

export const socialAccounts = sqliteTable(
  "social_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").notNull().references(() => apps.id),
    creatorId: text("creator_id"),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    trackingMode: text("tracking_mode").notNull().default("public_handle"),
    profileUrl: text("profile_url"),
    externalSourceId: text("external_source_id"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    trackedSince: integer("tracked_since", { mode: "timestamp" }),
    creatorName: text("creator_name"),
    email: text("email"),
    dealType: text("deal_type").notNull().default("none"),
    fixedFee: real("fixed_fee").notNull().default(0),
    cpmRate: real("cpm_rate").notNull().default(0),
    dealCurrency: text("deal_currency").notNull().default("USD"),
    trackingHashtags: text("tracking_hashtags").notNull().default(""),
    trackingKeywords: text("tracking_keywords").notNull().default(""),
    trackingMatch: text("tracking_match").notNull().default("any"),
    source: text("source"),
    status: text("status").notNull().default("pending"),
    followers: integer("followers").notNull().default(0),
    posts: integer("posts").notNull().default(0),
    views: integer("views").notNull().default(0),
    avgViews: real("avg_views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    engagementRate: real("engagement_rate").notNull().default(0),
    lastError: text("last_error"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("social_accounts_app_idx").on(table.appId),
    uniqueIndex("social_accounts_unique_handle").on(table.workspaceId, table.platform, table.handle),
  ],
);

export const dailyAppMetrics = sqliteTable(
  "daily_app_metrics",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").notNull().references(() => apps.id),
    date: text("date").notNull(),
    countryCode: text("country_code").notNull().default("WW"),
    source: text("source").notNull(),
    currency: text("currency").notNull().default("USD"),
    grossRevenue: real("gross_revenue").notNull().default(0),
    proceeds: real("proceeds").notNull().default(0),
    refunds: real("refunds").notNull().default(0),
    installs: integer("installs").notNull().default(0),
    paidUnits: integer("paid_units").notNull().default(0),
    trials: integer("trials").notNull().default(0),
    cancellations: integer("cancellations").notNull().default(0),
    subscribers: integer("subscribers").notNull().default(0),
    mrr: real("mrr").notNull().default(0),
    arpu: real("arpu").notNull().default(0),
    expenses: real("expenses").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("daily_app_metrics_app_date_idx").on(table.appId, table.date),
    uniqueIndex("daily_app_metrics_unique").on(table.appId, table.date, table.countryCode, table.source),
  ],
);

export const manualExpenses = sqliteTable(
  "manual_expenses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").references(() => apps.id),
    category: text("category").notNull(),
    label: text("label").notNull(),
    amount: real("amount").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    spentAt: text("spent_at").notNull(),
    ...timestamps,
  },
  (table) => [
    index("manual_expenses_workspace_date_idx").on(table.workspaceId, table.spentAt),
  ],
);

export const syncJobs = sqliteTable(
  "sync_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").references(() => apps.id),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    dateRange: text("date_range"),
    status: text("status").notNull().default("queued"),
    recordsRead: integer("records_read").notNull().default(0),
    recordsWritten: integer("records_written").notNull().default(0),
    message: text("message"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    ...timestamps,
  },
  (table) => [
    index("sync_jobs_workspace_status_idx").on(table.workspaceId, table.status),
    index("sync_jobs_provider_idx").on(table.provider, table.kind),
  ],
);

export const backendEvents = sqliteTable(
  "backend_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").references(() => apps.id),
    syncJobId: text("sync_job_id").references(() => syncJobs.id),
    provider: text("provider").notNull(),
    level: text("level").notNull().default("info"),
    code: text("code").notNull(),
    message: text("message").notNull(),
    contextJson: text("context_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [
    index("backend_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("backend_events_job_idx").on(table.syncJobId),
  ],
);

export const dailySocialMetrics = sqliteTable(
  "daily_social_metrics",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    socialAccountId: text("social_account_id").notNull().references(() => socialAccounts.id),
    date: text("date").notNull(),
    source: text("source").notNull(),
    posts: integer("posts").notNull().default(0),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    attributedInstalls: integer("attributed_installs").notNull().default(0),
    engagementRate: real("engagement_rate").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("daily_social_metrics_account_date_idx").on(table.socialAccountId, table.date),
    uniqueIndex("daily_social_metrics_unique").on(table.socialAccountId, table.date, table.source),
  ],
);

export const creators = sqliteTable(
  "creators",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    name: text("name").notNull(),
    profileImageUrl: text("profile_image_url"),
    handle: text("handle"),
    platform: text("platform"),
    email: text("email"),
    country: text("country"),
    language: text("language"),
    timezone: text("timezone"),
    instagramContact: text("instagram_contact"),
    whatsapp: text("whatsapp"),
    primaryAppId: text("primary_app_id").references(() => apps.id),
    status: text("status").notNull().default("Lead"),
    onboardingDate: text("onboarding_date"),
    agreementDate: text("agreement_date"),
    lastContactAt: integer("last_contact_at", { mode: "timestamp" }),
    nextActionAt: integer("next_action_at", { mode: "timestamp" }),
    nextActionText: text("next_action_text"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("creators_workspace_handle_unique").on(table.workspaceId, table.platform, table.handle),
  ],
);

export const creatorAudienceSnapshots = sqliteTable("creator_audience_snapshots", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), creatorId: text("creator_id").notNull(),
  socialAccountId: text("social_account_id"), capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(), followers: integer("followers").notNull().default(0),
  genderMalePct: real("gender_male_pct"), genderFemalePct: real("gender_female_pct"), genderOtherPct: real("gender_other_pct"),
  age13_17: real("age_13_17"), age18_24: real("age_18_24"), age25_34: real("age_25_34"), age35_44: real("age_35_44"), age45_54: real("age_45_54"), age55Plus: real("age_55_plus"),
  topCountriesJson: text("top_countries_json").notNull().default("[]"), tier1Percentage: real("tier1_percentage"), dominantLanguage: text("dominant_language"), niche: text("niche"), audienceNotes: text("audience_notes"), ...timestamps,
}, (table) => [index("creator_audience_creator_idx").on(table.creatorId, table.capturedAt)]);

export const dealTerms = sqliteTable("deal_terms", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), creatorId: text("creator_id").notNull(), campaignId: text("campaign_id"),
  type: text("type").notNull(), currency: text("currency").notNull().default("USD"), cpm: real("cpm").notNull().default(0), maxPayoutPerVideo: real("max_payout_per_video"),
  baseFeePerVideo: real("base_fee_per_video").notNull().default(0), monthlyFixedFee: real("monthly_fixed_fee").notNull().default(0), targetVideos: integer("target_videos").notNull().default(0), minimumPayout: real("minimum_payout").notNull().default(50),
  eligibilityWindowDays: integer("eligibility_window_days").notNull().default(30), payoutFrequency: text("payout_frequency").notNull().default("monthly"), usageRightsMonths: integer("usage_rights_months"),
  organicUsageRights: integer("organic_usage_rights", { mode: "boolean" }).notNull().default(false), paidAdsUsageRights: integer("paid_ads_usage_rights", { mode: "boolean" }).notNull().default(false),
  allowedPlatformsJson: text("allowed_platforms_json").notNull().default("[]"), requiredHashtag: text("required_hashtag"), startDate: text("start_date").notNull(), endDate: text("end_date"), active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (table) => [index("deal_terms_creator_idx").on(table.creatorId), index("deal_terms_campaign_idx").on(table.campaignId)]);

export const campaignCreatorAssignments = sqliteTable("campaign_creator_assignments", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), campaignId: text("campaign_id").notNull(), creatorId: text("creator_id").notNull(), dealTermsId: text("deal_terms_id"),
  status: text("status").notNull().default("invited"), targetVideos: integer("target_videos").notNull().default(0), postedVideos: integer("posted_videos").notNull().default(0), totalViews: integer("total_views").notNull().default(0),
  estimatedPayout: real("estimated_payout").notNull().default(0), finalPayout: real("final_payout").notNull().default(0), progressStatus: text("progress_status").notNull().default("on_track"), joinedAt: integer("joined_at", { mode: "timestamp" }), completedAt: integer("completed_at", { mode: "timestamp" }), ...timestamps,
}, (table) => [index("campaign_assignments_creator_idx").on(table.creatorId), index("campaign_assignments_campaign_idx").on(table.campaignId)]);

export const videoMetricSnapshots = sqliteTable("video_metric_snapshots", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), videoId: text("video_id").notNull(), capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(), views: integer("views").notNull().default(0), likes: integer("likes").notNull().default(0), comments: integer("comments").notNull().default(0), shares: integer("shares").notNull().default(0), favorites: integer("favorites").notNull().default(0), ...timestamps,
}, (table) => [index("video_snapshots_video_idx").on(table.videoId, table.capturedAt)]);

export const payouts = sqliteTable("payouts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), creatorId: text("creator_id").notNull(), campaignId: text("campaign_id"), videoId: text("video_id"), dealTermsId: text("deal_terms_id").notNull(),
  type: text("type").notNull().default("estimated"), currency: text("currency").notNull().default("USD"), eligibleViews: integer("eligible_views").notNull().default(0), cpmApplied: real("cpm_applied").notNull().default(0), baseFeeApplied: real("base_fee_applied").notNull().default(0), capApplied: integer("cap_applied", { mode: "boolean" }).notNull().default(false), grossAmount: real("gross_amount").notNull().default(0), finalAmount: real("final_amount"), eligibilityDate: text("eligibility_date"), payoutCycle: text("payout_cycle"), paymentMethod: text("payment_method"), paidAt: integer("paid_at", { mode: "timestamp" }), transactionReference: text("transaction_reference"), notes: text("notes"), ...timestamps,
}, (table) => [index("payouts_creator_status_idx").on(table.creatorId, table.type), index("payouts_video_idx").on(table.videoId)]);

export const creatorActivity = sqliteTable("creator_activity", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), creatorId: text("creator_id").notNull(), type: text("type").notNull(), title: text("title").notNull(), body: text("body"), occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(), createdBy: text("created_by"), ...timestamps,
}, (table) => [index("creator_activity_creator_idx").on(table.creatorId, table.occurredAt)]);

export const creatorNotes = sqliteTable("creator_notes", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), creatorId: text("creator_id").notNull(), body: text("body").notNull(), pinned: integer("pinned", { mode: "boolean" }).notNull().default(false), ...timestamps,
}, (table) => [index("creator_notes_creator_idx").on(table.creatorId)]);

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), creatorId: text("creator_id"), videoId: text("video_id"), campaignId: text("campaign_id"), type: text("type").notNull(), severity: text("severity").notNull().default("info"), title: text("title").notNull(), body: text("body"), readAt: integer("read_at", { mode: "timestamp" }), resolvedAt: integer("resolved_at", { mode: "timestamp" }), ...timestamps,
}, (table) => [index("alerts_workspace_resolved_idx").on(table.workspaceId, table.resolvedAt), index("alerts_creator_idx").on(table.creatorId)]);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").references(() => apps.id),
    name: text("name").notNull(),
    channel: text("channel").notNull().default("creator"),
    goal: text("goal").notNull().default("Downloads"),
    notes: text("notes"),
    status: text("status").notNull().default("planned"),
    budget: real("budget").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    ...timestamps,
  },
  (table) => [
    index("campaigns_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const creatorVideos = sqliteTable(
  "creator_videos",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    creatorId: text("creator_id").references(() => creators.id),
    socialAccountId: text("social_account_id").references(() => socialAccounts.id),
    campaignId: text("campaign_id").references(() => campaigns.id),
    appId: text("app_id").references(() => apps.id),
    platform: text("platform").notNull(),
    externalVideoId: text("external_video_id"),
    url: text("url"),
    title: text("title"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: text("published_at"),
    hook: text("hook"), angle: text("angle"), format: text("format"),
    eligibleViews: integer("eligible_views"), viewsAt30Days: integer("views_at_30_days"),
    engagementRate: real("engagement_rate"), eligibilityStatus: text("eligibility_status").notNull().default("tracking"),
    winner: integer("winner", { mode: "boolean" }).notNull().default(false), trackingWindowEndsAt: integer("tracking_window_ends_at", { mode: "timestamp" }),
    cost: real("cost").notNull().default(0),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    attributedInstalls: integer("attributed_installs").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("creator_videos_campaign_idx").on(table.campaignId),
    index("creator_videos_creator_idx").on(table.creatorId),
    index("creator_videos_social_account_idx").on(table.socialAccountId),
  ],
);

export const creatives = sqliteTable(
  "creatives",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    campaignId: text("campaign_id").references(() => campaigns.id),
    appId: text("app_id").references(() => apps.id),
    socialAccountId: text("social_account_id").references(() => socialAccounts.id),
    name: text("name").notNull(),
    hook: text("hook"),
    angle: text("angle").notNull().default("Demo"),
    format: text("format").notNull().default("video"),
    status: text("status").notNull().default("draft"),
    url: text("url"),
    spend: real("spend").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    favorites: integer("favorites").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    installs: integer("installs").notNull().default(0),
    revenue: real("revenue").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("creatives_campaign_idx").on(table.campaignId),
  ],
);

export const asoKeywords = sqliteTable(
  "aso_keywords",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    appId: text("app_id").notNull().references(() => apps.id),
    countryCode: text("country_code").notNull(),
    keyword: text("keyword").notNull(),
    source: text("source").notNull().default("manual"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("aso_keywords_unique").on(table.appId, table.countryCode, table.keyword),
  ],
);

export const asoKeywordSnapshots = sqliteTable(
  "aso_keyword_snapshots",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    keywordId: text("keyword_id").notNull().references(() => asoKeywords.id),
    date: text("date").notNull(),
    popularity: integer("popularity"),
    difficulty: integer("difficulty"),
    position: integer("position"),
    trend: integer("trend"),
    appsCount: integer("apps_count"),
    topAppIdsJson: text("top_app_ids_json"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("aso_keyword_snapshots_unique").on(table.keywordId, table.date),
  ],
);

export const dailyBriefs = sqliteTable(
  "daily_briefs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    date: text("date").notNull(),
    summary: text("summary").notNull(),
    risksJson: text("risks_json").notNull().default("[]"),
    actionsJson: text("actions_json").notNull().default("[]"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("daily_briefs_workspace_date_unique").on(table.workspaceId, table.date),
  ],
);
