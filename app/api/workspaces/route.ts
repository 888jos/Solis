import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import { fail, now, ok, readJson } from "@/server/backend/http";

type WorkspaceBody = {
  name?: string;
  ownerEmail?: string;
  slug?: string;
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
    return ok({ workspaces: rows });
  } catch (error) {
    return fail(503, "database_unavailable", error instanceof Error ? error.message : "Database is unavailable.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<WorkspaceBody>(request);
    const name = body?.name?.trim();
    if (!name) return fail(400, "workspace_name_required", "Workspace name is required.");

    const createdAt = now();
    const slug = (body?.slug ?? name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const row = {
      id: crypto.randomUUID(),
      name,
      slug,
      ownerEmail: body?.ownerEmail?.trim() || null,
      createdAt,
      updatedAt: createdAt,
    };

    const db = await getDb();
    await db.insert(workspaces).values(row);
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, row.id)).limit(1);
    return ok({ workspace }, { status: 201 });
  } catch (error) {
    return fail(500, "workspace_create_failed", error instanceof Error ? error.message : "Workspace could not be created.");
  }
}
