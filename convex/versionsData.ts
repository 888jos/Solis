import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Write side of the versions sync (sources/versions.ts). Replaces one app's App Store versions and
// builds with what App Store Connect returned: rows missing from ASC (deleted drafts) are removed.
const versionRow = v.object({
  versionId: v.string(),
  versionString: v.string(),
  state: v.string(),
  appVersionState: v.optional(v.string()),
  platform: v.optional(v.string()),
  createdDate: v.optional(v.string()),
  releaseType: v.optional(v.string()),
  earliestReleaseDate: v.optional(v.string()),
  buildId: v.optional(v.string()),
  buildNumber: v.optional(v.string()),
  releasedAt: v.optional(v.string()),
  submissions: v.optional(v.array(v.object({ id: v.string(), submittedDate: v.string(), state: v.string() }))),
});

const buildRow = v.object({
  buildId: v.string(),
  version: v.string(),
  marketingVersion: v.optional(v.string()),
  uploadedDate: v.string(),
  processingState: v.string(),
  expired: v.boolean(),
  expirationDate: v.optional(v.string()),
  minOsVersion: v.optional(v.string()),
});

export const replaceApp = internalMutation({
  args: { appSlug: v.string(), versions: v.array(versionRow), builds: v.array(buildRow), fetchedAt: v.number() },
  handler: async (ctx, { appSlug, versions, builds, fetchedAt }) => {
    const existingVersions = await ctx.db.query("appVersions").withIndex("by_app", (q) => q.eq("appSlug", appSlug)).collect();
    const versionIds = new Set(versions.map((row) => row.versionId));
    for (const row of existingVersions) if (!versionIds.has(row.versionId)) await ctx.db.delete(row._id);
    const byVersionId = new Map(existingVersions.map((row) => [row.versionId, row]));
    for (const row of versions) {
      const prev = byVersionId.get(row.versionId);
      // Keep a known release date if the public page stops listing it (it only shows recent history).
      const doc = { appSlug, ...row, releasedAt: row.releasedAt ?? prev?.releasedAt, fetchedAt };
      if (prev) await ctx.db.replace(prev._id, doc);
      else await ctx.db.insert("appVersions", doc);
    }

    const existingBuilds = await ctx.db.query("appBuilds").withIndex("by_app_uploaded", (q) => q.eq("appSlug", appSlug)).collect();
    const buildIds = new Set(builds.map((row) => row.buildId));
    for (const row of existingBuilds) if (!buildIds.has(row.buildId)) await ctx.db.delete(row._id);
    const byBuildId = new Map(existingBuilds.map((row) => [row.buildId, row]));
    for (const row of builds) {
      const prev = byBuildId.get(row.buildId);
      const doc = { appSlug, ...row, fetchedAt };
      if (prev) await ctx.db.replace(prev._id, doc);
      else await ctx.db.insert("appBuilds", doc);
    }
    return { versions: versions.length, builds: builds.length };
  },
});
