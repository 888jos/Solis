import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Write side of the engagement sync (convex/sources/engagement.ts). Upserts keyed by app + day.
const dailyRow = v.object({
  date: v.string(),
  activeUsers: v.number(),
  newUsers: v.number(),
  sessions: v.optional(v.number()),
  activeUsers30d: v.optional(v.number()),
});

const cohortRow = v.object({
  cohortStart: v.string(),
  cohortSize: v.number(),
  d1Users: v.optional(v.number()),
  d7Users: v.optional(v.number()),
  d30Users: v.optional(v.number()),
});

export const upsertDaily = internalMutation({
  args: { appSlug: v.string(), source: v.string(), rows: v.array(dailyRow) },
  handler: async (ctx, { appSlug, source, rows }) => {
    const fetchedAt = Date.now();
    let written = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("engagementDaily")
        .withIndex("by_app_date", (q) => q.eq("appSlug", appSlug).eq("date", row.date))
        .unique();
      const doc = { appSlug, source, ...row, fetchedAt };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("engagementDaily", doc);
      written++;
    }
    return written;
  },
});

export const upsertCohorts = internalMutation({
  args: { appSlug: v.string(), source: v.string(), rows: v.array(cohortRow) },
  handler: async (ctx, { appSlug, source, rows }) => {
    const fetchedAt = Date.now();
    const share = (users: number | undefined, size: number) => (users == null || size === 0 ? undefined : users / size);
    let written = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("retentionCohorts")
        .withIndex("by_app_cohort", (q) => q.eq("appSlug", appSlug).eq("cohortStart", row.cohortStart))
        .unique();
      const doc = {
        appSlug,
        source,
        ...row,
        d1: share(row.d1Users, row.cohortSize),
        d7: share(row.d7Users, row.cohortSize),
        d30: share(row.d30Users, row.cohortSize),
        fetchedAt,
      };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("retentionCohorts", doc);
      written++;
    }
    return written;
  },
});
