import { and, eq, isNull } from "drizzle-orm";
import { integrationConnections } from "@/db/schema";
import { now } from "@/server/backend/http";

export const integrationProviders = new Set([
  "app_store_connect",
  "revenuecat",
  "superwall",
  "apple_search",
  "tiktok_public",
  "instagram_public",
  "youtube_public",
  "openai",
  "manual_expenses",
]);

type IntegrationDb = {
  insert: (table: typeof integrationConnections) => {
    values: (row: typeof integrationConnections.$inferInsert) => Promise<unknown>;
  };
  select: () => {
    from: (table: typeof integrationConnections) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Array<typeof integrationConnections.$inferSelect>>;
      };
    };
  };
  update: (table: typeof integrationConnections) => {
    set: (values: Partial<typeof integrationConnections.$inferInsert>) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
};

export function maskSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function sanitizeIntegration<T extends { configJson: string }>(integration: T) {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(integration.configJson || "{}") as Record<string, unknown>;
  } catch {
    config = {};
  }
  delete config.apiKey;
  delete config.token;
  delete config.secret;
  const safeConfig = config;
  return { ...integration, configJson: JSON.stringify(safeConfig) };
}

export async function upsertIntegration(
  db: IntegrationDb,
  input: {
    appId?: string | null;
    config?: Record<string, unknown>;
    provider: string;
    secretRef?: string | null;
    status?: string;
    workspaceId: string;
  },
) {
  const timestamp = now();
  const appId = input.appId || null;
  const [existing] = await db
    .select()
    .from(integrationConnections)
    .where(and(
      eq(integrationConnections.workspaceId, input.workspaceId),
      eq(integrationConnections.provider, input.provider),
      appId ? eq(integrationConnections.appId, appId) : isNull(integrationConnections.appId),
    ))
    .limit(1);

  const values = {
    appId,
    configJson: JSON.stringify(input.config ?? {}),
    lastSyncedAt: input.status === "connected" ? timestamp : null,
    provider: input.provider,
    secretRef: input.secretRef ?? null,
    status: input.status ?? "configured",
    updatedAt: timestamp,
    workspaceId: input.workspaceId,
  };

  if (existing) {
    await db.update(integrationConnections).set(values).where(eq(integrationConnections.id, existing.id));
    return { integration: { ...existing, ...values }, updated: true };
  }

  const integration = {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    ...values,
  };
  await db.insert(integrationConnections).values(integration);
  return { integration, updated: false };
}
