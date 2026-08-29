import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { syncJobs } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { createSyncJob, recentBackendEvents } from "@/server/backend/jobs";
import { fail, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

type SyncJobBody = {
  appId?: string;
  dateRange?: string;
  kind?: string;
  provider?: string;
  recordsRead?: number;
  recordsWritten?: number;
  status?: string;
  workspaceId?: string;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await getOrCreateLocalSession();
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;
    const provider = searchParams.get("provider");

    const db = await getDb();
    const where = provider
      ? and(eq(syncJobs.workspaceId, workspaceId), eq(syncJobs.provider, provider))
      : eq(syncJobs.workspaceId, workspaceId);
    const rows = await db.select().from(syncJobs).where(where).orderBy(desc(syncJobs.createdAt)).limit(50);
    const events = await recentBackendEvents(db, workspaceId, 50);

    return ok({ events, syncJobs: rows });
  } catch (error) {
    return fail(503, "sync_jobs_list_failed", error instanceof Error ? error.message : "Sync jobs could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<SyncJobBody>(request);
    const session = await getOrCreateLocalSession();
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const provider = body?.provider?.trim();
    const kind = body?.kind?.trim();
    if (!provider) return fail(400, "provider_required", "Provider is required.");
    if (!kind) return fail(400, "kind_required", "Sync kind is required.");

    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    const row = await createSyncJob(db, {
      appId: body?.appId?.trim() || null,
      dateRange: body?.dateRange?.trim() || null,
      kind,
      provider,
      recordsRead: Number.isFinite(Number(body?.recordsRead)) ? Number(body?.recordsRead) : 0,
      recordsWritten: Number.isFinite(Number(body?.recordsWritten)) ? Number(body?.recordsWritten) : 0,
      status: (body?.status?.trim() || "queued") as "queued" | "running" | "success" | "failed" | "retryable",
      workspaceId,
    });
    return ok({ syncJob: row }, { status: 201 });
  } catch (error) {
    return fail(500, "sync_job_create_failed", error instanceof Error ? error.message : "Sync job could not be created.");
  }
}
