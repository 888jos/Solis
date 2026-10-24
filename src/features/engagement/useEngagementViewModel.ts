import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { overview as overviewQuery } from "@convex/engagement";
import type { RegisteredQuery } from "convex/server";
import { appColor, appName, type AppSlug } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatDayLong, formatDecimal, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { Series } from "@/ui";

// `api` can lose its types when another module has an inference cycle; read result types from our module.
type QueryResult<Q> = Q extends RegisteredQuery<any, any, infer R> ? Awaited<R> : never;
type Overview = QueryResult<typeof overviewQuery>;
type AppData = Overview["apps"][number];
type ConnectedApp = Extract<AppData, { connected: true }>;

/** What is missing for apps without an engagement source (checked on disk, see convex/sources/engagement.ts). */
const MISSING: Record<string, string> = {
  cocorise:
    "un accès en lecture à Google Analytics for Firebase (GA4) : l'ID de propriété GA4, le rôle Lecteur pour le compte de service cocorise-analytics-local sur cette propriété, et sa clé dans une variable Convex. Firestore analytics_events n'est plus alimenté depuis le 4 sept. 2026",
};

export type RetentionCell = { label: string; step: number | null; zero: boolean; partial: boolean; title: string };
export type CohortRow = { key: string; week: string; size: string; d1: RetentionCell; d7: RetentionCell; d30: RetentionCell };
export type CohortTable = { slug: AppSlug; name: string; rows: CohortRow[] };

const STEPS = 7;

function cell(p: { value: number | null; base: number }, size: number, max: number): RetentionCell {
  if (p.value == null) return { label: "—", step: null, zero: false, partial: false, title: "Pas encore mesurable" };
  const partial = p.base < size;
  const step = max > 0 ? Math.min(STEPS - 1, Math.round((p.value / max) * (STEPS - 1))) : 0;
  const title = `${formatPct(p.value)} de ${formatInt(p.base)} utilisateurs${partial ? ` (sur ${formatInt(size)} : cohorte pas encore complète)` : ""}`;
  return { label: formatPct(p.value, 0), step: p.value > 0 ? Math.max(1, step) : 0, zero: p.value === 0, partial, title };
}

export function useEngagementViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const [cohortApp, setCohortApp] = useState<AppSlug | null>(null);
  const data = useSolisQuery(api.engagement.overview, {
    from: period.from,
    to: period.to,
    prevFrom: period.prevFrom,
    prevTo: period.prevTo,
    bucket: period.bucket,
    app,
  }) as Overview | undefined;

  const view = useMemo(() => {
    if (!data) return null;
    const connected = data.apps.filter((a): a is ConnectedApp => a.connected);
    const notConnected = data.apps.filter((a) => !a.connected).map((a) => ({ slug: a.slug as AppSlug, name: appName(a.slug), missing: MISSING[a.slug] ?? "une source d'analytics" }));
    const tracked = connected.filter((a) => a.trackingStart);

    const sum = (pick: (a: ConnectedApp) => number) => tracked.reduce((s, a) => s + pick(a), 0);
    // Days of the period covered by at least one source (apps are summed day by day).
    const days = Math.max(0, ...tracked.map((a) => a.current.trackedDays));
    const prevDays = Math.max(0, ...tracked.map((a) => a.previous.trackedDays));
    const avgDau = days ? sum((a) => a.current.activeSum) / days : null;
    const prevAvgDau = prevDays ? sum((a) => a.previous.activeSum) / prevDays : null;
    const newUsers = days ? sum((a) => a.current.newUsers) : null;
    const prevNew = prevDays ? sum((a) => a.previous.newUsers) : null;
    const stick = (k: "current" | "previous") => {
      const mau = sum((a) => a[k].active30Sum);
      return mau ? sum((a) => a[k].activeSum) / mau : null;
    };
    const d7 = (k: "d7" | "d7Prev") => {
      const base = sum((a) => a[k].base);
      return { value: base ? sum((a) => (a[k].value ?? 0) * a[k].base) / base : null, base };
    };
    const ret = d7("d7");
    const retPrev = d7("d7Prev");
    const stickiness = stick("current");
    const prevStickiness = prevDays ? stick("previous") : null;
    const sessions = tracked.some((a) => a.current.sessions != null) ? sum((a) => a.current.sessions ?? 0) : null;

    const kpis = {
      avgDau: {
        value: avgDau == null ? "—" : formatDecimal(avgDau),
        delta: avgDau != null && prevAvgDau != null ? change(avgDau, prevAvgDau) : null,
        foot: sessions != null && days ? `${formatDecimal(sessions / days)} sessions/j` : "vs période préc.",
      },
      newUsers: {
        value: formatInt(newUsers),
        delta: newUsers != null && prevNew != null ? change(newUsers, prevNew) : null,
        foot: prevNew != null ? `${formatInt(prevNew)} avant` : "vs période préc.",
      },
      stickiness: {
        value: formatPct(stickiness),
        delta: stickiness != null && prevStickiness != null ? change(stickiness, prevStickiness) : null,
        foot: prevStickiness != null ? `${formatPct(prevStickiness)} avant` : "DAU / MAU 30 j",
      },
      retention: {
        value: formatPct(ret.value),
        delta: ret.value != null && retPrev.value != null ? change(ret.value, retPrev.value) : null,
        foot: ret.base ? `sur ${formatInt(ret.base)} nouveaux` : "aucune cohorte à J7",
      },
    };

    const formatX = data.bucket === "month" ? formatMonth : formatDay;
    const formatXLong = data.bucket === "month" ? formatMonthLong : data.bucket === "week" ? (x: string) => `Semaine du ${formatDay(x)}` : formatDayLong;
    const series = (pick: (a: ConnectedApp) => (number | null)[]): Series[] =>
      tracked.map((a) => ({ key: a.slug, label: appName(a.slug), color: appColor(a.slug), values: pick(a) }));
    const hasPoints = (s: Series[]) => s.some((x) => x.values.some((v) => v != null));
    const dau = series((a) => a.activeSeries);
    const fresh = series((a) => a.newSeries);

    const tables: CohortTable[] = tracked.map((a) => {
      const max = Math.max(0, ...a.cohorts.flatMap((c) => [c.d1.value ?? 0, c.d7.value ?? 0, c.d30.value ?? 0]));
      return {
        slug: a.slug as AppSlug,
        name: appName(a.slug),
        rows: a.cohorts.map((c) => ({
          key: c.week,
          week: formatDay(c.week),
          size: formatInt(c.size),
          d1: cell(c.d1, c.size, max),
          d7: cell(c.d7, c.size, max),
          d30: cell(c.d30, c.size, max),
        })),
      };
    });
    const activeTable = tables.find((t) => t.slug === cohortApp) ?? tables[0] ?? null;

    const notes = connected.map((a) => ({
      slug: a.slug as AppSlug,
      text: `${appName(a.slug)} : ${a.sourceLabel}${a.trackingStart ? `, suivi depuis le ${formatDay(a.trackingStart)}` : ", aucun utilisateur actif reçu"}`,
      updatedAt: a.lastSyncAt,
      error: a.lastError,
    }));
    const trackingNote =
      tracked.length && tracked.every((a) => a.trackingStart! > period.from)
        ? `Pas de données avant le ${formatDay(tracked.map((a) => a.trackingStart!).sort()[0])} : moyennes calculées sur les jours suivis.`
        : null;

    return {
      empty: tracked.length === 0,
      connectedCount: connected.length,
      notConnected,
      kpis,
      charts: {
        x: data.x,
        formatX,
        formatXLong,
        dau: hasPoints(dau) ? dau : null,
        fresh: hasPoints(fresh) ? fresh : null,
        dauTitle: data.bucket === "day" ? "Utilisateurs actifs par jour" : `Utilisateurs actifs par jour, moyenne ${data.bucket === "week" ? "hebdo" : "mensuelle"}`,
        freshTitle: data.bucket === "day" ? "Nouveaux utilisateurs par jour" : `Nouveaux utilisateurs par ${data.bucket === "week" ? "semaine" : "mois"}`,
        formatValue: (v: number) => formatDecimal(v),
        formatCount: (v: number) => formatInt(v),
      },
      cohorts: {
        tables,
        active: activeTable,
        pickApp: setCohortApp,
        since: formatDay(data.tableFrom),
      },
      notes,
      trackingNote,
    };
  }, [data, cohortApp, period.from]);

  return { loading: data === undefined, period, app, view };
}
