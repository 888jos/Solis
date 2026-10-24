import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authQuery } from "./lib/auth";

// Every sync action calls start → finish so the Sources page can show freshness and errors.
export const start = internalMutation({
  args: { source: v.string() },
  handler: (ctx, { source }) => ctx.db.insert("syncRuns", { source, status: "running", startedAt: Date.now() }),
});

export const finish = internalMutation({
  args: {
    runId: v.id("syncRuns"),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("skipped")),
    rows: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: (ctx, { runId, ...patch }) => ctx.db.patch(runId, { ...patch, finishedAt: Date.now() }),
});

export const latestBySource = authQuery({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("syncRuns").order("desc").take(500);
    const latest = new Map<string, (typeof runs)[number]>();
    const lastOk = new Map<string, number>();
    for (const run of runs) {
      if (!latest.has(run.source)) latest.set(run.source, run);
      if (run.status === "ok" && !lastOk.has(run.source)) lastOk.set(run.source, run.finishedAt ?? run.startedAt);
    }
    return [...latest.values()].map((run) => ({ ...run, lastOkAt: lastOk.get(run.source) ?? null }));
  },
});
