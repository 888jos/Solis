#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [sqlitePath, outputDirectory] = process.argv.slice(2);
if (!sqlitePath || !outputDirectory) {
  throw new Error("Usage: node scripts/export-d1-sqlite-to-convex.mjs <sqlite-file> <output-directory>");
}

const tables = [
  "app_store_credentials", "apps", "aso_keyword_snapshots", "aso_keywords",
  "backend_events", "campaigns", "creatives", "creator_videos", "creators",
  "daily_app_metrics", "daily_briefs", "daily_social_metrics",
  "integration_connections", "manual_expenses", "sessions", "social_accounts",
  "sync_jobs", "users", "workspace_memberships", "workspaces",
];
const timestampFields = new Set([
  "created_at", "updated_at", "last_seen_at", "expires_at", "deleted_at",
  "last_validated_at", "last_synced_at", "started_at", "finished_at",
]);
const toCamel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const counts = {};
for (const table of tables) {
  const sql = `SELECT * FROM "${table}" ORDER BY rowid;`;
  const raw = execFileSync("sqlite3", ["-json", sqlitePath, sql], { encoding: "utf8" });
  const rows = JSON.parse(raw || "[]").map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      toCamel(key),
      timestampFields.has(key) && typeof value === "number" ? value * 1000 : value,
    ]),
  ));
  const jsonl = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(join(outputDirectory, `${table}.jsonl`), jsonl ? `${jsonl}\n` : "", { mode: 0o600 });
  counts[table] = rows.length;
}
process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
