import { formatDay, formatDecimal, formatInt, formatPct } from "@/lib/format";
import type { BarListItem } from "@/ui";
import type { Count } from "./types";

// Small helpers shared by the Quest IRL ViewModels (built on src/lib/format, nothing re-invented).

/** Integer percent from the summary (0-100) → "42 %". */
export const pct100 = (value: number | null | undefined) => (value == null ? "—" : formatPct(value / 100, 0));

/** Seconds → "12,5 s" / "3,2 min". */
export function formatSeconds(value: number | null | undefined): string {
  if (!value) return "—";
  return value >= 120 ? `${formatDecimal(value / 60)} min` : `${formatDecimal(value)} s`;
}

/** Minutes → "10,7 min" / "35,6 h" / "1,5 j". */
export function formatMinutes(value: number | null | undefined): string {
  if (!value) return "—";
  if (value >= 2880) return `${formatDecimal(value / 1440)} j`;
  if (value >= 120) return `${formatDecimal(value / 60)} h`;
  return `${formatDecimal(value)} min`;
}

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** ISO timestamp → "18 oct., 23:53" (local time). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dateTimeFmt.format(new Date(t)) : "—";
}

export const toBars = (rows: Count[], color = "var(--series-1)"): BarListItem[] => rows.map((r) => ({ key: r.name, label: r.name, value: r.count, color, hint: `${r.name} : ${formatInt(r.count)}` }));

/** Every day of [from, to] (inclusive). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export { formatDay, formatInt };
