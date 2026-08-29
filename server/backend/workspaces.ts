import { eq } from "drizzle-orm";
import { workspaces } from "@/db/schema";
import { now } from "@/server/backend/http";

type DbClient = {
  insert: (table: typeof workspaces) => {
    values: (row: typeof workspaces.$inferInsert) => Promise<unknown>;
  };
  select: () => {
    from: (table: typeof workspaces) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Array<typeof workspaces.$inferSelect>>;
      };
    };
  };
};

function workspaceNameFromId(workspaceId: string) {
  return workspaceId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Drift Studio";
}

export async function ensureWorkspace(db: DbClient, workspaceId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (existing) return existing;

  const createdAt = now();
  const row = {
    id: workspaceId,
    name: workspaceNameFromId(workspaceId),
    slug: workspaceId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    ownerEmail: null,
    createdAt,
    updatedAt: createdAt,
  };

  await db.insert(workspaces).values(row);
  return row;
}
