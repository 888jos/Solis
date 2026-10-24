import type { GenericDatabaseReader } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

// Daily EUR exchange rates (fawazahmed0/currency-api, free, no key). Stored in fxRates as
// "1 EUR = perEur units of currency". Works in both Convex runtimes (only uses fetch).

/** Currencies we keep every day: every App Store customer / proceeds currency plus the ones we pay in. */
export const FX_CURRENCIES = [
  "USD", "GBP", "CHF", "NOK", "SEK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY", "RUB", "ILS", "AED",
  "SAR", "QAR", "EGP", "ZAR", "NGN", "KZT", "TZS", "CAD", "MXN", "BRL", "CLP", "COP", "PEN", "AUD", "NZD",
  "JPY", "CNY", "HKD", "TWD", "KRW", "SGD", "MYR", "THB", "IDR", "PHP", "VND", "INR", "PKR", "UAH", "ISK",
];

const sources = (day: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/eur.json`,
  `https://${day}.currency-api.pages.dev/v1/currencies/eur.json`,
];

/**
 * Fetch the published EUR rates for one day. Returns null when neither mirror has that day
 * (not published yet, or before the API's history). Keys are upper-case ISO codes.
 */
export async function fetchEurRates(day: string, keep: Iterable<string> = FX_CURRENCIES): Promise<Record<string, number> | null> {
  for (const url of sources(day)) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { date?: string; eur?: Record<string, number> };
      if (!json.eur || json.date !== day) continue;
      const out: Record<string, number> = {};
      for (const code of keep) {
        const rate = json.eur[code.toLowerCase()];
        if (typeof rate === "number" && rate > 0) out[code.toUpperCase()] = rate;
      }
      return out;
    } catch {
      // try the next mirror
    }
  }
  return null;
}

/** amount in `currency` → EUR, null if the rate is unknown. */
export function convertToEur(amount: number, currency: string, rates: Record<string, number>): number | null {
  const code = currency.trim().toUpperCase();
  if (!code || amount === 0) return 0;
  if (code === "EUR") return amount;
  const rate = rates[code];
  return rate ? amount / rate : null;
}

/**
 * Rates stored for `day`, or for the nearest earlier stored day when that day is missing.
 * Use from any query/mutation: `const { date, rates } = await ratesForDay(ctx.db, "2026-10-01")`.
 * `date` is the day the rates actually come from (null when the table is empty up to that day).
 */
export async function ratesForDay(db: GenericDatabaseReader<DataModel>, day: string): Promise<{ date: string | null; rates: Record<string, number> }> {
  let rows = await db.query("fxRates").withIndex("by_date_currency", (q) => q.eq("date", day)).collect();
  let date: string | null = day;
  if (!rows.length) {
    const earlier = await db.query("fxRates").withIndex("by_date_currency", (q) => q.lt("date", day)).order("desc").first();
    date = earlier?.date ?? null;
    rows = date ? await db.query("fxRates").withIndex("by_date_currency", (q) => q.eq("date", date as string)).collect() : [];
  }
  return { date, rates: Object.fromEntries(rows.map((r) => [r.currency, r.perEur])) };
}
