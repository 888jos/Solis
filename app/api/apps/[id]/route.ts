import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getOrCreateLocalSession();
    const db = await getDb();
    const [app] = await db
      .select()
      .from(apps)
      .where(and(eq(apps.id, id), eq(apps.workspaceId, session.workspaceId), isNull(apps.deletedAt)))
      .limit(1);

    if (!app) return fail(404, "app_not_found", "App was not found.");
    return ok({ app });
  } catch (error) {
    return fail(500, "app_read_failed", error instanceof Error ? error.message : "App could not be loaded.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getOrCreateLocalSession();
    const deletedAt = now();
    const db = await getDb();
    await db.update(apps).set({ deletedAt, updatedAt: deletedAt, status: "deleted" }).where(and(eq(apps.id, id), eq(apps.workspaceId, session.workspaceId)));
    return ok({ id, deletedAt: deletedAt.toISOString() });
  } catch (error) {
    return fail(500, "app_delete_failed", error instanceof Error ? error.message : "App could not be deleted.");
  }
}
