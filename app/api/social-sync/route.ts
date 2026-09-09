import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { socialAccounts, syncJobs } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { now } from "@/server/backend/http";

const GLOBAL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    status: "running",
    recordsRead: 0,
    recordsWritten: 0,
    message: "Manual-safe 12-hour social refresh",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const accounts = await db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, session.workspaceId));
  const cookie = request.headers.get("cookie") || "";
  const origin = new URL(request.url).origin;
  const results = await Promise.allSettled(accounts.map(async (account) => {
    const url = new URL("/api/social-profile", origin);
    url.searchParams.set("platform", account.platform);
    url.searchParams.set("handle", account.handle);
    url.searchParams.set("accountId", account.id);
    const response = await fetch(url, { method: "POST", headers: cookie ? { cookie } : undefined });
    if (!response.ok && response.status !== 429) throw new Error(`Sync failed for ${account.handle}`);
    return response.status;
  }));
  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - succeeded;
  await db.update(syncJobs).set({
    status: failed ? "retryable" : "success",
    recordsRead: accounts.length,
    recordsWritten: succeeded,
    message: failed ? `${failed} account syncs failed` : `${succeeded} accounts refreshed`,
    updatedAt: now(),
  }).where(eq(syncJobs.id, jobId));

  return Response.json({ ok: true, skipped: false, synced: succeeded, failed });
}

