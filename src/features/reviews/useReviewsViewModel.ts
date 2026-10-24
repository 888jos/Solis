import { useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { feed as feedQuery, overview as overviewQuery } from "@convex/reviews";
import type { RegisteredQuery } from "convex/server";
import { appColor, appName } from "@/lib/apps";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatDay, formatDayLong, formatDecimal, formatInt, formatPct } from "@/lib/format";
import type { Series } from "@/ui";

// `api` can lose its types when another module has an inference cycle; read result types from our module.
type QueryResult<Q> = Q extends RegisteredQuery<any, any, infer R> ? Awaited<R> : never;

export type StarsFilter = "all" | "low" | "mid" | "high";

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(cc: string): string {
  const code = cc.toUpperCase();
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

const PAGE = 50;

export function useReviewsViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const [stars, setStars] = useState<StarsFilter>("all");
  const [unanswered, setUnanswered] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const data = useSolisQuery(api.reviews.overview, { app, from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo }) as
    | QueryResult<typeof overviewQuery>
    | undefined;
  const feedLive = useSolisQuery(api.reviews.feed, { app, from: period.from, to: period.to, stars, unanswered, limit }) as QueryResult<typeof feedQuery> | undefined;
  // Keep the previous list on screen while a filter change loads, instead of flashing a skeleton.
  const lastFeed = useRef(feedLive);
  if (feedLive !== undefined) lastFeed.current = feedLive;
  const feed = feedLive ?? lastFeed.current;
  const refresh = useSolisAction(api.reviews.refresh);

  const view = useMemo(() => {
    if (!data) return null;
    const { ratings, reviews } = data;
    const snapshotLabel = ratings.date ? formatDay(ratings.date) : null;
    const hasStart = ratings.start != null && ratings.start.date !== ratings.date;

    const kpis = [
      {
        key: "avg",
        label: "Note moyenne pondérée",
        value: ratings.average != null ? `${formatDecimal(ratings.average)} / 5` : "—",
        delta: hasStart && ratings.start!.average != null && ratings.average != null ? change(ratings.average, ratings.start!.average) : undefined,
        foot: ratings.date ? `${formatInt(ratings.countryCount)} pays · relevé du ${snapshotLabel}` : "aucun relevé",
        hint: "Moyenne des notes App Store par pays, pondérée par le nombre de notes (iTunes Lookup).",
      },
      {
        key: "count",
        label: "Nombre de notes",
        value: formatInt(ratings.count),
        delta: hasStart ? change(ratings.count, ratings.start!.count) : undefined,
        foot: hasStart ? `vs ${formatInt(ratings.start!.count)} le ${formatDay(ratings.start!.date)}` : ratings.firstDate ? `suivi depuis le ${formatDay(ratings.firstDate)}` : undefined,
        hint: "Notes (avec ou sans texte) sur les storefronts relevés, au dernier relevé.",
      },
      {
        key: "reviews",
        label: "Avis sur la période",
        value: formatInt(reviews.period),
        delta: period.key === "all" ? undefined : change(reviews.period, reviews.prev),
        foot: `${formatInt(reviews.unansweredPeriod)} sans réponse`,
        hint: `Avis écrits (titre + texte) reçus dans App Store Connect sur la période. ${formatInt(reviews.total)} au total.`,
      },
      {
        key: "low",
        label: "Part d'avis 1-2★",
        value: reviews.period > 0 ? formatPct(reviews.low / reviews.period, 0) : "—",
        delta: undefined,
        foot:
          reviews.period > 0
            ? `${formatInt(reviews.low)} sur ${formatInt(reviews.period)}${reviews.prev > 0 ? ` · avant : ${formatPct(reviews.prevLow / reviews.prev, 0)}` : ""}`
            : "aucun avis sur la période",
        hint: "Avis écrits notés 1 ou 2 étoiles, sur la période.",
      },
    ];

    // Trend: one line per app (or the selected app).
    const trendSeries: Series[] = data.trend.apps.map((s) => ({ key: s.appSlug, label: appName(s.appSlug), color: appColor(s.appSlug), values: s.average }));
    const trend = {
      points: data.trend.dates.length,
      x: data.trend.dates,
      series: trendSeries,
      firstDate: data.trend.dates[0] ? formatDay(data.trend.dates[0]) : null,
    };

    // Current rating per app (shown under the trend while it has a single point, and as a summary).
    const perApp = data.trend.apps.map((s) => {
      const last = s.average.length - 1;
      return { appSlug: s.appSlug, average: s.average[last], averageLabel: s.average[last] != null ? formatDecimal(s.average[last]) : "—", count: formatInt(s.count[last] ?? 0) };
    });

    const maxDist = Math.max(0, ...data.distribution.map((d) => d.count));
    const distribution = data.distribution.map((d) => ({
      key: String(d.stars),
      stars: d.stars,
      value: d.count,
      share: reviews.period > 0 ? formatPct(d.count / reviews.period, 0) : "—",
      widthPct: maxDist > 0 && d.count > 0 ? Math.max(1.5, (d.count / maxDist) * 100) : 0,
    }));

    const totalCount = ratings.count;
    const countries = data.countries.map((c) => ({
      key: `${c.appSlug}:${c.country}`,
      appSlug: c.appSlug,
      country: c.country.toUpperCase(),
      countryName: countryName(c.country),
      average: c.average,
      averageLabel: c.average != null ? formatDecimal(c.average) : "—",
      count: c.count > 0 ? formatInt(c.count) : "—",
      share: totalCount > 0 && c.count > 0 ? formatPct(c.count / totalCount, 0) : "—",
      reviewsTotal: formatInt(c.reviewsTotal),
      reviewsPeriod: c.reviewsPeriod > 0 ? formatInt(c.reviewsPeriod) : "—",
    }));

    const syncErrors = [
      data.sync.reviews.error && `App Store Connect : ${data.sync.reviews.error}`,
      data.sync.ratings.error && `iTunes Lookup : ${data.sync.ratings.error}`,
    ].filter(Boolean) as string[];

    return {
      kpis,
      trend,
      perApp,
      distribution,
      reviewsInPeriod: reviews.period,
      countries,
      showAppColumn: app == null,
      neverSynced: data.sync.reviews.lastOkAt == null && data.sync.ratings.lastOkAt == null && reviews.total === 0 && !ratings.date,
      syncErrors,
      reviewsSyncedAt: data.sync.reviews.lastOkAt,
      ratingsSyncedAt: data.sync.ratings.lastOkAt,
      ratingsStorefronts: data.sync.ratings.message,
    };
  }, [data, app, period.key]);

  const feedView = useMemo(() => {
    if (!feed) return null;
    return {
      inPeriod: feed.inPeriod,
      matched: feed.matched,
      hasMore: feed.matched > feed.rows.length,
      rows: feed.rows.map((r) => ({
        ...r,
        country: r.country.toUpperCase(),
        countryName: countryName(r.country),
        date: formatDay(r.createdAt),
        dateLong: formatDayLong(r.createdAt),
      })),
    };
  }, [feed]);

  return {
    loading: data === undefined,
    view,
    periodLabel: period.label.toLowerCase(),
    feed: feedView,
    feedLoading: feed === undefined,
    filters: {
      stars,
      setStars: (s: StarsFilter) => {
        setStars(s);
        setLimit(PAGE);
      },
      unanswered,
      setUnanswered: (u: boolean) => {
        setUnanswered(u);
        setLimit(PAGE);
      },
      showMore: () => setLimit((l) => l + PAGE),
    },
    sync: {
      running: syncing,
      error: syncError,
      run: async () => {
        setSyncing(true);
        setSyncError(null);
        try {
          await refresh({});
        } catch (e) {
          setSyncError(e instanceof Error ? e.message : String(e));
        } finally {
          setSyncing(false);
        }
      },
    },
  };
}

export type ReviewsViewModel = ReturnType<typeof useReviewsViewModel>;
