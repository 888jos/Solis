import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { APPS } from "./lib/apps";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";

// Engagement model: aggregates engagementDaily / retentionCohorts for the Engagement page.
// Days before an app's first tracked active user are treated as "not tracked" (null), never as zero.

const SOURCES: Record<string, { source: string; label: string } | undefined> = {
  cortifree: { source: "amplitude", label: "Amplitude" },
  questirl: { source: "posthog", label: "PostHog" },
};

function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

function bucketOf(day: string, bucket: "day" | "week" | "month"): string {
  return bucket === "day" ? day : bucket === "week" ? weekStart(day) : day.slice(0, 7);
}

async function dailyRows(ctx: QueryCtx, slug: string, from: string, to: string) {
  return ctx.db
    .query("engagementDaily")
    .withIndex("by_app_date", (q) => q.eq("appSlug", slug).gte("date", from).lte("date", to))
    .collect();
}

async function cohortRows(ctx: QueryCtx, slug: string, from: string, to: string) {
  return ctx.db
    .query("retentionCohorts")
    .withIndex("by_app_cohort", (q) => q.eq("appSlug", slug).gte("cohortStart", from).lte("cohortStart", to))
    .collect();
}

type Totals = { trackedDays: number; activeSum: number; active30Sum: number; newUsers: number; sessions: number | null };

function totals(rows: Doc<"engagementDaily">[], trackingStart: string | null): Totals {
  const tracked = trackingStart ? rows.filter((r) => r.date >= trackingStart) : [];
  return {
    trackedDays: tracked.length,
    activeSum: tracked.reduce((s, r) => s + r.activeUsers, 0),
    active30Sum: tracked.reduce((s, r) => s + (r.activeUsers30d ?? 0), 0),
    newUsers: tracked.reduce((s, r) => s + r.newUsers, 0),
    sessions: tracked.some((r) => r.sessions != null) ? tracked.reduce((s, r) => s + (r.sessions ?? 0), 0) : null,
  };
}

function pooled(rows: Doc<"retentionCohorts">[], key: "d1Users" | "d7Users" | "d30Users") {
  let users = 0;
  let base = 0;
  for (const r of rows) {
    const value = r[key];
    if (value == null) continue;
    users += value;
    base += r.cohortSize;
  }
  return { value: base ? users / base : null, base };
}

export const overview = authQuery({
  args: {
    from: v.string(),
    to: v.string(),
    prevFrom: v.string(),
    prevTo: v.string(),
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    app: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket, app }) => {
    const runs = await ctx.db.query("syncRuns").order("desc").take(300);
    const apps = app ? APPS.filter((a) => a.slug === app) : APPS;

    // Cohort table: at least the last 8 weeks, so short periods still show matured cohorts.
    const tableFrom = weekStart(from < addDays(to, -55) ? from : addDays(to, -55));
    // J7 KPI: cohorts whose day 7 falls inside the window.
    const kpiCohortFrom = addDays(prevFrom, -7);

    const x: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const key = bucketOf(d, bucket);
      if (x[x.length - 1] !== key) x.push(key);
    }

    const perApp = await Promise.all(
      apps.map(async (a) => {
        const meta = SOURCES[a.slug];
        if (!meta) return { slug: a.slug, connected: false as const };
        const first = await ctx.db
          .query("engagementDaily")
          .withIndex("by_app_date", (q) => q.eq("appSlug", a.slug))
          .filter((q) => q.gt(q.field("activeUsers"), 0))
          .first();
        const trackingStart = first?.date ?? null;
        const lastRun = runs.find((r) => r.source === meta.source);
        const lastOk = runs.find((r) => r.source === meta.source && r.status === "ok");
        const [cur, prev, cohorts] = await Promise.all([
          dailyRows(ctx, a.slug, from, to),
          dailyRows(ctx, a.slug, prevFrom, prevTo),
          cohortRows(ctx, a.slug, tableFrom < kpiCohortFrom ? tableFrom : kpiCohortFrom, to),
        ]);

        // Chart series: mean DAU per bucket, new users summed per bucket. null = not tracked yet.
        const activeAcc = new Map<string, { sum: number; n: number; fresh: number }>();
        for (const r of cur) {
          if (!trackingStart || r.date < trackingStart) continue;
          const key = bucketOf(r.date, bucket);
          const acc = activeAcc.get(key) ?? { sum: 0, n: 0, fresh: 0 };
          acc.sum += r.activeUsers;
          acc.n += 1;
          acc.fresh += r.newUsers;
          activeAcc.set(key, acc);
        }

        const inWindow = (lo: string, hi: string) => cohorts.filter((c) => c.cohortStart >= addDays(lo, -7) && c.cohortStart <= addDays(hi, -7));
        const weeks = new Map<string, Doc<"retentionCohorts">[]>();
        for (const c of cohorts) {
          if (c.cohortStart < tableFrom) continue;
          const key = weekStart(c.cohortStart);
          weeks.set(key, [...(weeks.get(key) ?? []), c]);
        }

        return {
          slug: a.slug,
          connected: true as const,
          sourceLabel: meta.label,
          trackingStart,
          lastSyncAt: lastOk ? (lastOk.finishedAt ?? lastOk.startedAt) : null,
          lastError: lastRun && lastRun.status === "error" ? (lastRun.message ?? "erreur") : null,
          current: totals(cur, trackingStart),
          previous: totals(prev, trackingStart),
          d7: pooled(inWindow(from, to), "d7Users"),
          d7Prev: pooled(inWindow(prevFrom, prevTo), "d7Users"),
          activeSeries: x.map((k) => {
            const acc = activeAcc.get(k);
            return acc ? acc.sum / acc.n : null;
          }),
          newSeries: x.map((k) => activeAcc.get(k)?.fresh ?? null),
          cohorts: [...weeks.entries()]
            .sort((a2, b2) => (a2[0] < b2[0] ? 1 : -1))
            .map(([week, rows]) => ({
              week,
              size: rows.reduce((s, r) => s + r.cohortSize, 0),
              d1: pooled(rows, "d1Users"),
              d7: pooled(rows, "d7Users"),
              d30: pooled(rows, "d30Users"),
            })),
        };
      }),
    );

    return { x, bucket, tableFrom, apps: perApp };
  },
});
