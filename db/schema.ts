import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const apps = sqliteTable("apps", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  bundleId: text("bundle_id"),
  appStoreId: text("app_store_id"),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const appStoreCredentials = sqliteTable("app_store_credentials", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  appId: text("app_id").notNull().references(() => apps.id),
  keyId: text("key_id").notNull(),
  issuerId: text("issuer_id").notNull(),
  privateKeySecretRef: text("private_key_secret_ref").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const socialAccounts = sqliteTable("social_accounts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  appId: text("app_id").notNull().references(() => apps.id),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  trackingMode: text("tracking_mode").notNull().default("public_handle"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const dailyAppMetrics = sqliteTable("daily_app_metrics", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  appId: text("app_id").notNull().references(() => apps.id),
  date: text("date").notNull(),
  source: text("source").notNull(),
  revenue: real("revenue").notNull().default(0),
  installs: integer("installs").notNull().default(0),
  subscribers: integer("subscribers").notNull().default(0),
  expenses: real("expenses").notNull().default(0),
});

export const dailySocialMetrics = sqliteTable("daily_social_metrics", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  socialAccountId: text("social_account_id").notNull().references(() => socialAccounts.id),
  date: text("date").notNull(),
  source: text("source").notNull(),
  posts: integer("posts").notNull().default(0),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  attributedInstalls: integer("attributed_installs").notNull().default(0),
});
