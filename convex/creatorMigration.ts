import { internalMutation } from "./_generated/server";

function stableId(prefix: string, input: string) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  return `${prefix}-${Math.abs(hash >>> 0).toString(36)}`;
}

export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("social_accounts").collect();
    let creatorsCreated = 0;
    let accountsLinked = 0;
    let videosLinked = 0;
    let snapshotsCreated = 0;
    for (const account of accounts) {
      let creator = account.creatorId ? await ctx.db.query("creators").withIndex("by_legacy_id", (q) => q.eq("id", account.creatorId)).first() : null;
      if (!creator) creator = await ctx.db.query("creators").withIndex("by_workspace_platform_handle", (q) => q.eq("workspaceId", account.workspaceId).eq("platform", account.platform).eq("handle", account.handle)).first();
      if (!creator) {
        const id = stableId("creator", `${account.workspaceId}:${account.platform}:${account.handle}`);
        await ctx.db.insert("creators", { id, workspaceId: account.workspaceId, name: account.creatorName || String(account.handle).replace(/^@/, ""), handle: account.handle, platform: account.platform, email: account.email || null, primaryAppId: account.appId, status: "Active", createdAt: account.createdAt || Date.now(), updatedAt: Date.now() });
        creator = await ctx.db.query("creators").withIndex("by_legacy_id", (q) => q.eq("id", id)).first();
        creatorsCreated += 1;
      }
      if (!creator) continue;
      const validStatuses = new Set(["Lead", "Negotiating", "Agreed", "Active", "Paused", "Ended"]);
      const normalizedStatus = validStatuses.has(String(creator.status))
        ? creator.status
        : String(creator.status).toLowerCase() === "prospect" || String(creator.status).toLowerCase() === "source_limited"
          ? "Lead"
          : "Active";
      if (creator.status !== normalizedStatus || (!creator.primaryAppId && account.appId)) {
        await ctx.db.patch(creator._id, { status: normalizedStatus, primaryAppId: creator.primaryAppId || account.appId, updatedAt: Date.now() });
      }
      if (account.creatorId !== creator.id || account.active === undefined || !account.trackedSince) {
        await ctx.db.patch(account._id, { creatorId: creator.id, active: account.active !== false, trackedSince: account.trackedSince || account.createdAt || Date.now(), updatedAt: Date.now() });
        accountsLinked += 1;
      }
      const videos = await ctx.db.query("creator_videos").withIndex("by_social_account", (q) => q.eq("socialAccountId", account.id)).collect();
      for (const video of videos) {
        const externalVideoId = video.externalVideoId || String(video.url || "").match(/\/video\/(\d+)/)?.[1] || video.id;
        const published = video.publishedAt ? Date.parse(video.publishedAt) : NaN;
        const trackingWindowEndsAt = Number.isFinite(published) ? published + 30 * 86_400_000 : null;
        await ctx.db.patch(video._id, { creatorId: creator.id, externalVideoId, eligibilityStatus: video.eligibilityStatus || "tracking", winner: video.winner || false, trackingWindowEndsAt: video.trackingWindowEndsAt || trackingWindowEndsAt, engagementRate: video.views ? ((Number(video.likes || 0) + Number(video.comments || 0) + Number(video.shares || 0) + Number(video.favorites || 0)) / Number(video.views)) * 100 : 0, updatedAt: Date.now() });
        videosLinked += 1;
        const snapshot = await ctx.db.query("video_metric_snapshots").withIndex("by_video", (q) => q.eq("videoId", video.id)).first();
        if (!snapshot) {
          await ctx.db.insert("video_metric_snapshots", { id: stableId("snapshot", `${video.id}:initial`), workspaceId: video.workspaceId, videoId: video.id, capturedAt: video.updatedAt || video.createdAt || Date.now(), views: Number(video.views || 0), likes: Number(video.likes || 0), comments: Number(video.comments || 0), shares: Number(video.shares || 0), favorites: Number(video.favorites || 0), createdAt: Date.now(), updatedAt: Date.now() });
          snapshotsCreated += 1;
        }
      }
    }
    return { accounts: accounts.length, creatorsCreated, accountsLinked, videosLinked, snapshotsCreated };
  },
});
