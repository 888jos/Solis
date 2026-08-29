import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { appStoreCredentials, apps } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

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
        privateKeySecretRef: credential?.privateKeySecretRef ?? null,
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

    if (body?.credentialPreset || body?.keyId || body?.issuerId || body?.privateKeySecretRef || body?.vendorNumber) {
      const [existingCredential] = await db.select().from(appStoreCredentials).where(eq(appStoreCredentials.appId, appId)).limit(1);
      const credentialValues = {
        id: crypto.randomUUID(),
        workspaceId,
        appId,
        credentialPreset: body.credentialPreset?.trim() || null,
        keyId: body.keyId?.trim() || null,
        issuerId: body.issuerId?.trim() || null,
        privateKeySecretRef: body.privateKeySecretRef?.trim() || null,
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
    return ok({ app }, { status: 201 });
  } catch (error) {
    return fail(500, "app_create_failed", error instanceof Error ? error.message : "App could not be created.");
  }
}
