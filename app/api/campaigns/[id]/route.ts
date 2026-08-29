import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await getOrCreateLocalSession();
    const { id } = await context.params;
    const timestamp = now();
    const db = await getDb();
    await db.update(campaigns).set({ status: "deleted", updatedAt: timestamp }).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, session.workspaceId)));
    return ok({ id });
  } catch (error) {
    return fail(500, "campaign_delete_failed", error instanceof Error ? error.message : "Campaign could not be deleted.");
  }
}
