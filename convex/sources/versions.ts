"use node";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { APPS, type StudioApp } from "../lib/apps";
import { ascToken } from "./asc";

// App Store versions, builds and review submissions from App Store Connect (read-only GETs), plus the
// release date of each version from the public App Store page (ASC has no "released on" field).
// Four requests per app, full history each time: cheap enough for every cron tick.

type Json = any;
type Submission = { id: string; submittedDate: string; state: string };

/** ASC dates come with a Pacific offset ("2026-10-09T12:14:47-07:00"); store them as UTC ISO strings. */
const toIso = (value: unknown): string | undefined => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);

/** Pages a JSON:API collection and keeps `included` (the shared ascGetAll only returns `data`). */
async function ascCollection(path: string): Promise<{ data: Json[]; included: Json[] }> {
  const data: Json[] = [];
  const included: Json[] = [];
  let url: string | null = `https://api.appstoreconnect.apple.com${path}`;
  for (let page = 0; url && page < 10; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${ascToken()}` } });
    if (!res.ok) throw new Error(`ASC ${res.status} on ${url.replace("https://api.appstoreconnect.apple.com", "")}: ${(await res.text()).slice(0, 300)}`);
    const json: Json = await res.json();
    data.push(...(json.data ?? []));
    included.push(...(json.included ?? []));
    url = json.links?.next ?? null;
  }
  return { data, included };
}

/** Public App Store version history: versionString → ISO release datetime. Empty when unreachable. */
async function fetchReleaseDates(app: StudioApp): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const res = await fetch(`https://apps.apple.com/us/app/id${app.appStoreId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        "Accept-Language": "en-US",
      },
    });
    if (!res.ok) return out;
    const html = await res.text();
    const re = /"primarySubtitle":"(?:Version )?([0-9][0-9A-Za-z.\-]*)","secondarySubtitle":"([^"]+)"/g;
    for (const m of html.matchAll(re)) {
      const t = Date.parse(m[2]);
      if (!Number.isNaN(t) && !out.has(m[1])) out.set(m[1], new Date(t).toISOString());
    }
  } catch {
    // Network error: replaceApp keeps the release dates stored earlier.
  }
  return out;
}

async function fetchApp(app: StudioApp) {
  const [versionsRes, buildsRes, submissionsRes, releaseDates] = await Promise.all([
    ascCollection(
      `/v1/apps/${app.appStoreId}/appStoreVersions?limit=200&include=build` +
        "&fields[appStoreVersions]=versionString,appStoreState,appVersionState,createdDate,releaseType,earliestReleaseDate,platform,build&fields[builds]=version",
    ),
    ascCollection(
      `/v1/builds?filter[app]=${app.appStoreId}&limit=200&sort=-uploadedDate&include=preReleaseVersion` +
        "&fields[builds]=version,uploadedDate,processingState,expired,expirationDate,minOsVersion,preReleaseVersion&fields[preReleaseVersions]=version",
    ),
    ascCollection(
      `/v1/reviewSubmissions?filter[app]=${app.appStoreId}&limit=200&include=appStoreVersionForReview` +
        "&fields[reviewSubmissions]=submittedDate,state,platform,appStoreVersionForReview&fields[appStoreVersions]=versionString",
    ),
    fetchReleaseDates(app),
  ]);

  const submissionsByVersion = new Map<string, Submission[]>();
  for (const s of submissionsRes.data) {
    const versionId = s.relationships?.appStoreVersionForReview?.data?.id;
    if (!versionId || !s.attributes?.submittedDate) continue;
    const list = submissionsByVersion.get(versionId) ?? [];
    list.push({ id: s.id, submittedDate: toIso(s.attributes.submittedDate) ?? s.attributes.submittedDate, state: s.attributes.state ?? "UNKNOWN" });
    submissionsByVersion.set(versionId, list);
  }

  const buildNumber = new Map<string, string>(versionsRes.included.filter((x) => x.type === "builds").map((x) => [x.id, String(x.attributes?.version ?? "")]));
  const versions = versionsRes.data.map((d) => {
    const a = d.attributes ?? {};
    const buildId: string | undefined = d.relationships?.build?.data?.id ?? undefined;
    const state: string = a.appStoreState ?? a.appVersionState ?? "UNKNOWN";
    const shipped = state === "READY_FOR_SALE" || state === "REPLACED_WITH_NEW_VERSION" || state === "REMOVED_FROM_SALE" || state === "DEVELOPER_REMOVED_FROM_SALE";
    return {
      versionId: d.id as string,
      versionString: String(a.versionString ?? ""),
      state,
      appVersionState: a.appVersionState ?? undefined,
      platform: a.platform ?? undefined,
      createdDate: toIso(a.createdDate),
      releaseType: a.releaseType ?? undefined,
      earliestReleaseDate: toIso(a.earliestReleaseDate),
      buildId,
      buildNumber: buildId ? buildNumber.get(buildId) : undefined,
      releasedAt: shipped ? releaseDates.get(String(a.versionString)) : undefined,
      submissions: (submissionsByVersion.get(d.id) ?? []).sort((x, y) => x.submittedDate.localeCompare(y.submittedDate)),
    };
  });

  const marketing = new Map<string, string>(buildsRes.included.filter((x) => x.type === "preReleaseVersions").map((x) => [x.id, String(x.attributes?.version ?? "")]));
  const builds = buildsRes.data.map((b) => {
    const a = b.attributes ?? {};
    const preId: string | undefined = b.relationships?.preReleaseVersion?.data?.id;
    return {
      buildId: b.id as string,
      version: String(a.version ?? ""),
      marketingVersion: preId ? marketing.get(preId) : undefined,
      uploadedDate: toIso(a.uploadedDate) ?? String(a.uploadedDate),
      processingState: a.processingState ?? "UNKNOWN",
      expired: Boolean(a.expired),
      expirationDate: toIso(a.expirationDate),
      minOsVersion: a.minOsVersion ?? undefined,
    };
  });
  return { versions, builds };
}

export const syncRecent = internalAction({
  args: {},
  handler: async (ctx): Promise<{ versions: number; builds: number; errors: string[] }> => {
    const runId = await ctx.runMutation(internal.syncRuns.start, { source: "asc_versions" });
    const fetchedAt = Date.now();
    let versions = 0;
    let builds = 0;
    const errors: string[] = [];
    for (const app of APPS) {
      try {
        const data = await fetchApp(app);
        await ctx.runMutation(internal.versionsData.replaceApp, { appSlug: app.slug, ...data, fetchedAt });
        versions += data.versions.length;
        builds += data.builds.length;
      } catch (err) {
        errors.push(`${app.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await ctx.runMutation(internal.syncRuns.finish, {
      runId,
      status: errors.length === APPS.length ? "error" : "ok",
      rows: versions + builds,
      message: errors.length ? errors.join(" | ").slice(0, 900) : `${versions} versions, ${builds} builds`,
    });
    return { versions, builds, errors };
  },
});
