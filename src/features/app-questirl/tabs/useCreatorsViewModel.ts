import { useMemo } from "react";
import { formatDecimal } from "@/lib/format";
import { formatDateTime, formatInt, pct100 } from "../format";
import type { KpiItem, QuestirlSummary } from "../types";

export type CreatorRow = { key: string; code: string; raw: string; submitted: string; completed: string; paywall: string; buyers: string; buyersValue: number; purchases: string; revenue: string; cvr: string; latest: string };

/** Codes créateurs: codes typed in onboarding, then what those users did (attribution = last code typed). */
export function useCreatorsViewModel(data: QuestirlSummary | null) {
  return useMemo(() => {
    if (!data) return null;
    const rows = data.referrals;
    const sum = (k: "submitted" | "buyers" | "purchaseEvents" | "paywallViewers") => rows.reduce((s, r) => s + r[k], 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const kpis: KpiItem[] = [
      { key: "codes", label: "Codes saisis", value: formatInt(rows.length), foot: "codes distincts", hint: "referral_code / creator_code normalisés (majuscules, sans espaces)" },
      { key: "submitted", label: "Personnes ayant saisi un code", value: formatInt(sum("submitted")), foot: "referral_code_submitted" },
      { key: "buyers", label: "Acheteurs avec un code", value: formatInt(sum("buyers")), foot: `${formatInt(sum("paywallViewers"))} ont vu le paywall` },
      { key: "revenue", label: "Valeur des achats trackée", value: revenue ? formatDecimal(revenue) : "—", foot: "propriété revenue/price des events, devise de l'event", hint: "Somme brute des propriétés revenue, price, amount, value ou usd envoyées avec les events d'achat (non convertie)" },
    ];
    const table: CreatorRow[] = rows.map((r) => ({
      key: r.name,
      code: r.name,
      raw: r.rawExamples.filter((x) => x !== r.name).join(", "),
      submitted: formatInt(r.submitted),
      completed: formatInt(r.completed),
      paywall: formatInt(r.paywallViewers),
      buyers: formatInt(r.buyers),
      buyersValue: r.buyers,
      purchases: formatInt(r.purchaseEvents),
      revenue: r.revenue ? formatDecimal(r.revenue) : "—",
      cvr: pct100(r.conversionRate),
      latest: formatDateTime(r.latestSeenAt),
    }));
    return { kpis, table };
  }, [data]);
}
