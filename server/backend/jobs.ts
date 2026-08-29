import { desc, eq } from "drizzle-orm";
import { backendEvents, syncJobs } from "@/db/schema";
import { now } from "@/server/backend/http";

type JobDb = Awaited<ReturnType<typeof import("@/db").getDb>>;

export type SyncJobStatus = "queued" | "running" | "success" | "failed" | "retryable";

export async function createSyncJob(
  db: JobDb,
  input: {
    appId?: string | null;
    dateRange?: string | null;
    kind: string;
    message?: string | null;
    provider: string;
    recordsRead?: number;
    recordsWritten?: number;
    status?: SyncJobStatus;
    workspaceId: string;
  },
) {
  const timestamp = now();
  const job = {
    id: crypto.randomUUID(),
    appId: input.appId ?? null,
    createdAt: timestamp,
    dateRange: input.dateRange ?? null,
    error: null,
    finishedAt: null,
    kind: input.kind,
    message: input.message ?? null,
    provider: input.provider,
    recordsRead: Number.isFinite(Number(input.recordsRead)) ? Number(input.recordsRead) : 0,
    recordsWritten: Number.isFinite(Number(input.recordsWritten)) ? Number(input.recordsWritten) : 0,
    startedAt: input.status === "running" ? timestamp : null,
    status: input.status ?? "queued",
    updatedAt: timestamp,
    workspaceId: input.workspaceId,
  };
  await db.insert(syncJobs).values(job);
  await logBackendEvent(db, {
    appId: job.appId,
    code: `sync_${job.status}`,
    message: job.message ?? `${job.provider} ${job.kind} ${job.status}`,
    provider: job.provider,
    syncJobId: job.id,
    workspaceId: job.workspaceId,
  });
  return job;
}

export async function updateSyncJob(
  db: JobDb,
  jobId: string,
  values: {
    error?: string | null;
    message?: string | null;
    recordsRead?: number;
    recordsWritten?: number;
    status: SyncJobStatus;
  },
) {
  const timestamp = now();
  const patch: Partial<typeof syncJobs.$inferInsert> = {
    ...values,
    finishedAt: values.status === "success" || values.status === "failed" || values.status === "retryable" ? timestamp : null,
    updatedAt: timestamp,
  };
  if (values.status === "running") patch.startedAt = timestamp;
  await db.update(syncJobs).set(patch).where(eq(syncJobs.id, jobId));
  return patch;
}

export async function logBackendEvent(
  db: JobDb,
  input: {
    appId?: string | null;
    code: string;
    context?: Record<string, unknown>;
    level?: "debug" | "info" | "warn" | "error";
    message: string;
    provider: string;
    syncJobId?: string | null;
    workspaceId: string;
  },
) {
  const timestamp = now();
  const event = {
    id: crypto.randomUUID(),
    appId: input.appId ?? null,
    code: input.code,
    contextJson: JSON.stringify(input.context ?? {}),
    createdAt: timestamp,
    level: input.level ?? "info",
    message: input.message,
    provider: input.provider,
    syncJobId: input.syncJobId ?? null,
    updatedAt: timestamp,
    workspaceId: input.workspaceId,
  };
  await db.insert(backendEvents).values(event);
  return event;
}

export async function recentBackendEvents(db: JobDb, workspaceId: string, limit = 50) {
  return db
    .select()
    .from(backendEvents)
    .where(eq(backendEvents.workspaceId, workspaceId))
    .orderBy(desc(backendEvents.createdAt))
    .limit(limit);
}
