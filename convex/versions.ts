import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { authAction, authQuery } from "./lib/auth";

// Versions & builds page. Current state per app (live / in review / in preparation), release history
// with cadence, and the latest builds. Everything comes from appVersions / appBuilds (sources/versions.ts).

const DAY = 86400000;
const SHIPPED = new Set(["READY_FOR_SALE", "REPLACED_WITH_NEW_VERSION", "REMOVED_FROM_SALE", "DEVELOPER_REMOVED_FROM_SALE"]);
const AT_APPLE = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE", "PENDING_APPLE_RELEASE", "PROCESSING_FOR_APP_STORE", "PROCESSING_FOR_DISTRIBUTION", "READY_FOR_REVIEW", "ACCEPTED"]);
const REJECTED = new Set(["REJECTED", "METADATA_REJECTED", "INVALID_BINARY"]);

export type VersionKind = "live" | "replaced" | "removed" | "atApple" | "rejected" | "draft";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;

function shapeApp(rows: Doc<"appVersions">[]) {
  const shipped = rows.filter((r) => SHIPPED.has(r.state)).sort((a, b) => (a.releasedAt ?? a.createdDate ?? "").localeCompare(b.releasedAt ?? b.createdDate ?? ""));
  const live = [...shipped].reverse().find((r) => r.state === "READY_FOR_SALE") ?? null;
  const prevRelease = new Map<string, string>();
  let last: string | null = null;
  for (const r of shipped) {
    if (!r.releasedAt) continue;
    if (last) prevRelease.set(r.versionId, last);
    last = r.releasedAt;
  }
  return rows.map((r) => {
    const kind: VersionKind = SHIPPED.has(r.state)
      ? r.versionId === live?.versionId
        ? "live"
        : r.state.includes("REMOVED")
          ? "removed"
          : "replaced"
      : AT_APPLE.has(r.state)
        ? "atApple"
        : REJECTED.has(r.state)
          ? "rejected"
          : "draft";
    const subs = r.submissions ?? [];
    // The submission that got the version out: the last one before its release date.
    const shippingSub = r.releasedAt ? [...subs].reverse().find((s) => s.submittedDate <= r.releasedAt!) : undefined;
    const lastSub = subs[subs.length - 1];
    const prev = prevRelease.get(r.versionId);
    return {
      appSlug: r.appSlug,
      versionId: r.versionId,
      versionString: r.versionString,
      state: r.state,
      kind,
      platform: r.platform ?? "IOS",
      releaseType: r.releaseType ?? null,
      earliestReleaseDate: r.earliestReleaseDate ?? null,
      buildNumber: r.buildNumber ?? null,
      createdDate: r.createdDate ?? null,
      releasedAt: r.releasedAt ?? null,
      submissionCount: subs.length,
      submittedAt: (shippingSub ?? lastSub)?.submittedDate ?? null,
      lastSubmissionState: lastSub?.state ?? null,
      submitToLiveDays: shippingSub && r.releasedAt ? days(shippingSub.submittedDate, r.releasedAt) : null,
      createToLiveDays: r.createdDate && r.releasedAt ? Math.max(0, days(r.createdDate, r.releasedAt)) : null,
      gapDays: prev && r.releasedAt ? days(prev, r.releasedAt) : null,
    };
  });
}

export const overview = authQuery({
  args: { app: v.optional(v.string()) },
  handler: async (ctx, { app }) => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const since90 = iso(now - 90 * DAY);
    const since365 = iso(now - 365 * DAY);

    const versionRows = app
      ? await ctx.db.query("appVersions").withIndex("by_app", (q) => q.eq("appSlug", app)).collect()
      : await ctx.db.query("appVersions").collect();
    const buildRows = app
      ? await ctx.db.query("appBuilds").withIndex("by_app_uploaded", (q) => q.eq("appSlug", app)).collect()
      : await ctx.db.query("appBuilds").collect();

    const bySlug = new Map<string, Doc<"appVersions">[]>();
    for (const r of versionRows) bySlug.set(r.appSlug, [...(bySlug.get(r.appSlug) ?? []), r]);
    const versions = [...bySlug.values()]
      .flatMap(shapeApp)
      .sort((a, b) => (b.releasedAt ?? b.createdDate ?? "").localeCompare(a.releasedAt ?? a.createdDate ?? ""));

    const attached = new Map<string, string>();
    for (const r of versionRows) if (r.buildId) attached.set(r.buildId, r.versionString);
    const sortedBuilds = [...buildRows].sort((a, b) => b.uploadedDate.localeCompare(a.uploadedDate));
    const latestBuildByApp = new Map<string, (typeof sortedBuilds)[number]>();
    for (const b of sortedBuilds) if (!latestBuildByApp.has(b.appSlug)) latestBuildByApp.set(b.appSlug, b);
    const shapeBuild = (b: Doc<"appBuilds">) => ({
      appSlug: b.appSlug,
      buildId: b.buildId,
      buildNumber: b.version,
      marketingVersion: b.marketingVersion ?? null,
      uploadedDate: b.uploadedDate,
      processingState: b.processingState,
      expired: b.expired,
      expirationDate: b.expirationDate ?? null,
      minOsVersion: b.minOsVersion ?? null,
      attachedTo: attached.get(b.buildId) ?? null,
    });

    // Builds per month and app (UTC month of upload), for the activity chart.
    const buildsByMonth: Record<string, Record<string, number>> = {};
    for (const b of buildRows) {
      const month = new Date(Date.parse(b.uploadedDate)).toISOString().slice(0, 7);
      buildsByMonth[month] ??= {};
      buildsByMonth[month][b.appSlug] = (buildsByMonth[month][b.appSlug] ?? 0) + 1;
    }

    const released = versions.filter((x) => x.releasedAt);
    const releases365 = released.filter((x) => x.releasedAt! >= since365);
    const gaps = releases365.map((x) => x.gapDays).filter((x): x is number => x != null);
    const submitToLive = releases365.map((x) => x.submitToLiveDays).filter((x): x is number => x != null);
    const lastReleaseAt = released.reduce<string | null>((m, x) => (!m || x.releasedAt! > m ? x.releasedAt! : m), null);

    const apps = [...new Set([...bySlug.keys(), ...latestBuildByApp.keys()])].map((slug) => {
      const own = versions.filter((x) => x.appSlug === slug);
      const latest = latestBuildByApp.get(slug);
      return {
        slug,
        live: own.find((x) => x.kind === "live") ?? null,
        upcoming: own.filter((x) => x.kind === "atApple" || x.kind === "rejected" || x.kind === "draft"),
        latestBuild: latest ? shapeBuild(latest) : null,
        releases365: own.filter((x) => x.releasedAt && x.releasedAt >= since365).length,
      };
    });

    const runs = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", "asc_versions")).order("desc").take(10);
    const lastRun = runs.find((r) => r.status !== "running") ?? null;
    const lastOk = runs.find((r) => r.status === "ok") ?? null;

    return {
      hasData: versionRows.length > 0 || buildRows.length > 0,
      now,
      apps,
      versions,
      builds: sortedBuilds.slice(0, 200).map(shapeBuild),
      buildsTotal: buildRows.length,
      buildsByMonth,
      kpis: {
        releases90: released.filter((x) => x.releasedAt! >= since90).length,
        releases365: releases365.length,
        medianGapDays: median(gaps),
        gapSamples: gaps.length,
        medianSubmitToLiveDays: median(submitToLive),
        submitSamples: submitToLive.length,
        atApple: versions.filter((x) => x.kind === "atApple").length,
        rejected: versions.filter((x) => x.kind === "rejected").length,
        drafts: versions.filter((x) => x.kind === "draft").length,
        builds90: buildRows.filter((b) => b.uploadedDate >= since90).length,
        lastReleaseAt,
      },
      sync: {
        lastOkAt: lastOk ? (lastOk.finishedAt ?? lastOk.startedAt) : null,
        lastError: lastRun && lastRun.status === "error" ? (lastRun.message ?? "Erreur inconnue") : null,
        // syncRecent writes "<App>: <error>" entries when one app failed but the others synced.
        partialError: lastRun && lastRun.status === "ok" && lastRun.message && !/^\d+ versions, \d+ builds$/.test(lastRun.message) ? lastRun.message : null,
      },
    };
  },
});

/** "Actualiser" button: runs the same sync as the cron. */
export const refresh = authAction({
  args: {},
  handler: async (ctx): Promise<{ versions: number; builds: number; errors: string[] }> => {
    return await ctx.runAction(internal.sources.versions.syncRecent, {});
  },
});
