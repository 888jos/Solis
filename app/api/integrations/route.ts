import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, integrationConnections } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, ok, readJson } from "@/server/backend/http";
import { integrationProviders, sanitizeIntegration, upsertIntegration } from "@/server/backend/integrations";
import { ensureWorkspace } from "@/server/backend/workspaces";

type IntegrationBody = {
  appId?: string;
  config?: Record<string, unknown>;
  provider?: string;
  secretRef?: string;
  status?: string;
  workspaceId?: string;
};

const allowedProviders = integrationProviders;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await getOrCreateLocalSession();
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;

    const db = await getDb();
    const rows = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.workspaceId, workspaceId))
      .orderBy(desc(integrationConnections.createdAt));

    return ok({ integrations: rows.map(sanitizeIntegration) });
  } catch (error) {
    return fail(503, "integrations_list_failed", error instanceof Error ? error.message : "Integrations could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<IntegrationBody>(request);
    const session = await getOrCreateLocalSession();
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const provider = body?.provider?.trim().toLowerCase();
    if (!provider || !allowedProviders.has(provider)) return fail(400, "provider_invalid", "Unsupported integration provider.");

    const requestedAppId = body?.appId?.trim();
    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    const [existingApp] = requestedAppId
      ? await db.select().from(apps).where(eq(apps.id, requestedAppId)).limit(1)
      : [];
    const { integration, updated } = await upsertIntegration(db, {
      appId: existingApp?.id ?? null,
      config: body?.config ?? {},
      provider,
      secretRef: body?.secretRef?.trim() || null,
      status: body?.status?.trim() || "configured",
      workspaceId,
    });
    return ok({ integration: sanitizeIntegration(integration), updated }, { status: updated ? 200 : 201 });
  } catch (error) {
    return fail(500, "integration_save_failed", error instanceof Error ? error.message : "Integration could not be saved.");
  }
}
