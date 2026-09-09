import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { creatorVideos, creators, socialAccounts } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";

type RouteContext = { params: Promise<{ id: string }> };

type SocialAccountPatch = {
  creatorName?: string;
  cpmRate?: number;
  dealCurrency?: string;
  dealType?: string;
  email?: string;
  fixedFee?: number;
  trackingHashtags?: string;
  trackingKeywords?: string;
  trackingMatch?: string;
};

function videoMatchesRules(title: string, hashtags: string, keywords: string, match: string) {
  const normalizedTitle = title.toLowerCase();
  const conditions = [
    ...hashtags.split(",").map((value) => value.trim().replace(/^#+/, "")).filter(Boolean).map((tag) => normalizedTitle.includes(`#${tag.toLowerCase()}`) || new RegExp(`(^|\\s)${tag.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}($|\\s)`, "i").test(title)),
    ...keywords.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).map((keyword) => normalizedTitle.includes(keyword)),
  ];
  if (!conditions.length) return true;
  return match === "all" ? conditions.every(Boolean) : conditions.some(Boolean);
}

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getOrCreateLocalSession();
    const { id } = await context.params;
    const body = await readJson<SocialAccountPatch>(request);
    const db = await getDb();
    await db.update(socialAccounts).set({
      creatorName: body?.creatorName?.trim() || null,
      cpmRate: Number.isFinite(Number(body?.cpmRate)) ? Math.max(0, Number(body?.cpmRate)) : 0,
      dealCurrency: body?.dealCurrency?.trim().toUpperCase() || "USD",
      dealType: ["cpm", "fixed", "hybrid"].includes(body?.dealType || "") ? body!.dealType! : "none",
      email: body?.email?.trim() || null,
      fixedFee: Number.isFinite(Number(body?.fixedFee)) ? Math.max(0, Number(body?.fixedFee)) : 0,
      trackingHashtags: body?.trackingHashtags?.trim().toLowerCase() || "",
      trackingKeywords: body?.trackingKeywords?.trim().toLowerCase() || "",
      trackingMatch: body?.trackingMatch === "all" ? "all" : "any",
      updatedAt: now(),
    }).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId)));
    const currentVideos = await db.select({ id: creatorVideos.id, title: creatorVideos.title }).from(creatorVideos).where(and(eq(creatorVideos.socialAccountId, id), eq(creatorVideos.workspaceId, session.workspaceId)));
    for (const video of currentVideos) {
      if (!videoMatchesRules(video.title || "", body?.trackingHashtags?.trim() || "", body?.trackingKeywords?.trim() || "", body?.trackingMatch === "all" ? "all" : "any")) {
        await db.delete(creatorVideos).where(eq(creatorVideos.id, video.id));
      }
    }
    const [socialAccount] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId))).limit(1);
    if (!socialAccount) return fail(404, "social_account_not_found", "Creator was not found.");
    return ok({ socialAccount });
  } catch (error) {
    return fail(500, "social_account_update_failed", error instanceof Error ? error.message : "Creator could not be updated.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await getOrCreateLocalSession();
    const { id } = await context.params;
    const db = await getDb();
    const [account] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId))).limit(1);
    if (!account) return fail(404, "social_account_not_found", "Creator was not found.");
    await db.delete(creatorVideos).where(and(eq(creatorVideos.socialAccountId, id), eq(creatorVideos.workspaceId, session.workspaceId)));
    await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId)));
    await db.delete(creators).where(and(eq(creators.workspaceId, session.workspaceId), eq(creators.platform, account.platform), eq(creators.handle, account.handle)));
    return ok({ id });
  } catch (error) {
    return fail(500, "social_account_delete_failed", error instanceof Error ? error.message : "Creator could not be deleted.");
  }
}
