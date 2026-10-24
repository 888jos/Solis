import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { APPS, appColor, appName, type AppSlug } from "@/lib/apps";
import { useSolisMutation, useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { formatDay, formatDayLong, formatInt } from "@/lib/format";
import { charCount, duplicatedWords, keywordEntries, LIMITS, localeIssues, rankBucket, rankMove, type FieldKey, type Issue, type RankMove } from "./asoRules";

const STATE_LABELS: Record<string, string> = {
  READY_FOR_DISTRIBUTION: "en ligne",
  READY_FOR_SALE: "en ligne",
  PREPARE_FOR_SUBMISSION: "en préparation",
  WAITING_FOR_REVIEW: "en attente de review",
  IN_REVIEW: "en review",
  PENDING_DEVELOPER_RELEASE: "validée, à publier",
  PENDING_APPLE_RELEASE: "validée, publication Apple",
  ACCEPTED: "acceptée",
  REJECTED: "rejetée",
  METADATA_REJECTED: "métadonnées rejetées",
  DEVELOPER_REJECTED: "retirée de la review",
  INVALID_BINARY: "binaire invalide",
  PROCESSING_FOR_DISTRIBUTION: "en traitement",
};

const ROWS_PREVIEW = 25;

export const TRACK_COUNTRIES = ["us", "fr", "de", "es", "it", "gb", "ca", "au", "jp", "kr", "br", "nl", "se", "ch", "be"];

const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });
const languageNames = new Intl.DisplayNames(["fr"], { type: "language" });

export function countryLabel(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function localeLabel(locale: string): string {
  try {
    const label = languageNames.of(locale) ?? locale;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return locale;
  }
}

const LOCALE_ORDER = ["en-US", "fr-FR", "de-DE", "es-ES", "ja", "ko"];
const localeSort = (a: string, b: string) => {
  const ia = LOCALE_ORDER.indexOf(a);
  const ib = LOCALE_ORDER.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  return localeLabel(a).localeCompare(localeLabel(b), "fr");
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type Counter = { key: FieldKey; used: number; limit: number; ratio: number; over: boolean };

export type LocaleVM = {
  locale: string;
  label: string;
  counters: Counter[];
  issues: Issue[];
  warningCount: number;
  name: string;
  subtitle: string;
  promotionalText: string;
  keywordChips: { text: string; duplicate: boolean }[];
  descriptionLength: number | null;
};

export type AppMetaVM = {
  slug: AppSlug;
  name: string;
  channel: "live" | "draft";
  channels: { value: "live" | "draft"; label: string }[];
  setChannel: (c: "live" | "draft") => void;
  versionLabel: string;
  locales: LocaleVM[];
  selected: LocaleVM | null;
  selectLocale: (locale: string) => void;
  issueCount: number;
  /** Warnings on the version customers see (live, or the first draft when nothing is live). */
  shippedIssueCount: number;
};

export type KeywordRowVM = {
  id: Id<"asoKeywords">;
  appSlug: AppSlug;
  keyword: string;
  country: string;
  countryName: string;
  rank: number | null;
  measured: boolean;
  rankLabel: string;
  move: RankMove;
  topCompetitor: string | null;
  manual: boolean;
  selected: boolean;
  select: () => void;
};

export function useAsoViewModel() {
  const app = useAppFilter();
  const period = usePeriod();
  const meta = useSolisQuery(api.aso.metadata, { app });
  const kw = useSolisQuery(api.aso.keywords, { app });
  const addKeywordMut = useSolisMutation(api.aso.addKeyword);
  const removeKeywordMut = useSolisMutation(api.aso.removeKeyword);
  const refreshMut = useSolisMutation(api.aso.refresh);

  const [channelByApp, setChannelByApp] = useState<Record<string, "live" | "draft">>({});
  const [localeByApp, setLocaleByApp] = useState<Record<string, string>>({});
  const [country, setCountry] = useState<string>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "pending" | "started" | "busy">("idle");

  /* ---------- Metadata ---------- */
  const apps: AppMetaVM[] = useMemo(() => {
    if (!meta) return [];
    return APPS.filter((a) => !app || a.slug === app)
      .map((a) => {
        const rows = meta.rows.filter((r) => r.appSlug === a.slug);
        const hasLive = rows.some((r) => r.channel === "live");
        const hasDraft = rows.some((r) => r.channel === "draft");
        const wanted = channelByApp[a.slug] ?? (hasLive ? "live" : "draft");
        const channel: "live" | "draft" = wanted === "draft" && hasDraft ? "draft" : hasLive ? "live" : "draft";
        const current = rows.filter((r) => (r.channel ?? "live") === channel).sort((x, y) => localeSort(x.locale, y.locale));
        const versionOf = (c: "live" | "draft") => rows.find((r) => r.channel === c);
        const channels: AppMetaVM["channels"] = [];
        if (hasLive) channels.push({ value: "live", label: `En ligne · v${versionOf("live")?.versionString ?? "?"}` });
        if (hasDraft) channels.push({ value: "draft", label: `Prochaine · v${versionOf("draft")?.versionString ?? "?"}` });
        const v = versionOf(channel);
        const locales: LocaleVM[] = current.map((r) => {
          const fields: Record<FieldKey, string | undefined> = { name: r.name, subtitle: r.subtitle, keywords: r.keywords, promo: r.promotionalText };
          const counters = (Object.keys(LIMITS) as FieldKey[]).map((key) => {
            const used = charCount(fields[key]);
            return { key, used, limit: LIMITS[key], ratio: Math.min(1, used / LIMITS[key]), over: used > LIMITS[key] };
          });
          const issues = localeIssues(r);
          const dup = duplicatedWords(r);
          const dupSet = new Set([...dup.inTitle, ...dup.repeated]);
          return {
            locale: r.locale,
            label: localeLabel(r.locale),
            counters,
            issues,
            warningCount: issues.filter((i) => i.severity !== "neutral").length,
            name: r.name ?? "",
            subtitle: r.subtitle ?? "",
            promotionalText: r.promotionalText ?? "",
            keywordChips: keywordEntries(r.keywords).map((text) => ({
              text,
              duplicate: text
                .toLowerCase()
                .split(/[^\p{L}\p{N}]+/u)
                .some((w) => dupSet.has(w)),
            })),
            descriptionLength: r.descriptionLength ?? null,
          };
        });
        const selectedLocale = localeByApp[a.slug];
        return {
          slug: a.slug,
          name: a.name,
          channel,
          channels,
          setChannel: (c: "live" | "draft") => setChannelByApp((prev) => ({ ...prev, [a.slug]: c })),
          versionLabel: v ? `v${v.versionString ?? "?"} · ${STATE_LABELS[v.versionState ?? ""] ?? (v.versionState ?? "").toLowerCase().replace(/_/g, " ")}` : "",
          locales,
          selected: locales.find((l) => l.locale === selectedLocale) ?? locales[0] ?? null,
          selectLocale: (locale: string) => setLocaleByApp((prev) => ({ ...prev, [a.slug]: locale })),
          issueCount: locales.reduce((n, l) => n + l.warningCount, 0),
          shippedIssueCount: rows
            .filter((r) => (r.channel ?? "live") === (hasLive ? "live" : "draft"))
            .reduce((n, r) => n + localeIssues(r).filter((i) => i.severity !== "neutral").length, 0),
        };
      })
      .filter((a) => a.locales.length > 0);
  }, [meta, app, channelByApp, localeByApp]);

  /* ---------- Keywords ---------- */
  const allRows = kw?.rows ?? [];
  const countries = useMemo(() => [...new Set(allRows.map((r) => r.country))].sort((a, b) => TRACK_COUNTRIES.indexOf(a) - TRACK_COUNTRIES.indexOf(b)), [allRows]);
  const activeCountry = country !== "all" && countries.includes(country) ? country : "all";

  const keyOf = (r: { appSlug: string; keyword: string; country: string }) => `${r.appSlug}|${r.country}|${r.keyword}`;
  const filtered = allRows.filter((r) => activeCountry === "all" || r.country === activeCountry);
  const sorted = [...filtered].sort((a, b) => {
    const ra = a.measured ? (a.rank ?? 1000) : 2000;
    const rb = b.measured ? (b.rank ?? 1000) : 2000;
    return ra - rb || a.keyword.localeCompare(b.keyword, "fr");
  });
  const defaultKey = sorted.length ? keyOf(sorted[0]) : null;
  const selectedRow = allRows.find((r) => keyOf(r) === selectedKey) ?? sorted.find((r) => keyOf(r) === defaultKey) ?? null;

  const keywordRows: KeywordRowVM[] = sorted.map((r) => ({
    id: r.id,
    appSlug: r.appSlug as AppSlug,
    keyword: r.keyword,
    country: r.country,
    countryName: countryLabel(r.country),
    rank: r.rank,
    measured: r.measured,
    rankLabel: !r.measured ? "pas encore mesuré" : r.rank == null ? "hors top 200" : `#${r.rank}`,
    move: rankMove(r.rank, r.measured, r.prevRank, r.prevMeasured),
    topCompetitor: r.topCompetitor,
    manual: r.source === "manual",
    selected: selectedRow != null && keyOf(r) === keyOf(selectedRow),
    select: () => setSelectedKey(keyOf(r)),
  }));

  const measured = filtered.filter((r) => r.measured);
  const moves = filtered.map((r) => rankMove(r.rank, r.measured, r.prevRank, r.prevMeasured));
  const kpis = {
    tracked: filtered.length,
    countries: new Set(filtered.map((r) => r.country)).size,
    measured: measured.length,
    ranked: measured.filter((r) => r.rank != null).length,
    top10: measured.filter((r) => r.rank != null && r.rank <= 10).length,
    up: moves.filter((m) => m.kind === "up" || m.kind === "entered").length,
    down: moves.filter((m) => m.kind === "down" || m.kind === "left").length,
    comparable: moves.filter((m) => m.kind !== "none" && m.kind !== "new").length,
    issues: apps.reduce((n, a) => n + a.shippedIssueCount, 0),
  };

  const bucketLabels = { top10: "Top 10", top50: "11 à 50", top200: "51 à 200", absent: "Hors top 200" } as const;
  const distribution = (Object.keys(bucketLabels) as (keyof typeof bucketLabels)[]).map((bucket) => ({
    key: bucket,
    label: bucketLabels[bucket],
    value: measured.filter((r) => rankBucket(r.rank) === bucket).length,
    color: bucket === "absent" ? "var(--series-other)" : "var(--series-7)",
  }));
  const distributionByApp = APPS.filter((a) => !app || a.slug === app)
    .map((a) => {
      const rows = measured.filter((r) => r.appSlug === a.slug);
      return { key: a.slug, label: a.name, value: rows.filter((r) => r.rank != null).length, color: appColor(a.slug), hint: `${rows.length} mesurés` };
    })
    .filter((x) => measured.some((r) => r.appSlug === x.key));

  /* ---------- History of the selected keyword ---------- */
  const today = todayIso();
  const history = useSolisQuery(
    api.aso.history,
    selectedRow ? { appSlug: selectedRow.appSlug, keyword: selectedRow.keyword, country: selectedRow.country, from: period.from, to: today } : "skip",
  );
  const chart = useMemo(() => {
    if (!selectedRow) return null;
    if (!history) return { loading: true as const };
    const first = history[0]?.date;
    if (!first) return { loading: false as const, empty: true as const, title: selectedRow.keyword, country: countryLabel(selectedRow.country) };
    const x: string[] = [];
    for (let d = first < period.from ? period.from : first; d <= today; d = addDays(d, 1)) x.push(d);
    const byDate = new Map(history.map((h) => [h.date, h.rank]));
    const ranks = history.filter((h) => h.rank != null).map((h) => h.rank as number);
    const absentDays = history.filter((h) => h.rank == null).length;
    return {
      loading: false as const,
      empty: false as const,
      title: selectedRow.keyword,
      country: countryLabel(selectedRow.country),
      appSlug: selectedRow.appSlug as AppSlug,
      x,
      series: [{ key: "rank", label: `Rang · ${appName(selectedRow.appSlug)}`, color: appColor(selectedRow.appSlug), values: x.map((d) => byDate.get(d) ?? null) }],
      facts: [
        { label: "Rang actuel", value: selectedRow.measured ? (selectedRow.rank == null ? "hors top 200" : `#${selectedRow.rank}`) : "—" },
        { label: "Meilleur rang", value: ranks.length ? `#${Math.min(...ranks)}` : "—" },
        { label: "Jours mesurés", value: formatInt(history.length) },
        { label: "Jours hors top 200", value: formatInt(absentDays) },
      ],
      topCompetitor: selectedRow.topCompetitor,
      /** A line needs two ranked days. */
      drawable: x.filter((d) => byDate.get(d) != null).length >= 2,
      notDrawable: ranks.length === 0 ? "Hors top 200 sur tous les jours mesurés de la période." : "Un seul jour dans le top 200 pour l'instant : la courbe apparaît au deuxième.",
      formatValue: (v: number) => (v < 1 ? "" : `#${formatInt(v)}`),
      formatX: formatDay,
      formatXLong: formatDayLong,
    };
  }, [selectedRow, history, period.from, today]);

  /* ---------- Actions ---------- */
  const addKeyword = async (appSlug: AppSlug, keyword: string, countryCode: string): Promise<string | null> => {
    try {
      const res = await addKeywordMut({ appSlug, keyword, country: countryCode });
      if (!res.created) return "Ce mot-clé est déjà suivi dans ce pays.";
      setSelectedKey(`${appSlug}|${countryCode}|${keyword.trim().replace(/\s+/g, " ").toLowerCase()}`);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.replace(/^.*Uncaught Error: /s, "").split("\n")[0] || "Ajout impossible.";
    }
  };
  const removeKeyword = (id: Id<"asoKeywords">) => removeKeywordMut({ id });
  const refresh = async () => {
    setRefreshState("pending");
    try {
      const res = await refreshMut({});
      setRefreshState(res.started ? "started" : "busy");
    } catch {
      setRefreshState("idle");
      return;
    }
    window.setTimeout(() => setRefreshState("idle"), 5000);
  };

  const ranksSync = kw?.sync ?? null;
  const metaSync = meta?.sync ?? null;
  return {
    loading: meta === undefined || kw === undefined,
    appFilter: app,
    periodLabel: period.label,
    hasMetadata: (meta?.rows.length ?? 0) > 0,
    metaSync,
    metaError: metaSync?.status === "error" ? metaSync.message : null,
    ranksSync,
    ranksRunning: ranksSync?.status === "running",
    ranksError: ranksSync?.status === "error" ? ranksSync.message : null,
    apps,
    kpis,
    distribution,
    distributionByApp,
    countryFilter: {
      value: activeCountry,
      options: [{ value: "all", label: "Tous" }, ...countries.map((c) => ({ value: c, label: c.toUpperCase() }))],
      set: setCountry,
    },
    keywordRows: showAll ? keywordRows : keywordRows.slice(0, ROWS_PREVIEW),
    keywordMore: keywordRows.length > ROWS_PREVIEW ? { showAll, hidden: keywordRows.length - ROWS_PREVIEW, total: keywordRows.length, toggle: () => setShowAll((x) => !x) } : null,
    chart,
    addForm: {
      apps: APPS.filter((a) => !app || a.slug === app).map((a) => ({ value: a.slug, label: a.name })),
      countries: TRACK_COUNTRIES.map((c) => ({ value: c, label: `${c.toUpperCase()} · ${countryLabel(c)}` })),
      defaultCountry: activeCountry === "all" ? "us" : activeCountry,
      submit: addKeyword,
    },
    removeKeyword,
    refresh,
    refreshState,
    lastMeasured: allRows.reduce<string | null>((max, r) => (r.date && (!max || r.date > max) ? r.date : max), null),
  };
}

export type AsoViewModel = ReturnType<typeof useAsoViewModel>;
