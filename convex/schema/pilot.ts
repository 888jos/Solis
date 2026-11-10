import { defineTable } from "convex/server";
import { v } from "convex/values";

// Pilotage: what Jos aims for (goals), what he tries (experiments) and what happened (annotations).
// Values are never stored here: progress and results are computed from the real data at read time.
export const pilotTables = {
  goals: defineTable({
    project: v.string(), // "studio" | app slug | "otto"
    metric: v.string(), // key of METRICS in convex/pilot.ts
    month: v.string(), // YYYY-MM
    target: v.number(),
    createdAt: v.number(),
  }).index("by_month", ["month"]),

  experiments: defineTable({
    project: v.string(),
    title: v.string(),
    hypothesis: v.string(),
    metric: v.string(),
    startDay: v.string(), // YYYY-MM-DD
    endDay: v.string(), // planned end, included
    status: v.union(v.literal("running"), v.literal("done")),
    decision: v.optional(v.union(v.literal("keep"), v.literal("drop"), v.literal("inconclusive"))),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_start", ["startDay"]),

  annotations: defineTable({
    day: v.string(),
    project: v.string(), // "studio" or a project slug
    kind: v.union(v.literal("price"), v.literal("campaign"), v.literal("content"), v.literal("product"), v.literal("other")),
    label: v.string(),
    createdAt: v.number(),
  }).index("by_day", ["day"]),
};
