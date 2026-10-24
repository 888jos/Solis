// French formatting for every number shown in Solis.
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

/** Euros: 2 decimals under 100 €, none above. */
export function formatEur(value: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return "—";
  const useDecimals = opts.decimals ?? Math.abs(value) < 100;
  return (useDecimals ? eur2 : eur0).format(value);
}

export function formatEurCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Math.abs(value) < 10000 ? formatEur(value) : `${compact.format(value)} €`;
}

export function formatInt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return int.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Math.abs(value) < 10000 ? int.format(value) : compact.format(value);
}

export function formatDecimal(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return dec1.format(value);
}

/** Share 0..1 → "12,5 %". */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} %`;
}

/** Relative change between two numbers, null when the base is 0/unknown. */
export function change(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLongFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10-22" → "22 oct." */
export function formatDay(day: string): string {
  return dayFmt.format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
}

export function formatDayLong(day: string): string {
  return dayLongFmt.format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
}

/** "2026-10" → "oct. 26" */
export function formatMonth(month: string): string {
  return monthFmt.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

export function formatMonthLong(month: string): string {
  return monthLongFmt.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

/** Timestamp → "il y a 3 h". */
export function formatAgo(ms: number | null | undefined): string {
  if (!ms) return "jamais";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
