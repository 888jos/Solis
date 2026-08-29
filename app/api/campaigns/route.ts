import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

type CampaignBody = {
  appId?: string;
  budget?: number;
  channel?: string;
  currency?: string;
  endsAt?: string;
  goal?: string;
  id?: string;
  name?: string;
  notes?: string;
  startsAt?: string;
  status?: string;
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
    const where = appId ? and(eq(campaigns.workspaceId, workspaceId), eq(campaigns.appId, appId)) : eq(campaigns.workspaceId, workspaceId);
    const rows = await db.select().from(campaigns).where(where).orderBy(desc(campaigns.createdAt));
    return ok({ campaigns: rows });
  } catch (error) {
    return fail(503, "campaigns_list_failed", error instanceof Error ? error.message : "Campaigns could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const body = await readJson<CampaignBody>(request);
    const workspaceId = body?.workspaceId?.trim() || session.workspaceId;
    const name = body?.name?.trim();
    if (!name) return fail(400, "campaign_name_required", "Campaign name is required.");

    const timestamp = now();
    const row = {
      id: body?.id?.trim() || crypto.randomUUID(),
      appId: body?.appId?.trim() || null,
      budget: Number.isFinite(Number(body?.budget)) ? Number(body?.budget) : 0,
      channel: body?.channel?.trim() || "creator",
      createdAt: timestamp,
      currency: body?.currency?.trim().toUpperCase() || "USD",
      endsAt: body?.endsAt?.trim() || null,
      goal: body?.goal?.trim() || "Downloads",
      name,
      notes: body?.notes?.trim() || null,
      startsAt: body?.startsAt?.trim() || null,
      status: body?.status?.trim() || "planned",
      updatedAt: timestamp,
      workspaceId,
    };
    const db = await getDb();
    await ensureWorkspace(db, workspaceId);
    await db.insert(campaigns).values(row);
    return ok({ campaign: row }, { status: 201 });
  } catch (error) {
    return fail(500, "campaign_create_failed", error instanceof Error ? error.message : "Campaign could not be created.");
  }
}
