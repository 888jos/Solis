import { api } from "@convex/_generated/api";
import { useSearchParams } from "react-router-dom";
import { useSolisQuery } from "@/lib/convex";
import { change, formatEur, formatInt, formatPct } from "@/lib/format";

export const RANGES = [
  { value: "7", label: "7 j" },
  { value: "30", label: "30 j" },
  { value: "90", label: "90 j" },
  { value: "0", label: "Tout" },
] as const;
export type RangeKey = (typeof RANGES)[number]["value"];

const STATUS: Record<string, string> = { a_valider: "À valider", validee: "Validées", a_retoucher: "À retoucher", refusee: "Refusées" };
const STATUS_ORDER = ["a_valider", "validee", "a_retoucher", "refusee"];
function offerLabel(offer: string): string {
  const price = offer.match(/_(\d{3,4})$/)?.[1];
  const base = offer.startsWith("single") ? "Dossier" : offer;
  return price ? `${base} ${(Number(price) / 100).toFixed(2).replace(".", ",")} €` : base;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: value < 100 ? 2 : 0 }).format(value);
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Page-level ViewModel for Projets > Otto (ottoknows.it): business, videos and the Mac-side pipeline. */
export function useOttoViewModel() {
  const [params, setParams] = useSearchParams();
  const rp = params.get("periode");
  const range: RangeKey = RANGES.some((r) => r.value === rp) ? (rp as RangeKey) : "30";
  const setRange = (r: RangeKey) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (r === "30") p.delete("periode");
      else p.set("periode", r);
      return p;
    });

  const data = useSolisQuery(api.otto.summary, { days: Number(range) });
  if (!data) return { loading: true as const, range, setRange };

  const c = data.current;
  const p = data.previous;
  const conv = ratio(c.paid, c.reports);
  const prevConv = p ? ratio(p.paid, p.reports) : null;
  const aiUsd = c.aiCostMicroUsd / 1e6;
  const usdPerEur = data.usdPerEur;
  const toEur = (microUsd: number) => (usdPerEur ? microUsd / 1e6 / usdPerEur : null);
  const aiEur = toEur(c.aiCostMicroUsd);
  const margin = aiEur == null ? null : c.revenueCents / 100 - aiEur;
  const prevMargin = p && usdPerEur ? p.revenueCents / 100 - (toEur(p.aiCostMicroUsd) ?? 0) : null;
  const rangeLabel = range === "0" ? "depuis le lancement" : `${range} derniers jours`;

  const kpis = [
    { label: "Rapports générés", value: formatInt(c.reports), delta: p ? change(c.reports, p.reports) : undefined },
    { label: "Paiements", value: formatInt(c.paid), delta: p ? change(c.paid, p.paid) : undefined },
    {
      label: "Conversion",
      value: conv == null ? "—" : formatPct(conv, 1),
      delta: p && conv != null && prevConv != null ? change(conv, prevConv) : undefined,
      foot: "paiements / rapports",
    },
    { label: "Revenu", value: formatEur(c.revenueCents / 100), delta: p ? change(c.revenueCents, p.revenueCents) : undefined, foot: "encaissé (EUR)" },
    {
      label: "Coût IA",
      value: aiEur == null ? formatUsd(aiUsd) : formatEur(aiEur),
      delta: p ? change(c.aiCostMicroUsd, p.aiCostMicroUsd) : undefined,
      invertDelta: true,
      foot: c.reports ? `${formatUsd(aiUsd / c.reports)} / rapport` : undefined,
      hint: aiEur == null ? undefined : `${formatUsd(aiUsd)} facturés, convertis au dernier taux du jour`,
    },
    {
      label: "Marge",
      value: margin == null ? "—" : formatEur(margin),
      delta: p && margin != null && prevMargin ? change(margin, prevMargin) : undefined,
      foot: "revenu − coût IA",
    },
  ];

  const funnel = {
    x: data.x,
    series: [
      { key: "reports", label: "Rapports", color: "var(--series-4)", values: data.series.reports },
      { key: "paid", label: "Paiements", color: "var(--series-6)", values: data.series.paid },
    ],
  };
  const money = {
    x: data.x,
    series: [
      { key: "revenue", label: "Revenu", color: "var(--series-6)", values: data.series.revenueCents.map((v) => v / 100) },
      { key: "ai", label: "Coût IA", color: "var(--series-8)", values: data.series.aiCostMicroUsd.map((v) => toEur(v) ?? v / 1e6) },
    ],
  };

  const v = data.videoTotals;
  const videoKpis = [
    { label: "Vidéos publiées", value: formatInt(v.posts), foot: rangeLabel },
    { label: "Vues", value: formatInt(v.views), foot: "dernier relevé" },
    { label: "Vues médianes", value: formatInt(v.medianViews), foot: "par vidéo" },
    { label: "Commentaires", value: formatInt(v.comments), foot: v.views ? `${formatInt(v.likes)} likes` : undefined },
  ];
  const maxViews = Math.max(1, ...data.accounts.map((a) => a.views));
  const accounts = data.accounts.map((a) => ({ ...a, share: a.views / maxViews }));

  const statuses = STATUS_ORDER.filter((s) => data.validation.some((x) => x.status === s));
  const validationAccounts = [...new Set(data.validation.map((x) => x.account))].sort();
  const validationRows = validationAccounts.map((account) => ({
    account,
    counts: Object.fromEntries(statuses.map((s) => [s, data.validation.find((x) => x.account === account && x.status === s)?.count ?? 0])),
  }));
  const validationTotals = Object.fromEntries(statuses.map((s) => [s, data.validation.filter((x) => x.status === s).reduce((t, x) => t + x.count, 0)]));

  return {
    loading: false as const,
    range,
    setRange,
    connected: data.connected,
    rangeLabel,
    kpis,
    funnel,
    money,
    moneyUnit: usdPerEur ? "€" : "$",
    videoKpis,
    accounts,
    top: data.top,
    validation: { statuses: statuses.map((s) => ({ key: s, label: STATUS[s] ?? s })), rows: validationRows, totals: validationTotals },
    offers: data.offers.map((o) => ({ ...o, label: offerLabel(o.offer), eur: formatEur(o.eurCents / 100) })),
    syncedAt: data.syncedAt,
    lastRun: data.lastRun,
  };
}
