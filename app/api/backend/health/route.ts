import { getDb } from "@/db";
import { sessions, users, workspaces, workspaceMemberships } from "@/db/schema";
import { fail, ok } from "@/server/backend/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    await db.select({ id: users.id }).from(users).limit(1);
    await db.select({ id: sessions.id }).from(sessions).limit(1);
    await db.select({ id: workspaceMemberships.id }).from(workspaceMemberships).limit(1);
    return ok({ auth: "ready", database: "ready" });
  } catch (error) {
    return fail(503, "database_unavailable", error instanceof Error ? error.message : "Database is unavailable.");
  }
}
