import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { creatorVideos } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;
    const appId = searchParams.get("appId");
    const socialAccountId = searchParams.get("socialAccountId");
    const db = await getDb();
    const conditions = [
      eq(creatorVideos.workspaceId, workspaceId),
      appId ? eq(creatorVideos.appId, appId) : undefined,
      socialAccountId ? eq(creatorVideos.socialAccountId, socialAccountId) : undefined,
    ].filter(Boolean);
    const rows = await db
      .select()
      .from(creatorVideos)
      .where(and(...conditions))
      .orderBy(desc(creatorVideos.createdAt));

    return ok({ videos: rows });
  } catch (error) {
    return fail(503, "creator_videos_list_failed", error instanceof Error ? error.message : "Creator videos could not be loaded.");
  }
}
