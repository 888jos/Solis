import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { appStoreCredentials, apps } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { now, ok } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

export const dynamic = "force-dynamic";

const workspaceId = "drift-studio";

const defaultApps = [
  {
    appStoreId: "6760921524",
    bundleId: "com.wrap.cocorise",
    credentialPreset: "cocorise",
    displayName: "Cocorise",
    id: "cocorise",
    keyId: "BUJ22BWQ5F",
    name: "Cocorise",
    platform: "ios",
    privateKeySecretRef: ".local-keys/AuthKey_BUJ22BWQ5F.p8",
    sku: "CocoriseIOS01",
    vendorNumber: "93962715",
  },
  {
    appStoreId: "6758314805",
    bundleId: "com.solstys.cortifree",
    credentialPreset: "cortifree",
    displayName: "CortiFree",
    id: "cortifree",
    keyId: "BUJ22BWQ5F",
    name: "CortiFree",
    platform: "ios",
    privateKeySecretRef: ".local-keys/AuthKey_BUJ22BWQ5F.p8",
    sku: "CortiFreeIOS001",
    vendorNumber: "93962715",
  },
];

async function ensureDefaultApps() {
  const db = await getDb();
  await ensureWorkspace(db, workspaceId);
  const createdAt = now();
  const existingApps = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.workspaceId, workspaceId))
    .limit(1);

  if (existingApps.length) return;

  for (const app of defaultApps) {
    const [existing] = await db
      .select()
      .from(apps)
      .where(and(eq(apps.workspaceId, workspaceId), eq(apps.appStoreId, app.appStoreId), isNull(apps.deletedAt)))
      .limit(1);

    const appId = existing?.id ?? app.id;
    if (!existing) {
      await db.insert(apps).values({
        id: appId,
        workspaceId,
        name: app.name,
        displayName: app.displayName,
        platform: app.platform,
        bundleId: app.bundleId,
        appStoreId: app.appStoreId,
        sku: app.sku,
        developerName: "SOLSTYS I.T.",
        artworkUrl: null,
        primaryCurrency: "USD",
        status: "active",
        deletedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
    }

    const [credential] = await db
      .select()
      .from(appStoreCredentials)
      .where(eq(appStoreCredentials.appId, appId))
      .limit(1);

    if (!credential) {
      await db.insert(appStoreCredentials).values({
        id: crypto.randomUUID(),
        workspaceId,
        appId,
        credentialPreset: app.credentialPreset,
        keyId: app.keyId,
        issuerId: "c6d73ae8-2d47-4964-92ed-771ec137f6d0",
        privateKeySecretRef: app.privateKeySecretRef,
        vendorNumber: app.vendorNumber,
        status: "server_preset",
        lastValidatedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }
}

export async function GET() {
  await ensureDefaultApps();
  const session = await getOrCreateLocalSession();
  return ok({
    session,
  });
}
