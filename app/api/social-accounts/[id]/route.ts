import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alerts, campaignCreatorAssignments, creatorActivity, creatorAudienceSnapshots, creatorNotes, creatorVideos, creators, dailySocialMetrics, dealTerms, payouts, socialAccounts, videoMetricSnapshots } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";

type RouteContext = { params: Promise<{ id: string }> };

type SocialAccountPatch = {
  active?: boolean;
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
    if (!body) return fail(400, "social_account_patch_invalid", "A JSON update body is required.");
    const db = await getDb();
    const [existing] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId))).limit(1);
    if (!existing) return fail(404, "social_account_not_found", "Creator was not found.");
    const values: Partial<typeof socialAccounts.$inferInsert> = { updatedAt: now() };
    if (body.active !== undefined) values.active = body.active;
    if (body.creatorName !== undefined) values.creatorName = body.creatorName.trim() || null;
    if (body.cpmRate !== undefined) values.cpmRate = Number.isFinite(Number(body.cpmRate)) ? Math.max(0, Number(body.cpmRate)) : existing.cpmRate;
    if (body.dealCurrency !== undefined) values.dealCurrency = body.dealCurrency.trim().toUpperCase() || existing.dealCurrency;
    if (body.dealType !== undefined && ["cpm", "fixed", "hybrid", "none"].includes(body.dealType)) values.dealType = body.dealType;
    if (body.email !== undefined) values.email = body.email.trim() || null;
    if (body.fixedFee !== undefined) values.fixedFee = Number.isFinite(Number(body.fixedFee)) ? Math.max(0, Number(body.fixedFee)) : existing.fixedFee;
    if (body.trackingHashtags !== undefined) values.trackingHashtags = body.trackingHashtags.trim().toLowerCase();
    if (body.trackingKeywords !== undefined) values.trackingKeywords = body.trackingKeywords.trim().toLowerCase();
    if (body.trackingMatch !== undefined) values.trackingMatch = body.trackingMatch === "all" ? "all" : "any";
    await db.update(socialAccounts).set(values).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId)));
    const rulesChanged = body.trackingHashtags !== undefined || body.trackingKeywords !== undefined || body.trackingMatch !== undefined;
    if (rulesChanged) {
      const hashtags = body.trackingHashtags !== undefined ? body.trackingHashtags.trim() : existing.trackingHashtags;
      const keywords = body.trackingKeywords !== undefined ? body.trackingKeywords.trim() : existing.trackingKeywords;
      const match = body.trackingMatch !== undefined ? (body.trackingMatch === "all" ? "all" : "any") : existing.trackingMatch;
      const currentVideos = await db.select({ id: creatorVideos.id, title: creatorVideos.title }).from(creatorVideos).where(and(eq(creatorVideos.socialAccountId, id), eq(creatorVideos.workspaceId, session.workspaceId)));
      for (const video of currentVideos) {
        const eligible = videoMatchesRules(video.title || "", hashtags, keywords, match);
        await db.update(creatorVideos).set({ eligibilityStatus: eligible ? "tracking" : "excluded", updatedAt: now() }).where(and(eq(creatorVideos.id, video.id), eq(creatorVideos.workspaceId, session.workspaceId)));
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
    const accountVideos = await db.select({ id: creatorVideos.id }).from(creatorVideos).where(and(eq(creatorVideos.socialAccountId, id), eq(creatorVideos.workspaceId, session.workspaceId)));
    for (const video of accountVideos) await db.delete(videoMetricSnapshots).where(and(eq(videoMetricSnapshots.videoId, video.id), eq(videoMetricSnapshots.workspaceId, session.workspaceId)));
    await db.delete(dailySocialMetrics).where(and(eq(dailySocialMetrics.socialAccountId, id), eq(dailySocialMetrics.workspaceId, session.workspaceId)));
    await db.delete(creatorVideos).where(and(eq(creatorVideos.socialAccountId, id), eq(creatorVideos.workspaceId, session.workspaceId)));
    await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, session.workspaceId)));
    if (account.creatorId) {
      const [remainingAccount] = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(and(eq(socialAccounts.creatorId, account.creatorId), eq(socialAccounts.workspaceId, session.workspaceId))).limit(1);
      if (!remainingAccount) {
        await db.delete(payouts).where(and(eq(payouts.creatorId, account.creatorId), eq(payouts.workspaceId, session.workspaceId)));
        await db.delete(campaignCreatorAssignments).where(and(eq(campaignCreatorAssignments.creatorId, account.creatorId), eq(campaignCreatorAssignments.workspaceId, session.workspaceId)));
        await db.delete(dealTerms).where(and(eq(dealTerms.creatorId, account.creatorId), eq(dealTerms.workspaceId, session.workspaceId)));
        await db.delete(creatorAudienceSnapshots).where(and(eq(creatorAudienceSnapshots.creatorId, account.creatorId), eq(creatorAudienceSnapshots.workspaceId, session.workspaceId)));
        await db.delete(creatorActivity).where(and(eq(creatorActivity.creatorId, account.creatorId), eq(creatorActivity.workspaceId, session.workspaceId)));
        await db.delete(creatorNotes).where(and(eq(creatorNotes.creatorId, account.creatorId), eq(creatorNotes.workspaceId, session.workspaceId)));
        await db.delete(alerts).where(and(eq(alerts.creatorId, account.creatorId), eq(alerts.workspaceId, session.workspaceId)));
        await db.delete(creators).where(and(eq(creators.id, account.creatorId), eq(creators.workspaceId, session.workspaceId)));
      }
    } else {
      await db.delete(creators).where(and(eq(creators.workspaceId, session.workspaceId), eq(creators.platform, account.platform), eq(creators.handle, account.handle)));
    }
    return ok({ id });
  } catch (error) {
    return fail(500, "social_account_delete_failed", error instanceof Error ? error.message : "Creator could not be deleted.");
  }
}
