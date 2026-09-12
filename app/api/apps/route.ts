import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { appStoreCredentials, apps } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { ensureDefaultApps } from "@/server/backend/default-apps";
import { fail, now, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";
import { encryptAppPrivateKey, isEncryptedAppKey } from "@/server/backend/app-credentials";

type AppBody = {
  appStoreId?: string;
  artworkUrl?: string;
  bundleId?: string;
  credentialPreset?: string;
  developerName?: string;
  displayName?: string;
  keyId?: string;
  name?: string;
  platform?: string;
  primaryCurrency?: string;
  privateKeySecretRef?: string;
  privateKey?: string;
  sku?: string;
  vendorNumber?: string;
  workspaceId?: string;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await getOrCreateLocalSession();
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;

    const db = await getDb();
    await ensureDefaultApps(db, workspaceId);
    const rows = await db
      .select({
        app: apps,
        credential: appStoreCredentials,
      })
      .from(apps)
      .leftJoin(appStoreCredentials, eq(appStoreCredentials.appId, apps.id))
      .where(and(eq(apps.workspaceId, workspaceId), isNull(apps.deletedAt)))
      .orderBy(desc(apps.createdAt));

    return ok({
      apps: rows.map(({ app, credential }) => ({
        ...app,
        credentialPreset: credential?.credentialPreset ?? null,
        keyId: credential?.keyId ?? null,
        issuerId: credential?.issuerId ?? null,
        hasPrivateKey: Boolean(credential?.privateKeySecretRef),
        privateKeySecretRef: isEncryptedAppKey(credential?.privateKeySecretRef) ? null : credential?.privateKeySecretRef ?? null,
        vendorNumber: credential?.vendorNumber ?? null,
      })),
    });
  } catch (error) {
    return fail(503, "apps_list_failed", error instanceof Error ? error.message : "Apps could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<AppBody>(request);
    const session = await getOrCreateLocalSession();
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const name = body?.name?.trim();
    if (!name) return fail(400, "app_name_required", "App name is required.");
    if ((body?.privateKey?.length ?? 0) > 64_000) return fail(413, "private_key_too_large", "The .p8 key file is too large.");
    let encryptedPrivateKey: string | null = null;
    if (body?.privateKey?.trim()) {
      try {
        encryptedPrivateKey = await encryptAppPrivateKey(body.privateKey);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not configured")) {
          return fail(503, "credential_storage_unavailable", error.message);
        }
        return fail(400, "invalid_private_key", error instanceof Error ? error.message : "The .p8 key could not be validated.");
      }
    }

    const createdAt = now();
    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    const existingConditions = [
      eq(apps.workspaceId, workspaceId),
      body?.appStoreId?.trim() ? eq(apps.appStoreId, body.appStoreId.trim()) : undefined,
    ].filter(Boolean);
    const [existingApp] = existingConditions.length > 1
      ? await db.select().from(apps).where(and(...existingConditions)).limit(1)
      : [];
    const appId = existingApp?.id ?? crypto.randomUUID();

    const appValues = {
      id: appId,
      workspaceId,
      name,
      displayName: body?.displayName?.trim() || name,
      platform: body?.platform?.trim().toLowerCase() || "ios",
      bundleId: body?.bundleId?.trim() || null,
      appStoreId: body?.appStoreId?.trim() || null,
      sku: body?.sku?.trim() || null,
      developerName: body?.developerName?.trim() || null,
      artworkUrl: body?.artworkUrl?.trim() || null,
      primaryCurrency: body?.primaryCurrency?.trim().toUpperCase() || "USD",
      status: "active",
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    if (existingApp) {
      await db.update(apps).set({ ...appValues, id: existingApp.id, workspaceId, createdAt: existingApp.createdAt, updatedAt: createdAt }).where(eq(apps.id, existingApp.id));
    } else {
      await db.insert(apps).values(appValues);
    }

    if (body?.credentialPreset || body?.keyId || body?.issuerId || body?.privateKeySecretRef || encryptedPrivateKey || body?.vendorNumber) {
      const [existingCredential] = await db.select().from(appStoreCredentials).where(eq(appStoreCredentials.appId, appId)).limit(1);
      const credentialValues = {
        id: crypto.randomUUID(),
        workspaceId,
        appId,
        credentialPreset: body.credentialPreset?.trim() || null,
        keyId: body.keyId?.trim() || null,
        issuerId: body.issuerId?.trim() || null,
        privateKeySecretRef: encryptedPrivateKey || body.privateKeySecretRef?.trim() || existingCredential?.privateKeySecretRef || null,
        vendorNumber: body.vendorNumber?.trim() || null,
        status: body.credentialPreset ? "server_preset" : "pending",
        lastValidatedAt: null,
        createdAt,
        updatedAt: createdAt,
      };
      if (existingCredential) {
        await db.update(appStoreCredentials).set({ ...credentialValues, id: existingCredential.id, createdAt: existingCredential.createdAt, updatedAt: createdAt }).where(eq(appStoreCredentials.id, existingCredential.id));
      } else {
        await db.insert(appStoreCredentials).values(credentialValues);
      }
    }

    const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
    const [savedCredential] = await db.select().from(appStoreCredentials).where(eq(appStoreCredentials.appId, appId)).limit(1);
    return ok({ app: {
      ...app,
      credentialPreset: savedCredential?.credentialPreset ?? null,
      hasPrivateKey: Boolean(savedCredential?.privateKeySecretRef),
      keyId: savedCredential?.keyId ?? null,
      issuerId: savedCredential?.issuerId ?? null,
      privateKeySecretRef: isEncryptedAppKey(savedCredential?.privateKeySecretRef) ? null : savedCredential?.privateKeySecretRef ?? null,
      vendorNumber: savedCredential?.vendorNumber ?? null,
    } }, { status: 201 });
  } catch (error) {
    return fail(500, "app_create_failed", error instanceof Error ? error.message : "App could not be created.");
  }
}
