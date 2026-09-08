import { getDb } from "@/db";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { DEFAULT_WORKSPACE_ID, ensureDefaultApps } from "@/server/backend/default-apps";
import { ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  await ensureDefaultApps(db, DEFAULT_WORKSPACE_ID);
  const session = await getOrCreateLocalSession();
  return ok({
    session,
  });
}
