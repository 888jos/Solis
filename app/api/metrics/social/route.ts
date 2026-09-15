import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { dailySocialMetrics } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const searchParams = new URL(request.url).searchParams;
    const end = searchParams.get("end");
    const conditions = [
      eq(dailySocialMetrics.workspaceId, session.workspaceId),
      end ? lte(dailySocialMetrics.date, end) : undefined,
    ].filter(Boolean);
    const db = await getDb();
    const rows = await db.select().from(dailySocialMetrics).where(and(...conditions)).orderBy(asc(dailySocialMetrics.date));
    return ok({ metrics: rows });
  } catch (error) {
    return fail(503, "social_metrics_failed", error instanceof Error ? error.message : "Social metrics could not be loaded.");
  }
}
