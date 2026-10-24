import { useMemo, useRef } from "react";
import { api } from "@convex/_generated/api";
import type { summary as summaryQuery } from "@convex/ugc";
import type { RegisteredQuery } from "convex/server";
import { appName } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod, type Period } from "@/lib/filters";
import { change, formatCompact, formatDay, formatDayLong, formatEur, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { BarListItem, ChartData, Status } from "@/ui";

type QueryResult<Q> = Q extends RegisteredQuery<any, any, infer R> ? Awaited<R> : never;
type Summary = QueryResult<typeof summaryQuery>;

export const CPM_LABEL = "calculé (CPM 1,20 $ / 1000 vues, plafond 300 $ par vidéo)";
export const CPM_METHOD = "Méthode : CPM 1,20 $ / 1000 vues (plafond 300 $ par vidéo) ; fixe = montant mensuel saisi dans Airtable, au prorata depuis le début du fixe.";

const STAGE_LABELS: Record<string, { label: string; status: Status }> = {
  Onboarding: { label: "Onboarding", status: "neutral" },
  Trial: { label: "Semaine d'essai", status: "warning" },
  Fixed: { label: "Fixe", status: "good" },
  CPM: { label: "CPM", status: "good" },
  "Floor ($4/video)": { label: "Plancher 4 $/vidéo", status: "good" },
  Paused: { label: "En pause", status: "warning" },
  Ended: { label: "Terminé", status: "critical" },
};

/** Airtable labels carry emojis ("⚪ Pas de réponse"); Solis shows text only. */
function cleanLabel(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || label;
}

function programLabel(program: string | null, fixedMonthlyUsd: number | null): string {
  if (program === "CPM campaign") return "CPM 1,20 $ / 1000 vues";
  if (program === "Creator Program (fixed)") return fixedMonthlyUsd ? `Fixe ${formatInt(fixedMonthlyUsd)} $ / mois` : "Fixe (montant non saisi)";
  return program ?? "—";
}

function per1k(costEur: number | null, views: number): number | null {
  return costEur != null && views > 0 ? (costEur / views) * 1000 : null;
}

function build(data: Summary, bucket: "day" | "week" | "month") {
  const { current: cur, previous: prev, totals, funnel } = data;
  const formatX = bucket === "month" ? formatMonth : formatDay;
  const formatXLong = bucket === "month" ? formatMonthLong : bucket === "week" ? (x: string) => `Semaine du ${formatDay(x)}` : formatDayLong;
  const costPer1k = per1k(cur.costEur, cur.views);
  const prevPer1k = per1k(prev.costEur, prev.views);
  const fxMissing = data.fx == null && cur.costUsd > 0;

  const kpis = [
    {
      key: "creators",
      label: "Créateurs actifs",
      value: formatInt(totals.activeCreators),
      foot: cur.newCreators > 0 ? `+${formatInt(cur.newCreators)} ajoutés sur la période` : "aucun ajout sur la période",
      hint: "Statut Active dans la table Creators d'Airtable (état actuel).",
    },
    {
      key: "videos",
      label: "Vidéos publiées",
      value: formatInt(cur.videos),
      delta: change(cur.videos, prev.videos),
      foot: `${formatInt(cur.creatorsWithVideo)} créateur${cur.creatorsWithVideo > 1 ? "s" : ""} ${cur.creatorsWithVideo > 1 ? "ont" : "a"} publié`,
      hint: "Productions au statut Published, datées par leur date de publication.",
    },
    {
      key: "views",
      label: "Vues totales",
      value: formatCompact(cur.views),
      delta: change(cur.views, prev.views),
      foot: "vues actuelles des vidéos de la période",
      hint: "Champ Views des productions publiées sur la période (compteur cumulé à la dernière mise à jour des stats).",
    },
    {
      key: "cost",
      label: "Coût UGC de la période",
      value: fxMissing ? "—" : formatEur(cur.costEur),
      delta: change(cur.costEur ?? 0, prev.costEur),
      invertDelta: true,
      foot: fxMissing ? "taux USD → EUR manquant" : "calculé, voir le détail",
      hint: `CPM : ${CPM_LABEL}. Fixe : montant mensuel saisi dans Airtable, à partir de la date Fixed start.`,
    },
    {
      key: "cpm",
      label: "Coût pour 1000 vues",
      value: costPer1k != null ? formatEur(costPer1k, { decimals: true }) : "—",
      delta: costPer1k != null ? change(costPer1k, prevPer1k) : undefined,
      invertDelta: true,
      foot: cur.views > 0 ? "coût de la période / vues" : "aucune vue sur la période",
    },
  ];

  const viewsChart: ChartData = {
    x: data.viewsSeries.map((p) => p.x),
    series: [{ key: "views", label: "Vues", color: "var(--series-1)", values: data.viewsSeries.map((p) => p.views) }],
  };

  const applicationsChart: ChartData = {
    x: data.applicationsSeries.map((p) => p.x),
    series: [
      { key: "cpm", label: "Campagne CPM", color: "var(--series-4)", values: data.applicationsSeries.map((p) => p.cpm) },
      { key: "fixed", label: "Programme fixe", color: "var(--series-5)", values: data.applicationsSeries.map((p) => p.fixed) },
      ...(data.applicationsSeries.some((p) => p.other > 0)
        ? [{ key: "other", label: "Autre", color: "var(--series-other)", values: data.applicationsSeries.map((p) => p.other) }]
        : []),
    ],
  };

  const rate = (n: number, d: number) => (d > 0 ? ` · ${formatPct(n / d, 0)}` : "");
  const funnelItems: BarListItem[] = [
    { key: "contacted", label: "Contactés", value: funnel.contacted, color: "var(--series-1)", hint: "Table Outreach, date du premier contact" },
    { key: "replied", label: `Ont répondu${rate(funnel.replied, funnel.contacted)}`, value: funnel.replied, color: "var(--series-1)", hint: "Contacts avec une date de dernière réponse" },
    { key: "applied", label: `Candidatures${rate(funnel.applied, funnel.contacted)}`, value: funnel.applied, color: "var(--series-1)", hint: "Table Creator applications (formulaire Tally)" },
    { key: "creators", label: `Créateurs ajoutés${rate(funnel.creators, funnel.applied)}`, value: funnel.creators, color: "var(--series-1)", hint: "Fiches créées dans la table Creators" },
    { key: "published", label: `Ont publié${rate(funnel.withVideo, funnel.creators)}`, value: funnel.withVideo, color: "var(--series-1)", hint: "Au moins une production Published sur la période" },
  ];

  const replyItems: BarListItem[] = data.outreachLabels.map((l) => ({ key: l.label, label: cleanLabel(l.label), value: l.count, color: "var(--series-4)" }));

  const stageSummary = data.stages.map((s) => `${formatInt(s.count)} ${STAGE_LABELS[s.stage]?.label ?? s.stage}`).join(" · ");

  const creators = [...data.creators]
    .sort((a, b) => b.views - a.views || b.videos - a.videos || (b.joined ?? "").localeCompare(a.joined ?? "") || a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle ? `@${c.handle}` : null,
      url: c.tiktokUrl ? (c.tiktokUrl.startsWith("http") ? c.tiktokUrl : `https://${c.tiktokUrl}`) : null,
      deal: programLabel(c.program, c.fixedMonthlyUsd),
      stage: c.stage ? (STAGE_LABELS[c.stage] ?? { label: c.stage, status: "neutral" as Status }) : null,
      inactive: c.status !== "Active",
      statusLabel: c.status === "Onboarding" ? "Statut onboarding" : c.status && c.status !== "Active" ? c.status : null,
      joined: c.joined ? formatDay(c.joined) : "—",
      videos: formatInt(c.videos),
      views: formatInt(c.views),
      cost: c.costEur != null ? formatEur(c.costEur) : "—",
      per1k: (() => {
        const v = per1k(c.costEur, c.views);
        return v != null ? formatEur(v, { decimals: true }) : "—";
      })(),
    }));

  const topVideos = data.topVideos.map((vid) => ({
    id: vid.id,
    label: vid.label ?? "Vidéo sans titre",
    url: vid.url,
    creator: vid.creator ?? "—",
    platform: vid.platform ?? "—",
    posted: formatDay(vid.postedAt),
    views: formatInt(vid.views),
    cost: vid.costEur != null ? formatEur(vid.costEur) : "—",
    costNote: vid.costKind === "cpm" ? "calculé CPM" : vid.costKind === "recorded" ? "saisi Airtable" : "inclus dans le fixe",
  }));

  const costBreakdown = [
    { key: "cpm", label: "CPM (calculé)", usd: cur.cpmUsd },
    { key: "fixed", label: "Fixe (montants saisis)", usd: cur.fixedUsd },
    { key: "recorded", label: "Coûts saisis par vidéo", usd: cur.recordedUsd },
  ];

  const snapshotDay = data.source.lastOkAt ? new Date(data.source.lastOkAt).toISOString().slice(0, 10) : null;
  const sourceLabel = data.source.isSnapshot
    ? `Snapshot Airtable du ${snapshotDay ? formatDayLong(snapshotDay) : "?"} (synchro auto en attente : ${data.source.lastRunMessage ?? "AIRTABLE_TOKEN manquant"})`
    : `API Airtable · base UGC CortiFree`;
  const fxNote = data.fx ? `Montants USD convertis en euros au taux du ${formatDayLong(data.fx.date)}` : null;

  return {
    kpis,
    viewsChart,
    hasViews: cur.videos > 0,
    productionsTotal: totals.productions,
    applicationsChart,
    hasApplications: funnel.applied > 0,
    funnelItems,
    hasFunnel: funnel.contacted + funnel.applied + funnel.creators > 0,
    replyItems,
    contacted: funnel.contacted,
    stageSummary,
    creators,
    creatorsCount: totals.creators,
    topVideos,
    costBreakdown: costBreakdown.map((c) => ({ ...c, value: data.fx ? formatEur(c.usd / data.fx.usdPerEur) : "—" })),
    formatX,
    formatXLong,
    sourceLabel,
    snapshotBadge: data.source.isSnapshot && snapshotDay ? `Snapshot du ${formatDay(snapshotDay)}` : null,
    fxNote,
    updatedAt: data.source.lastOkAt,
  };
}

export function useUgcViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const otherApp = app != null && app !== "cortifree";
  const data = useSolisQuery(
    api.ugc.summary,
    otherApp ? "skip" : { from: period.from, to: period.to, prevFrom: period.prevFrom, prevTo: period.prevTo, bucket: period.bucket },
  ) as Summary | undefined;

  // Keep the previous result on screen while a new period loads (no skeleton flash on filter changes).
  const last = useRef<{ data: Summary; bucket: Period["bucket"]; label: string } | null>(null);
  if (data !== undefined) last.current = { data, bucket: period.bucket, label: period.label };
  const shown = last.current;

  const view = useMemo(() => (shown && shown.data.hasData ? build(shown.data, shown.bucket) : null), [shown?.data, shown?.bucket]);

  return {
    periodLabel: (shown?.label ?? period.label).toLowerCase(),
    otherAppName: otherApp ? appName(app) : null,
    loading: !otherApp && !shown,
    refreshing: !otherApp && data === undefined && !!shown,
    notConnected: !!shown && !shown.data.hasData,
    view,
    formatViews: formatCompact,
    formatCount: formatInt,
  };
}
