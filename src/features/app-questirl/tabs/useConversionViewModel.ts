import { useMemo, useState } from "react";
import { formatInt, pct100 } from "../format";
import type { KpiItem, QuestirlSummary, SegmentRow } from "../types";

export const DIMENSIONS = [
  { value: "languages", label: "Langue" },
  { value: "devices", label: "Appareil" },
  { value: "selectedGoals", label: "Objectif" },
  { value: "painPoints", label: "Point de douleur" },
  { value: "dominantHeroes", label: "Héros dominant" },
  { value: "referralSegments", label: "Code créateur" },
] as const;
export type Dimension = (typeof DIMENSIONS)[number]["value"];

export type SegmentTableRow = { key: string; name: string; started: string; paywall: string; converted: string; completed: string; cvr: string; cvrValue: number };

/** Paywall & segments: paywall KPIs and conversion by language / device / goal / pain point / hero / code. */
export function useConversionViewModel(data: QuestirlSummary | null) {
  const [dimension, setDimension] = useState<Dimension>("languages");
  const content = useMemo(() => {
    if (!data) return null;
    const c = data.cards;
    const kpis: KpiItem[] = [
      { key: "reached", label: "Paywall atteint", value: formatInt(c.onboardingPaywallReached), foot: "tentatives d'onboarding", hint: "onboarding_paywall_reached, par tentative" },
      { key: "viewers", label: "Personnes ayant vu le paywall", value: formatInt(c.paywallViewers), foot: "paywall_viewed", hint: "Utilisateurs distincts avec paywall_viewed ou onboarding_paywall_reached" },
      { key: "trials", label: "Essais démarrés", value: formatInt(c.trialStarted), foot: "trial_started" },
      { key: "buyers", label: "Acheteurs (essai ou achat)", value: formatInt(c.paywallBuyers), foot: `${pct100(c.paywallConversionRate)} des personnes ayant vu le paywall`, hint: "Utilisateurs distincts avec paywall_purchased, paywall_restored, purchase_completed, subscription_started ou trial_started" },
    ];
    const toRows = (rows: SegmentRow[]): SegmentTableRow[] =>
      rows.map((r) => ({
        key: r.name,
        name: r.name === "unknown" ? "Non renseigné" : r.name,
        started: formatInt(r.started),
        paywall: formatInt(r.paywallReached),
        converted: formatInt(r.converted),
        completed: formatInt(r.completed),
        cvr: pct100(r.conversionRate),
        cvrValue: r.conversionRate,
      }));
    return { kpis, rows: toRows(data[dimension]) };
  }, [data, dimension]);
  return { ...content, ready: !!content, dimension, setDimension, dimensions: DIMENSIONS.map((d) => ({ value: d.value, label: d.label })) };
}
