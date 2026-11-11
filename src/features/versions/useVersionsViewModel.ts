import { useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { APPS, appColor, appName, type AppSlug } from "@/lib/apps";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { useFilters } from "@/lib/filters";
import { formatDay, formatDayLong, formatDecimal, formatInt, formatMonth } from "@/lib/format";
import type { BarListItem, Series, Status } from "@/ui";
import { buildState, releaseTypeLabel, versionState } from "./labels";

const DAY = 86400000;
const BUILDS_PAGE = 20;

type Overview = NonNullable<ReturnType<typeof useOverview>>;
type VersionRow = Overview["versions"][number];
type BuildRow = Overview["builds"][number];

function useOverview(app: AppSlug | null) {
  return useSolisQuery(api.versions.overview, app ? { app } : {});
}

/** "22 oct." this year, "22 oct. 25" otherwise. */
function day(iso: string | null, now: number): string {
  if (!iso) return "—";
  const sameYear = iso.slice(0, 4) === new Date(now).toISOString().slice(0, 4);
  return sameYear ? formatDay(iso) : `${formatDay(iso)} ${iso.slice(2, 4)}`;
}

function ago(iso: string, now: number): string {
  const d = Math.floor((now - Date.parse(iso)) / DAY);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return "hier";
  return `il y a ${formatInt(d)} j`;
}

function duration(daysValue: number | null | undefined): string {
  if (daysValue == null) return "—";
  if (daysValue < 1) return `${formatInt(Math.max(1, Math.round(daysValue * 24)))} h`;
  return `${formatDecimal(daysValue)} j`;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export type TimelineEvent = { key: string; at: number; label: string; detail: string; hollow: boolean };
export type TimelineLane = { slug: string; name: string; color: string; events: TimelineEvent[] };

export function useVersionsViewModel() {
  const { app, setApp } = useFilters();
  const fresh = useOverview(app === "otto" ? null : app);
  // Keep the previous result while the next app's query loads, so switching apps never flashes skeletons.
  const last = useRef(fresh);
  if (fresh !== undefined) last.current = fresh;
  const data = fresh ?? last.current;
  const refresh = useSolisAction(api.versions.refresh);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showAllBuilds, setShowAllBuilds] = useState(false);

  const runSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await refresh({});
      if (res.errors.length) setSyncError(res.errors.join(" · "));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const view = useMemo(() => {
    if (!data) return null;
    const now = data.now;
    const { kpis } = data;
    const order = (slug: string) => APPS.findIndex((a) => a.slug === slug);

    const kpiTiles = [
      {
        key: "releases",
        label: "Sorties sur 90 jours",
        value: formatInt(kpis.releases90),
        foot: `${formatInt(kpis.releases365)} sur 12 mois`,
        hint: "Versions passées en ligne sur l'App Store (date de la fiche publique App Store).",
      },
      {
        key: "gap",
        label: "Écart médian entre sorties",
        value: kpis.medianGapDays != null ? `${formatDecimal(kpis.medianGapDays)} j` : "—",
        foot: kpis.gapSamples ? `${formatInt(kpis.gapSamples)} intervalles sur 12 mois` : "pas assez de sorties",
        hint: "Jours entre deux mises en ligne successives d'une même app, médiane sur 12 mois.",
      },
      {
        key: "review",
        label: "Soumission → en ligne",
        value: duration(kpis.medianSubmitToLiveDays),
        foot: kpis.submitSamples ? `médiane sur ${formatInt(kpis.submitSamples)} versions` : "aucune soumission liée",
        hint: "De la dernière soumission en review à la mise en ligne publique. Inclut l'attente avant publication manuelle.",
      },
      {
        key: "pending",
        label: "En cours chez Apple",
        value: formatInt(kpis.atApple),
        foot: [kpis.rejected ? `${formatInt(kpis.rejected)} rejetée${kpis.rejected > 1 ? "s" : ""}` : null, `${formatInt(kpis.drafts)} en préparation`].filter(Boolean).join(" · "),
        hint: "Versions soumises, en review ou validées mais pas encore publiées.",
      },
    ];

    const appCards = [...data.apps]
      .sort((a, b) => order(a.slug) - order(b.slug))
      .map((a) => {
        const live = a.live
          ? {
              version: a.live.versionString,
              build: a.live.buildNumber,
              released: a.live.releasedAt ? `${day(a.live.releasedAt, now)} · ${ago(a.live.releasedAt, now)}` : "date de sortie inconnue",
            }
          : null;
        const upcoming = a.upcoming.map((u) => {
          const s = versionState(u.state, u.kind);
          let detail: string;
          if (u.kind === "draft") detail = u.buildNumber ? `build ${u.buildNumber} attaché · créée le ${day(u.createdDate, now)}` : `aucun build attaché · créée le ${day(u.createdDate, now)}`;
          else if (u.submittedAt) detail = `soumise le ${day(u.submittedAt, now)} · ${ago(u.submittedAt, now)}${u.buildNumber ? ` · build ${u.buildNumber}` : ""}`;
          else detail = u.buildNumber ? `build ${u.buildNumber}` : "";
          return { key: u.versionId, version: u.versionString, label: s.label, status: s.status, detail, release: releaseTypeLabel(u.releaseType) };
        });
        const b = a.latestBuild;
        let latestBuild: { text: string; expiry: string | null; expiryStatus: Status } | null = null;
        if (b) {
          const left = b.expirationDate ? Math.floor((Date.parse(b.expirationDate) - now) / DAY) : null;
          latestBuild = {
            text: `Build ${b.buildNumber}${b.marketingVersion ? ` (${b.marketingVersion})` : ""} · envoyé ${ago(b.uploadedDate, now)}`,
            expiry: b.expired ? "TestFlight expiré" : left != null ? `TestFlight expire dans ${formatInt(left)} j` : null,
            expiryStatus: b.expired || (left != null && left <= 14) ? "warning" : "neutral",
          };
        }
        return { slug: a.slug, name: appName(a.slug), live, upcoming, latestBuild, releases365: a.releases365 };
      });

    // Release timeline: one lane per app, a dot per public release, a ring per version at Apple.
    const released = data.versions.filter((x) => x.releasedAt);
    const firstAt = Math.min(now - 90 * DAY, ...released.map((x) => Date.parse(x.releasedAt!)), ...data.versions.filter((x) => x.kind === "atApple" && x.submittedAt).map((x) => Date.parse(x.submittedAt!)));
    const lanes: TimelineLane[] = appCards.map((a) => ({
      slug: a.slug,
      name: a.name,
      color: appColor(a.slug),
      events: data.versions
        .filter((x) => x.appSlug === a.slug && (x.releasedAt || (x.kind === "atApple" && x.submittedAt)))
        .map((x) => {
          const at = x.releasedAt ?? x.submittedAt!;
          return {
            key: x.versionId,
            at: Date.parse(at),
            label: x.versionString,
            detail: x.releasedAt
              ? `En ligne le ${formatDayLong(x.releasedAt)}${x.gapDays != null ? ` · ${formatDecimal(x.gapDays)} j après la précédente` : ""}`
              : `${versionState(x.state, x.kind).label} · soumise le ${formatDayLong(at)}`,
            hollow: !x.releasedAt,
          };
        })
        .sort((p, q) => p.at - q.at),
    }));
    const timeline = { from: firstAt, to: now, lanes };

    // Builds per month and app.
    const months = Object.keys(data.buildsByMonth).sort();
    const nowMonth = new Date(now).toISOString().slice(0, 7);
    const x = months.length ? monthsBetween(months[0], nowMonth) : [];
    const slugs = appCards.map((a) => a.slug);
    const buildSeries: Series[] = slugs.map((slug) => ({
      key: slug,
      label: appName(slug),
      color: appColor(slug),
      values: x.map((m) => data.buildsByMonth[m]?.[slug] ?? 0),
    }));

    // Submission → live per recent version.
    const reviewBars: BarListItem[] = released
      .filter((v) => v.submitToLiveDays != null)
      .slice(0, 8)
      .map((v) => ({
        key: v.versionId,
        label: `${appName(v.appSlug)} ${v.versionString}`,
        value: v.submitToLiveDays!,
        color: appColor(v.appSlug),
        hint: `Soumise le ${formatDayLong(v.submittedAt!)}, en ligne le ${formatDayLong(v.releasedAt!)} (${releaseTypeLabel(v.releaseType).toLowerCase()})`,
      }));

    const versionRows = data.versions.map((v: VersionRow) => {
      const s = versionState(v.state, v.kind);
      return {
        key: v.versionId,
        appSlug: v.appSlug,
        version: v.versionString,
        stateLabel: s.label,
        status: s.status,
        build: v.buildNumber ?? "—",
        created: day(v.createdDate, now),
        submitted: day(v.submittedAt, now),
        released: day(v.releasedAt, now),
        submitToLive: duration(v.submitToLiveDays),
        gap: v.gapDays != null ? `${formatDecimal(v.gapDays)} j` : "—",
        submissions: v.submissionCount ? formatInt(v.submissionCount) : "—",
        release: releaseTypeLabel(v.releaseType),
      };
    });

    const buildRows = data.builds.map((b: BuildRow) => {
      const s = buildState(b.processingState, b.expired);
      const left = b.expirationDate ? Math.floor((Date.parse(b.expirationDate) - now) / DAY) : null;
      return {
        key: b.buildId,
        appSlug: b.appSlug,
        version: b.marketingVersion ?? "—",
        build: b.buildNumber,
        uploaded: day(b.uploadedDate, now),
        stateLabel: s.label,
        status: s.status,
        expiry: b.expired ? "—" : left != null ? `dans ${formatInt(left)} j` : "—",
        minOs: b.minOsVersion ? `iOS ${b.minOsVersion}` : "—",
        attachedTo: b.attachedTo ?? "—",
      };
    });

    return {
      empty: !data.hasData,
      showAppColumn: !app,
      kpis: kpiTiles,
      appCards,
      timeline,
      builds: { x, series: buildSeries, total: data.buildsTotal, last90: kpis.builds90 },
      formatMonth,
      formatDuration: duration,
      reviewBars,
      versionRows,
      buildRows: showAllBuilds ? buildRows : buildRows.slice(0, BUILDS_PAGE),
      buildsHidden: Math.max(0, buildRows.length - BUILDS_PAGE),
      buildsShownAll: showAllBuilds,
      buildsCapped: data.buildsTotal > buildRows.length,
      updatedAt: data.sync.lastOkAt,
      storedError: data.sync.lastError ?? data.sync.partialError,
    };
  }, [data, app, showAllBuilds]);

  return {
    loading: data === undefined,
    view,
    app,
    setApp,
    toggleBuilds: () => setShowAllBuilds((s) => !s),
    sync: { run: runSync, running: syncing, error: syncError },
  };
}
