import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { socialAccounts, syncJobs } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { now } from "@/server/backend/http";

const GLOBAL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getOrCreateLocalSession();
  const db = await getDb();
  const [latest] = await db.select().from(syncJobs).where(and(
    eq(syncJobs.workspaceId, session.workspaceId),
    eq(syncJobs.provider, "apify"),
    eq(syncJobs.kind, "social_global"),
  )).orderBy(desc(syncJobs.createdAt)).limit(1);

  const currentTime = Date.now();
  const latestTime = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
  if (latestTime && currentTime - latestTime < GLOBAL_SYNC_INTERVAL_MS) {
    return Response.json({ ok: true, skipped: true, nextSyncAt: new Date(latestTime + GLOBAL_SYNC_INTERVAL_MS).toISOString() });
  }

  const timestamp = now();
  const jobId = crypto.randomUUID();
  await db.insert(syncJobs).values({
    id: jobId,
    workspaceId: session.workspaceId,
    appId: null,
    provider: "apify",
    kind: "social_global",
    dateRange: "90d",
    status: "queued",
    recordsRead: 0,
    recordsWritten: 0,
    message: "Manual-safe daily social refresh",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const accounts = await db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, session.workspaceId));
  return Response.json({
    ok: true,
    skipped: false,
    jobId,
    accounts: accounts.map((account) => ({ id: account.id, platform: account.platform, handle: account.handle })),
  });
}
