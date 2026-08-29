import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, normalizeHandle, now, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

type SocialAccountBody = {
  appId?: string;
  handle?: string;
  platform?: string;
  source?: string;
  trackingMode?: string;
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
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.workspaceId, workspaceId))
      .orderBy(desc(socialAccounts.createdAt));

    return ok({ socialAccounts: rows });
  } catch (error) {
    return fail(503, "social_accounts_list_failed", error instanceof Error ? error.message : "Social accounts could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<SocialAccountBody>(request);
    const session = await getOrCreateLocalSession();
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const appId = body?.appId?.trim();
    const rawHandle = body?.handle?.trim();
    const platform = body?.platform?.trim().toLowerCase() || "tiktok";

    if (!appId) return fail(400, "app_required", "appId is required.");
    if (!rawHandle) return fail(400, "handle_required", "Handle is required.");

    const handle = normalizeHandle(rawHandle);
    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    const [existing] = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.platform, platform), eq(socialAccounts.handle, handle)))
      .limit(1);

    if (existing) return ok({ socialAccount: existing, duplicate: true });

    const createdAt = now();
    const row = {
      id: crypto.randomUUID(),
      workspaceId,
      appId,
      platform,
      handle,
      trackingMode: body?.trackingMode?.trim() || "public_handle",
      source: body?.source?.trim() || null,
      status: "pending",
      lastSyncedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    await db.insert(socialAccounts).values(row);
    const [socialAccount] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, row.id)).limit(1);
    return ok({ socialAccount, duplicate: false }, { status: 201 });
  } catch (error) {
    return fail(500, "social_account_create_failed", error instanceof Error ? error.message : "Social account could not be created.");
  }
}
