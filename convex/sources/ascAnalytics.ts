"use node";

import zlib from "node:zlib";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { APPS, type StudioApp } from "../lib/apps";
import { aggregateStoreReport as aggregate, parseTsv, REPORTS, type Row } from "../lib/storeReport";
import { ascGet, ascGetAll, ascToken } from "./asc";

// App Store Connect Analytics Reports: the store funnel (impressions → product page views → first
// downloads) per app, day and source type, from two standard reports:
//   - "App Store Discovery and Engagement Standard": Event = Impression | Page view | Tap, Page Type,
//     Source Type, Counts, Unique Counts
//   - "App Downloads Standard": Download Type = First-time Download | Redownload | ..., Source Type, Counts
// Flow: one ONGOING report request per app (created once; needs an Admin API key), then for each
// report: DAILY instances → segments (gzip TSV, pre-signed URL) → aggregate → storeFunnelDaily.
// Apple generates the first instances 1-2 days after the request.

const SOURCE = "asc_analytics";


async function ascPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ascToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403) throw new Error("ASC 403 : créer une demande de rapports exige une clé API au rôle Admin");
    throw new Error(`ASC ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

type RequestKind = "ongoing" | "snapshot";

/**
 * The app's report requests: the active ONGOING one (daily data from now on) and a ONE_TIME_SNAPSHOT
 * (history since 2024), each created when missing.
 */
async function requestsFor(app: StudioApp, notes: string[]): Promise<{ id: string; kind: RequestKind }[]> {
  const requests = await ascGetAll<any>(`/v1/apps/${app.appStoreId}/analyticsReportRequests?limit=50`);
  const out: { id: string; kind: RequestKind }[] = [];
  const wanted: { accessType: string; kind: RequestKind }[] = [
    { accessType: "ONGOING", kind: "ongoing" },
    { accessType: "ONE_TIME_SNAPSHOT", kind: "snapshot" },
  ];
  for (const w of wanted) {
    const found = requests.find((r) => r.attributes?.accessType === w.accessType && !r.attributes?.stoppedDueToInactivity);
    if (found) {
      out.push({ id: found.id, kind: w.kind });
      continue;
    }
    const created = await ascPost("/v1/analyticsReportRequests", {
      data: { type: "analyticsReportRequests", attributes: { accessType: w.accessType }, relationships: { app: { data: { type: "apps", id: app.appStoreId } } } },
    });
    notes.push(`${app.name} : demande ${w.kind === "ongoing" ? "quotidienne" : "historique"} créée, données sous 1-2 jours`);
    if (created.data?.id) out.push({ id: created.data.id, kind: w.kind });
  }
  return out;
}

async function downloadSegment(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Segment ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? zlib.gunzipSync(buf) : buf).toString("utf8");
}

async function syncApp(ctx: ActionCtx, app: StudioApp, maxInstances: number, notes: string[]): Promise<number> {
  let rows = 0;
  for (const request of await requestsFor(app, notes)) {
    const reports = await ascGetAll<any>(`/v1/analyticsReportRequests/${request.id}/reports?limit=200`, 10);
    for (const kind of Object.keys(REPORTS) as (keyof typeof REPORTS)[]) {
      const report = reports.find((r) => r.attributes?.name === REPORTS[kind]);
      if (!report) continue;
      const instances = (await ascGetAll<any>(`/v1/analyticsReports/${report.id}/instances?filter[granularity]=DAILY&limit=200`, 10))
        .sort((a, b) => String(b.attributes?.processingDate).localeCompare(String(a.attributes?.processingDate)))
        .slice(0, request.kind === "snapshot" ? 1000 : maxInstances);
      for (const inst of instances) {
        if (await ctx.runQuery(internal.storeAnalytics.instanceRead, { instanceId: inst.id })) continue;
        const segments = await ascGetAll<any>(`/v1/analyticsReportInstances/${inst.id}/segments?limit=200`, 5);
        const parsed: Row[] = [];
        for (const seg of segments) if (seg.attributes?.url) parsed.push(...parseTsv(await downloadSegment(seg.attributes.url)));
        const agg = aggregate(kind, parsed, app);
        await ctx.runMutation(internal.storeAnalytics.writeInstance, {
          instanceId: inst.id,
          requestKind: request.kind,
          report: kind,
          appSlug: app.slug,
          processingDate: String(inst.attributes?.processingDate ?? ""),
          rows: agg,
        });
        rows += agg.length;
      }
    }
  }
  if (!rows && !(await ctx.runQuery(internal.storeAnalytics.hasApp, { appSlug: app.slug }))) notes.push(`${app.name} : rapports pas encore générés par Apple`);
  return rows;
}

async function run(ctx: ActionCtx, maxInstances: number) {
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
  const notes: string[] = [];
  let rows = 0;
  const errors: string[] = [];
  for (const app of APPS) {
    try {
      rows += await syncApp(ctx, app, maxInstances, notes);
    } catch (err) {
      errors.push(`${app.name} : ${(err as Error).message}`);
    }
  }
  const message = [...errors, ...notes].join(" · ").slice(0, 400) || "à jour";
  await ctx.runMutation(internal.syncRuns.finish, { runId, status: errors.length === APPS.length ? "error" : "ok", rows, message });
  return { rows, errors, notes };
}

/** Cron: the newest daily instances of each report (already-read instances are skipped). */
export const syncRecent = internalAction({ args: {}, handler: (ctx) => run(ctx, 10) });

/** Every daily instance Apple still serves. */
export const backfill = internalAction({ args: { maxInstances: v.optional(v.number()) }, handler: (ctx, { maxInstances }) => run(ctx, maxInstances ?? 400) });

/** Read-only probe: the requests and reports Apple has for each app. */
export const inspect = internalAction({
  args: {},
  handler: async () => {
    const out: unknown[] = [];
    for (const app of APPS) {
      const requests = await ascGetAll<any>(`/v1/apps/${app.appStoreId}/analyticsReportRequests?limit=50`);
      const detail = [];
      for (const r of requests) {
        const reports = await ascGet<any>(`/v1/analyticsReportRequests/${r.id}/reports?limit=200`).catch((e: Error) => ({ error: e.message }));
        const names = Array.isArray((reports as any).data) ? (reports as any).data.map((x: any) => x.attributes?.name).filter((n: string) => /Discovery and Engagement Standard|Downloads Standard/.test(n)) : reports;
        detail.push({ id: r.id, accessType: r.attributes?.accessType, stopped: r.attributes?.stoppedDueToInactivity, reports: names });
      }
      out.push({ app: app.slug, requests: detail });
    }
    return out;
  },
});
