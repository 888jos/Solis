import { and, eq, isNull } from "drizzle-orm";
import { appStoreCredentials, apps } from "@/db/schema";
import { now } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";
import type { DbClient } from "@/server/backend/workspaces";

export const DEFAULT_WORKSPACE_ID = "drift-studio";

const defaultApps = [
  {
    appStoreId: "6760921524",
    bundleId: "com.wrap.cocorise",
    credentialPreset: "cocorise",
    developerName: "SOLSTYS I.T.",
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
    developerName: "SOLSTYS I.T.",
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

export async function ensureDefaultApps(db: DbClient, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (workspaceId !== DEFAULT_WORKSPACE_ID) return;
  await ensureWorkspace(db, workspaceId);
  const createdAt = now();

  for (const app of defaultApps) {
    const [existing] = await db
      .select()
      .from(apps)
      .where(and(eq(apps.workspaceId, workspaceId), eq(apps.appStoreId, app.appStoreId), isNull(apps.deletedAt)))
      .limit(1);

    const appId = existing?.id ?? app.id;
    if (existing) {
      await db.update(apps).set({
        artworkUrl: existing.artworkUrl,
        bundleId: app.bundleId,
        developerName: app.developerName,
        displayName: app.displayName,
        name: app.name,
        platform: app.platform,
        primaryCurrency: "USD",
        sku: app.sku,
        status: "active",
        updatedAt: createdAt,
      }).where(eq(apps.id, existing.id));
    } else {
      await db.insert(apps).values({
        id: appId,
        workspaceId,
        name: app.name,
        displayName: app.displayName,
        platform: app.platform,
        bundleId: app.bundleId,
        appStoreId: app.appStoreId,
        sku: app.sku,
        developerName: app.developerName,
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

    const credentialValues = {
      workspaceId,
      appId,
      credentialPreset: app.credentialPreset,
      keyId: app.keyId,
      issuerId: "c6d73ae8-2d47-4964-92ed-771ec137f6d0",
      privateKeySecretRef: app.privateKeySecretRef,
      vendorNumber: app.vendorNumber,
      status: "server_preset",
      lastValidatedAt: null,
      updatedAt: createdAt,
    };

    if (credential) {
      await db.update(appStoreCredentials).set(credentialValues).where(eq(appStoreCredentials.id, credential.id));
    } else {
      await db.insert(appStoreCredentials).values({
        id: crypto.randomUUID(),
        ...credentialValues,
        createdAt,
      });
    }
  }
}
