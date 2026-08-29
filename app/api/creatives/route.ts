import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { creatives } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

type CreativeBody = {
  appId?: string;
  campaignId?: string;
  clicks?: number;
  comments?: number;
  favorites?: number;
  format?: string;
  hook?: string;
  id?: string;
  impressions?: number;
  installs?: number;
  likes?: number;
  name?: string;
  revenue?: number;
  shares?: number;
  socialAccountId?: string;
  spend?: number;
  status?: string;
  url?: string;
  workspaceId?: string;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") || session.workspaceId;
    const appId = searchParams.get("appId");
    const db = await getDb();
    const where = appId ? and(eq(creatives.workspaceId, workspaceId), eq(creatives.appId, appId)) : eq(creatives.workspaceId, workspaceId);
    const rows = await db.select().from(creatives).where(where).orderBy(desc(creatives.createdAt));
    return ok({ creatives: rows.filter((row) => row.status !== "deleted") });
  } catch (error) {
    return fail(503, "creatives_list_failed", error instanceof Error ? error.message : "Creatives could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const body = await readJson<CreativeBody>(request);
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const name = body?.name?.trim();
    if (!name) return fail(400, "creative_name_required", "Creative name is required.");

    const timestamp = now();
    const row = {
      id: body?.id?.trim() || crypto.randomUUID(),
      appId: body?.appId?.trim() || null,
      campaignId: body?.campaignId?.trim() || null,
      clicks: Number.isFinite(Number(body?.clicks)) ? Number(body?.clicks) : 0,
      comments: Number.isFinite(Number(body?.comments)) ? Number(body?.comments) : 0,
      createdAt: timestamp,
      favorites: Number.isFinite(Number(body?.favorites)) ? Number(body?.favorites) : 0,
      format: body?.format?.trim() || "video",
      hook: body?.hook?.trim() || null,
      impressions: Number.isFinite(Number(body?.impressions)) ? Number(body?.impressions) : 0,
      installs: Number.isFinite(Number(body?.installs)) ? Number(body?.installs) : 0,
      likes: Number.isFinite(Number(body?.likes)) ? Number(body?.likes) : 0,
      name,
      revenue: Number.isFinite(Number(body?.revenue)) ? Number(body?.revenue) : 0,
      shares: Number.isFinite(Number(body?.shares)) ? Number(body?.shares) : 0,
      socialAccountId: body?.socialAccountId?.trim() || null,
      spend: Number.isFinite(Number(body?.spend)) ? Number(body?.spend) : 0,
      status: body?.status?.trim() || "draft",
      updatedAt: timestamp,
      url: body?.url?.trim() || null,
      workspaceId,
    };
    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    await db.insert(creatives).values(row);
    return ok({ creative: row }, { status: 201 });
  } catch (error) {
    return fail(500, "creative_create_failed", error instanceof Error ? error.message : "Creative could not be created.");
  }
}
