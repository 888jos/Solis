import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, ok, readJson } from "@/server/backend/http";
import { integrationProviders, maskSecret, sanitizeIntegration, upsertIntegration } from "@/server/backend/integrations";
import { ensureWorkspace } from "@/server/backend/workspaces";

type ConnectBody = {
  apiKey?: string;
  appId?: string;
  organizationId?: string;
  projectId?: string;
  provider?: string;
  workspaceId?: string;
};

const verifiableProviders = new Set(["revenuecat", "superwall", "openai"]);

export const dynamic = "force-dynamic";

async function verifyProvider(provider: string, apiKey: string) {
  const headers = { authorization: `Bearer ${apiKey}`, accept: "application/json" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const endpoint =
      provider === "revenuecat"
        ? "https://api.revenuecat.com/v2/projects"
        : provider === "superwall"
          ? "https://api.superwall.com/v2/projects"
          : "https://api.openai.com/v1/models";

    const response = await fetch(endpoint, { headers, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        message: `${provider} rejected the key (${response.status}).`,
        statusCode: response.status,
      };
    }
    return {
      ok: true,
      message: `${provider} connected.`,
      sample: text.slice(0, 500),
      statusCode: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `${provider} could not be reached.`,
      statusCode: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<ConnectBody>(request);
    const session = await getOrCreateLocalSession();
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const provider = body?.provider?.trim().toLowerCase();
    const apiKey = body?.apiKey?.trim();
    if (!provider || !integrationProviders.has(provider)) return fail(400, "provider_invalid", "Unsupported integration provider.");
    if (!verifiableProviders.has(provider)) return fail(400, "provider_not_verifiable", "This provider does not use API-key verification.");
    if (!apiKey) return fail(400, "api_key_required", "API key is required.");

    const verification = await verifyProvider(provider, apiKey);
    if (!verification.ok) return fail(401, "integration_verification_failed", verification.message);

    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    const requestedAppId = body?.appId?.trim();
    const [existingApp] = requestedAppId
      ? await db.select().from(apps).where(eq(apps.id, requestedAppId)).limit(1)
      : [];
    const { integration, updated } = await upsertIntegration(db, {
      appId: existingApp?.id ?? null,
      config: {
        apiKey,
        apiKeyPreview: maskSecret(apiKey),
        connectedAt: new Date().toISOString(),
        localAppId: existingApp ? null : requestedAppId || null,
        organizationId: body?.organizationId?.trim() || null,
        projectId: body?.projectId?.trim() || null,
        verificationStatusCode: verification.statusCode,
      },
      provider,
      secretRef: `local-d1:${workspaceId}:${provider}`,
      status: "connected",
      workspaceId,
    });

    return ok({ integration: sanitizeIntegration(integration), updated, verification: { message: verification.message, statusCode: verification.statusCode } }, { status: updated ? 200 : 201 });
  } catch (error) {
    return fail(500, "integration_connect_failed", error instanceof Error ? error.message : "Integration could not be connected.");
  }
}
