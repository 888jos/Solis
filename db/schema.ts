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
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    trackingMode: text("tracking_mode").notNull().default("public_handle"),
    source: text("source"),
    status: text("status").notNull().default("pending"),
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
    handle: text("handle"),
    platform: text("platform"),
    email: text("email"),
    status: text("status").notNull().default("prospect"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("creators_workspace_handle_unique").on(table.workspaceId, table.platform, table.handle),
  ],
);

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
    campaignId: text("campaign_id").references(() => campaigns.id),
    appId: text("app_id").references(() => apps.id),
    platform: text("platform").notNull(),
    url: text("url"),
    title: text("title"),
    publishedAt: text("published_at"),
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
