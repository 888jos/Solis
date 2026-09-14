/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alerts, campaignCreatorAssignments, campaigns, creatorActivity, creatorAudienceSnapshots, creatorNotes, creators, creatorVideos, dealTerms, payouts, socialAccounts, videoMetricSnapshots } from "@/db/schema";
import { getOrCreateLocalSession } from "@/server/backend/auth";
import { fail, now, ok, readJson } from "@/server/backend/http";
import { calculateVideoPayout, campaignProgress, median, monthlyPayoutDecision, payoutState } from "@/server/backend/creator-payouts";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { action?: string; creatorId?: string };
const day = 86_400_000;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const dateMs = (value: unknown) => value ? new Date(value as string | number | Date).getTime() : 0;

export async function GET(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || session.workspaceId;
    const db = await getDb();
    const [creatorRows, accounts, videos, deals, audience, assignments, campaignRows, payoutRows, activities, notes, alertRows, snapshots] = await Promise.all([
      db.select().from(creators).where(eq(creators.workspaceId, workspaceId)),
      db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, workspaceId)),
      db.select().from(creatorVideos).where(eq(creatorVideos.workspaceId, workspaceId)),
      db.select().from(dealTerms).where(eq(dealTerms.workspaceId, workspaceId)),
      db.select().from(creatorAudienceSnapshots).where(eq(creatorAudienceSnapshots.workspaceId, workspaceId)),
      db.select().from(campaignCreatorAssignments).where(eq(campaignCreatorAssignments.workspaceId, workspaceId)),
      db.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId)),
      db.select().from(payouts).where(eq(payouts.workspaceId, workspaceId)),
      db.select().from(creatorActivity).where(eq(creatorActivity.workspaceId, workspaceId)),
      db.select().from(creatorNotes).where(eq(creatorNotes.workspaceId, workspaceId)),
      db.select().from(alerts).where(eq(alerts.workspaceId, workspaceId)),
      db.select().from(videoMetricSnapshots).where(eq(videoMetricSnapshots.workspaceId, workspaceId)),
    ]);
    const since30d = Date.now() - 30 * day;
    const profiles = creatorRows.map((creator: any) => {
      const creatorAccounts = accounts.filter((account: any) => account.creatorId === creator.id || (!account.creatorId && account.platform === creator.platform && account.handle === creator.handle));
      const accountIds = new Set(creatorAccounts.map((account: any) => account.id));
      const creatorContent = videos.filter((video: any) => video.creatorId === creator.id || accountIds.has(video.socialAccountId));
      const recent = creatorContent.filter((video: any) => dateMs(video.publishedAt || video.createdAt) >= since30d && video.eligibilityStatus !== "excluded");
      const recentViews = recent.map((video: any) => number(video.views));
      const views30d = recentViews.reduce((sum: number, value: number) => sum + value, 0);
      const activeDeal = deals.find((deal: any) => deal.creatorId === creator.id && deal.active) || null;
      const estimate = activeDeal ? recent.reduce((sum: number, video: any) => sum + calculateVideoPayout(activeDeal, number(video.eligibleViews ?? video.views)).finalAmount, 0) : 0;
      const creatorPayouts = payoutRows.filter((row: any) => row.creatorId === creator.id);
      const due = creatorPayouts.filter((row: any) => row.type === "due").reduce((sum: number, row: any) => sum + number(row.finalAmount ?? row.grossAmount), 0);
      const paid = creatorPayouts.filter((row: any) => row.type === "paid").reduce((sum: number, row: any) => sum + number(row.finalAmount ?? row.grossAmount), 0);
      const interactions = recent.reduce((sum: number, video: any) => sum + number(video.likes) + number(video.comments) + number(video.shares) + number(video.favorites), 0);
      const latestAudience = audience.filter((row: any) => row.creatorId === creator.id).sort((a: any, b: any) => dateMs(b.capturedAt) - dateMs(a.capturedAt))[0] || null;
      const lastPostAt = creatorContent.map((video: any) => video.publishedAt).filter(Boolean).sort().at(-1) || null;
      const computedAlerts = [
        !latestAudience && { id: `computed-demographics-${creator.id}`, creatorId: creator.id, type: "missing_demographics", severity: "warning", title: "Missing audience demographics", body: "Add an audience snapshot before approving the next deal." },
        due > 0 && { id: `computed-due-${creator.id}`, creatorId: creator.id, type: "payout_due", severity: "critical", title: "Creator has payout due", body: `${due.toFixed(2)} ${activeDeal?.currency || "USD"} is ready to pay.` },
        lastPostAt && Date.now() - dateMs(lastPostAt) > 10 * day && { id: `computed-inactive-${creator.id}`, creatorId: creator.id, type: "no_recent_post", severity: "warning", title: "No post in 10 days", body: "Review the next action or pause tracking." },
        creatorAccounts.some((account: any) => account.lastSyncedAt && Date.now() - dateMs(account.lastSyncedAt) > 36 * 60 * 60 * 1000) && { id: `computed-sync-${creator.id}`, creatorId: creator.id, type: "stale_sync", severity: "warning", title: "Social account not synced recently", body: "The latest account sync is older than 36 hours." },
      ].filter(Boolean);
      return {
        ...creator, accounts: creatorAccounts, videos: creatorContent, deal: activeDeal, audience: latestAudience,
        assignments: assignments.filter((row: any) => row.creatorId === creator.id).map((row: any) => ({ ...row, progressStatus: campaignProgress(row.targetVideos, row.postedVideos, campaignRows.find((campaign: any) => campaign.id === row.campaignId)?.startsAt, campaignRows.find((campaign: any) => campaign.id === row.campaignId)?.endsAt) })),
        payouts: creatorPayouts, activity: activities.filter((row: any) => row.creatorId === creator.id).sort((a: any, b: any) => dateMs(b.occurredAt) - dateMs(a.occurredAt)), notes: notes.filter((row: any) => row.creatorId === creator.id),
        alerts: [...alertRows.filter((row: any) => row.creatorId === creator.id && !row.resolvedAt), ...computedAlerts],
        snapshots: snapshots.filter((row: any) => creatorContent.some((video: any) => video.id === row.videoId)),
        aggregates: { views30d, videos30d: recent.length, avgViews30d: recent.length ? views30d / recent.length : 0, medianViews30d: median(recentViews), engagement30d: views30d ? interactions / views30d * 100 : 0, lastPostAt, estimatedPayout: estimate, amountDue: due, lifetimePaid: paid, lifetimeViews: creatorContent.reduce((sum: number, video: any) => sum + number(video.views), 0), totalVideos: creatorContent.length },
      };
    });
    return ok({ creators: profiles, campaigns: campaignRows });
  } catch (error) {
    return fail(500, "creator_operations_failed", error instanceof Error ? error.message : "Creator operations could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getOrCreateLocalSession();
    const body = await readJson<Body>(request);
    const creatorId = text(body?.creatorId);
    if (!body?.action || !creatorId) return fail(400, "creator_action_invalid", "action and creatorId are required.");
    const db = await getDb();
    const timestamp = now();
    const base = { id: crypto.randomUUID(), workspaceId: session.workspaceId, creatorId, createdAt: timestamp, updatedAt: timestamp };
    if (body.action === "note") await db.insert(creatorNotes).values({ ...base, body: text(body.body) || "Note", pinned: Boolean(body.pinned) });
    else if (body.action === "activity") {
      await db.insert(creatorActivity).values({ ...base, type: text(body.type) || "note", title: text(body.title) || "Activity", body: text(body.body), occurredAt: timestamp, createdBy: "DriftOS operator" });
      await db.update(creators).set({ lastContactAt: timestamp, updatedAt: timestamp }).where(eq(creators.id, creatorId));
    } else if (body.action === "next_action") await db.update(creators).set({ nextActionText: text(body.nextActionText), nextActionAt: text(body.nextActionAt) ? new Date(String(body.nextActionAt)) : null, updatedAt: timestamp }).where(eq(creators.id, creatorId));
    else if (body.action === "status") await db.update(creators).set({ status: text(body.status) || "Active", updatedAt: timestamp }).where(eq(creators.id, creatorId));
    else if (body.action === "deal") {
      const current = await db.select().from(dealTerms).where(and(eq(dealTerms.creatorId, creatorId), eq(dealTerms.active, true)));
      for (const deal of current) await db.update(dealTerms).set({ active: false, updatedAt: timestamp }).where(eq(dealTerms.id, deal.id));
      await db.insert(dealTerms).values({ ...base, campaignId: text(body.campaignId), type: text(body.type) || "cpm", currency: text(body.currency) || "USD", cpm: number(body.cpm), maxPayoutPerVideo: body.maxPayoutPerVideo == null ? null : number(body.maxPayoutPerVideo), baseFeePerVideo: number(body.baseFeePerVideo), monthlyFixedFee: number(body.monthlyFixedFee), targetVideos: number(body.targetVideos), minimumPayout: number(body.minimumPayout) || 50, eligibilityWindowDays: number(body.eligibilityWindowDays) || 30, payoutFrequency: "monthly", usageRightsMonths: body.usageRightsMonths == null ? null : number(body.usageRightsMonths), organicUsageRights: Boolean(body.organicUsageRights), paidAdsUsageRights: Boolean(body.paidAdsUsageRights), allowedPlatformsJson: JSON.stringify(body.allowedPlatforms || []), requiredHashtag: text(body.requiredHashtag), startDate: text(body.startDate) || new Date().toISOString().slice(0, 10), endDate: text(body.endDate), active: true });
    } else if (body.action === "audience") await db.insert(creatorAudienceSnapshots).values({ ...base, socialAccountId: text(body.socialAccountId), capturedAt: timestamp, followers: number(body.followers), genderMalePct: body.genderMalePct == null ? null : number(body.genderMalePct), genderFemalePct: body.genderFemalePct == null ? null : number(body.genderFemalePct), genderOtherPct: body.genderOtherPct == null ? null : number(body.genderOtherPct), age13_17: number(body.age13_17), age18_24: number(body.age18_24), age25_34: number(body.age25_34), age35_44: number(body.age35_44), age45_54: number(body.age45_54), age55Plus: number(body.age55Plus), topCountriesJson: JSON.stringify(body.topCountries || []), tier1Percentage: body.tier1Percentage == null ? null : number(body.tier1Percentage), dominantLanguage: text(body.dominantLanguage), niche: text(body.niche), audienceNotes: text(body.audienceNotes) });
    else if (body.action === "assignment") {
      const campaignId = text(body.campaignId);
      if (!campaignId) return fail(400, "campaign_required", "campaignId is required.");
      const [existing] = await db.select().from(campaignCreatorAssignments).where(and(eq(campaignCreatorAssignments.creatorId, creatorId), eq(campaignCreatorAssignments.campaignId, campaignId))).limit(1);
      const values = { status: text(body.status) || "confirmed", targetVideos: number(body.targetVideos), postedVideos: number(body.postedVideos), totalViews: number(body.totalViews), estimatedPayout: number(body.estimatedPayout), finalPayout: number(body.finalPayout), progressStatus: "on_track", joinedAt: existing?.joinedAt || timestamp, updatedAt: timestamp };
      if (existing) await db.update(campaignCreatorAssignments).set(values).where(eq(campaignCreatorAssignments.id, existing.id));
      else await db.insert(campaignCreatorAssignments).values({ ...base, ...values, campaignId, dealTermsId: text(body.dealTermsId), completedAt: null });
    }
    else if (body.action === "recalculate_payouts") {
      const [deal] = await db.select().from(dealTerms).where(and(eq(dealTerms.creatorId, creatorId), eq(dealTerms.active, true))).limit(1);
      if (!deal) return ok({ saved: true, payouts: 0 });
      const content = await db.select().from(creatorVideos).where(eq(creatorVideos.creatorId, creatorId));
      let lockedBalance = 0;
      const lockedIds: string[] = [];
      for (const video of content.filter((row: any) => row.eligibilityStatus !== "excluded")) {
        const calculation = calculateVideoPayout(deal, number(video.eligibleViews ?? video.views));
        const state = payoutState(video.trackingWindowEndsAt);
        const [existing] = await db.select().from(payouts).where(and(eq(payouts.videoId, video.id), eq(payouts.dealTermsId, deal.id))).limit(1);
        const values = { type: state, currency: deal.currency, eligibleViews: number(video.eligibleViews ?? video.views), cpmApplied: number(deal.cpm), baseFeeApplied: calculation.baseFee, capApplied: calculation.capApplied, grossAmount: calculation.rawAmount, finalAmount: calculation.finalAmount, eligibilityDate: video.trackingWindowEndsAt ? new Date(video.trackingWindowEndsAt).toISOString().slice(0, 10) : null, payoutCycle: new Date().toISOString().slice(0, 7), updatedAt: timestamp };
        const payoutId = existing?.id || crypto.randomUUID();
        if (existing) await db.update(payouts).set(values).where(eq(payouts.id, existing.id));
        else await db.insert(payouts).values({ ...base, id: payoutId, ...values, videoId: video.id, campaignId: video.campaignId, dealTermsId: deal.id, paymentMethod: null, paidAt: null, transactionReference: null, notes: null });
        if (state === "locked") { lockedBalance += calculation.finalAmount; lockedIds.push(payoutId); }
      }
      if (monthlyPayoutDecision(lockedBalance, number(deal.minimumPayout) || 50) === "due") for (const id of lockedIds) await db.update(payouts).set({ type: "due", updatedAt: timestamp }).where(eq(payouts.id, id));
    }
    else if (body.action === "payout_status") await db.update(payouts).set({ type: text(body.status) || "locked", paidAt: body.status === "paid" ? timestamp : null, transactionReference: text(body.transactionReference), updatedAt: timestamp }).where(and(eq(payouts.id, String(body.payoutId)), eq(payouts.creatorId, creatorId)));
    else return fail(400, "creator_action_unknown", "Unsupported creator action.");
    return ok({ saved: true });
  } catch (error) {
    return fail(500, "creator_action_failed", error instanceof Error ? error.message : "Creator action failed.");
  }
}

export { calculateVideoPayout, monthlyPayoutDecision, payoutState };
