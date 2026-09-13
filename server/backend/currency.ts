export type HistoricalExchangeRates = Map<string, Map<string, number>>;

export function netAppleProceeds(units: number, proceedsPerUnit: number, extendedProceeds?: number | null) {
  return extendedProceeds ?? proceedsPerUnit * units;
}

export function appleRefundOrCreditAmount(netProceeds: number) {
  return netProceeds < 0 ? -netProceeds : 0;
}

const ECB_HISTORICAL_RATES_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
const ECB_RATES_TTL_MS = 6 * 60 * 60_000;

let exchangeRateCache: { expiresAt: number; rates: HistoricalExchangeRates } | null = null;
let exchangeRateRequest: Promise<HistoricalExchangeRates> | null = null;

export function parseEcbRateHistory(xml: string): HistoricalExchangeRates {
  const rates: HistoricalExchangeRates = new Map();
  for (const dayMatch of xml.matchAll(/<Cube\b([^>]*\btime=["']\d{4}-\d{2}-\d{2}["'][^>]*)>([\s\S]*?)<\/Cube>/g)) {
    const date = readXmlAttribute(dayMatch[1], "time");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const dayRates = new Map<string, number>([["EUR", 1]]);
    for (const rateMatch of dayMatch[2].matchAll(/<Cube\b([^>]*)\/?\s*>/g)) {
      const currency = readXmlAttribute(rateMatch[1], "currency")?.toUpperCase();
      const rate = Number(readXmlAttribute(rateMatch[1], "rate"));
      if (currency && /^[A-Z]{3}$/.test(currency) && Number.isFinite(rate) && rate > 0) dayRates.set(currency, rate);
    }
    if (dayRates.has("USD")) rates.set(date, dayRates);
  }
  return rates;
}

function readXmlAttribute(attributes: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return attributes.match(new RegExp(`(?:^|\\s)${escapedName}=[\"']([^\"']+)[\"']`))?.[1] ?? null;
}

export function convertAmountToUsd(amount: number, currency: string, date: string, rates: HistoricalExchangeRates): number | null {
  const normalizedCurrency = normalizeCurrency(currency);
  if (normalizedCurrency === "USD") return Number.isFinite(amount) ? amount : null;
  if (amount === 0) return 0;
  let applicableRates: Map<string, number> | undefined;
  let closestRateDate = "";
  for (const [rateDate, values] of rates) {
    if (rateDate <= date && rateDate > closestRateDate && values.has(normalizedCurrency) && values.has("USD")) {
      closestRateDate = rateDate;
      applicableRates = values;
    }
  }
  if (!applicableRates) return null;
  const sourceRate = applicableRates.get(normalizedCurrency);
  const usdRate = applicableRates.get("USD");
  if (!sourceRate || !usdRate) return null;
  return (amount / sourceRate) * usdRate;
}

export async function getHistoricalExchangeRates(): Promise<HistoricalExchangeRates> {
  if (exchangeRateCache && exchangeRateCache.expiresAt > Date.now()) return exchangeRateCache.rates;
  if (exchangeRateRequest) return exchangeRateRequest;
  exchangeRateRequest = (async () => {
    const response = await fetch(ECB_HISTORICAL_RATES_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`ECB historical exchange rates unavailable (${response.status}).`);
    const rates = parseEcbRateHistory(await response.text());
    if (!rates.size) throw new Error("ECB historical exchange rates are empty.");
    exchangeRateCache = { expiresAt: Date.now() + ECB_RATES_TTL_MS, rates };
    return rates;
  })();
  try {
    return await exchangeRateRequest;
  } finally {
    exchangeRateRequest = null;
  }
}

export function normalizeCurrency(currency: string | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}
