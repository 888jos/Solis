import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { appColor, appName } from "@/lib/apps";
import { useSolisMutation, useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatCompact, formatDay, formatDayLong, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { Series } from "@/ui";

// Page Performance: views, posts and engagement of every social account (Post for Me), the videos with a
// preview, and installs / reports on the same days. Filters live in the URL (proj, plat, acc, mode).

export const PROJECTS = [
  { value: "all", label: "Tous" },
  { value: "otto", label: "Otto" },
  { value: "cortifree", label: "CortiFree" },
  { value: "questirl", label: "Quest IRL" },
] as const;

const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", x: "X", threads: "Threads" };
const PLATFORM_COLOR: Record<string, string> = { tiktok: "var(--series-1)", instagram: "var(--series-2)", facebook: "var(--series-3)", youtube: "var(--series-5)", x: "var(--series-6)", threads: "var(--series-7)" };
export const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? p;

/** Embeddable player for a post (works without the media URL, which can expire). */
export function embedUrl(platform: string, postId: string, url: string | null): string | null {
  if (platform === "tiktok" && /^\d+$/.test(postId)) return `https://www.tiktok.com/player/v1/${postId}?music_info=1&description=1`;
  if (platform === "instagram" && url) {
    const m = /instagram\.com\/(reel|p|tv)\/([^/?#]+)/.exec(url);
    if (m) return `https://www.instagram.com/${m[1]}/${m[2]}/embed`;
  }
  if (platform === "youtube" && url) {
    const m = /(?:shorts\/|v=|youtu\.be\/)([\w-]{6,})/.exec(url);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
  }
  return null;
}

function correlationWords(r: number | null): string {
  if (r == null) return "pas assez de jours pour le dire";
  const a = Math.abs(r);
  const strength = a >= 0.6 ? "forte" : a >= 0.3 ? "moyenne" : a >= 0.1 ? "faible" : "aucune";
  return `${strength} (r = ${r.toLocaleString("fr-FR")})`;
}

export function usePerformanceViewModel() {
  const [params, setParams] = useSearchParams();
  const period = usePeriod();
  const globalApp = useAppFilter();
  const project = (params.get("proj") ?? globalApp ?? "all") as string;
  const platform = params.get("plat") ?? "all";
  const account = params.get("acc") ?? "all";
  const mode = (params.get("mode") === "posted" ? "posted" : "gained") as "gained" | "posted";
  const [preview, setPreview] = useState<string | null>(null);
  const setAccountProject = useSolisMutation(api.marketingData.setAccountProject);

  const set = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null || value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    });

  const data = useSolisQuery(api.marketing.overview, {
    from: period.from,
    to: period.to,
    prevFrom: period.prevFrom,
    prevTo: period.prevTo,
    bucket: period.bucket,
    project: project === "all" ? null : project,
    platform: platform === "all" ? null : platform,
    account: account === "all" ? null : account,
    mode,
  });

  const formatX = (x: string) => (period.bucket === "month" ? formatMonth(x) : formatDay(x));
  const formatXLong = (x: string) => (period.bucket === "month" ? formatMonthLong(x) : period.bucket === "week" ? `Semaine du ${formatDay(x)}` : formatDayLong(x));

  const filters = {
    project,
    projects: PROJECTS.map((p) => ({ value: p.value, label: p.label })),
    onProject: (v: string) => {
      set("proj", v);
      set("acc", null);
    },
    platform,
    platforms: [{ value: "all", label: "Toutes" }, ...(data?.platforms ?? []).map((p) => ({ value: p, label: platformLabel(p) }))],
    onPlatform: (v: string) => set("plat", v),
    account,
    accounts: [{ value: "all", label: "Tous les comptes" }, ...(data?.allAccounts ?? []).filter((a) => project === "all" || a.project === project).map((a) => ({ value: a.pfmId, label: `@${a.username} · ${platformLabel(a.platform)}` }))],
    onAccount: (v: string) => set("acc", v),
    mode,
    modes: [
      { value: "gained" as const, label: "Vues gagnées par jour" },
      { value: "posted" as const, label: "Par date de publication" },
    ],
    onMode: (m: "gained" | "posted") => set("mode", m === "gained" ? null : m),
  };

  if (!data) return { loading: true as const, filters, periodLabel: period.label };

  const t = data.totals;
  const p = data.prevTotals;
  const eng = (x: typeof t) => (x.views ? (x.likes + x.comments + x.shares) / x.views : null);
  const kpis = [
    { key: "views", label: mode === "gained" ? "Vues gagnées" : "Vues des vidéos publiées", value: formatInt(t.views), delta: change(t.views, p.views), foot: `préc. ${formatInt(p.views)}` },
    { key: "posts", label: "Vidéos publiées", value: formatInt(data.posts), delta: change(data.posts, data.prevPosts), foot: `préc. ${formatInt(data.prevPosts)}` },
    { key: "median", label: "Vues médianes / vidéo", value: formatInt(data.medianViews), delta: change(data.medianViews, data.prevMedianViews), foot: `préc. ${formatInt(data.prevMedianViews)}` },
    { key: "eng", label: "Taux d'engagement", value: formatPct(eng(t)), delta: null, foot: `préc. ${formatPct(eng(p))} · likes + comm. + partages / vues` },
    { key: "comments", label: "Commentaires", value: formatInt(t.comments), delta: change(t.comments, p.comments), foot: t.views ? `${formatInt(Math.round((t.comments / t.views) * 1000 * 10) / 10)} pour 1 000 vues` : "" },
    { key: "shares", label: "Partages", value: formatInt(t.shares), delta: change(t.shares, p.shares), foot: `${formatInt(t.likes)} likes` },
    { key: "viral", label: "Vidéos > 10 k vues", value: formatInt(data.viral), delta: null, foot: `${formatInt(data.over1k)} au-dessus de 1 000` },
  ];

  const viewsChart: Series[] = data.byPlatform.map((b) => ({ key: b.key, label: platformLabel(b.key), color: PLATFORM_COLOR[b.key] ?? "var(--series-other)", values: b.values }));
  const postsChart: Series[] = [{ key: "posts", label: "Vidéos publiées", color: "var(--series-4)", values: data.postsSeries }];
  const outcomeColor = project !== "all" ? appColor(project) : "var(--series-7)";
  const outcomeChart: Series[] = [{ key: "outcome", label: data.outcome.label, color: outcomeColor, values: data.outcome.series }];

  const top = data.top.map((v) => ({
    ...v,
    key: v.postId,
    platformName: platformLabel(v.platform),
    projectName: v.project ? appName(v.project) : "Non attribué",
    date: formatDay(new Date(v.postedAt).toISOString().slice(0, 10)),
    viewsLabel: formatCompact(v.views),
    engagementLabel: formatPct(v.engagement),
    embed: embedUrl(v.platform, v.postId, v.url),
    open: () => setPreview(v.postId),
  }));
  const previewItem = top.find((v) => v.postId === preview) ?? null;

  const accounts = data.accounts.map((a) => ({
    ...a,
    id: a.id as Id<"socialAccounts">,
    platformName: platformLabel(a.platform),
    viewsLabel: formatInt(a.views),
    medianLabel: formatInt(a.medianViews),
    bestLabel: formatInt(a.best),
    engagementLabel: formatPct(a.engagement),
    onProject: (v: string) => setAccountProject({ id: a.id as Id<"socialAccounts">, project: v === "none" ? null : (v as "otto" | "cortifree" | "questirl") }),
  }));

  return {
    loading: false as const,
    filters,
    periodLabel: period.label,
    connected: data.connected,
    lastSync: data.lastSync,
    trackingSince: data.trackingSince ? formatDayLong(data.trackingSince) : null,
    subtitle: `${period.label} · ${PROJECTS.find((p) => p.value === project)?.label ?? project} · ${data.allAccounts.length} comptes Post for Me`,
    kpis,
    x: data.x,
    formatX,
    formatXLong,
    viewsChart,
    postsChart,
    outcome: {
      label: data.outcome.label,
      chart: outcomeChart,
      total: formatInt(data.outcome.total),
      perThousand: data.outcome.perThousandViews == null ? "—" : data.outcome.perThousandViews.toLocaleString("fr-FR"),
      sameDay: correlationWords(data.outcome.sameDay),
      nextDay: correlationWords(data.outcome.nextDay),
      viewsChart: [{ key: "views", label: "Vues", color: "var(--series-1)", values: data.viewsSeries }] as Series[],
    },
    top,
    preview: previewItem,
    closePreview: () => setPreview(null),
    accounts,
    unassigned: data.unassigned,
    projectOptions: [{ value: "none", label: "À attribuer" }, ...PROJECTS.filter((p) => p.value !== "all").map((p) => ({ value: p.value, label: p.label }))],
  };
}

export type PerformanceViewModel = Extract<ReturnType<typeof usePerformanceViewModel>, { loading: false }>;
