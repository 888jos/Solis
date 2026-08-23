import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

type SyncApp = {
  id: string;
  name: string;
  bundleId: string;
  appStoreId: string;
  keyId: string;
  issuerId: string;
  vendorNumber: string;
  privateKeyPath: string;
};

type AppleAppResponse = {
  data?: {
    attributes?: {
      bundleId?: string;
      name?: string;
      primaryLocale?: string;
      sku?: string;
      appStoreState?: string;
    };
  };
};

type AppleResource<T> = {
  id: string;
  attributes?: T;
};

type AppleListResponse<T> = {
  data?: AppleResource<T>[];
};

type AppInfoLocalizationAttrs = {
  locale?: string;
  name?: string;
  subtitle?: string;
};

type AppStoreVersionAttrs = {
  appStoreState?: string;
  platform?: string;
  versionString?: string;
};

type AppStoreVersionLocalizationAttrs = {
  description?: string;
  keywords?: string;
  locale?: string;
  promotionalText?: string;
  whatsNew?: string;
};

type AsoLocalization = {
  description: string;
  keywords: string;
  locale: string;
  name: string;
  promotionalText: string;
  subtitle: string;
  whatsNew: string;
};

type ParsedSalesRow = {
  country: string;
  currency: string;
  kind: string;
  revenue: number;
  units: number;
};

type MetricPoint = {
  date: string;
  downloads: number;
  inAppPurchases: number;
  revenue: number;
  subscriptions: number;
  units: number;
};

type CountryBreakdown = {
  country: string;
  downloads: number;
  revenue: number;
  units: number;
};

type ParsedFinanceRow = {
  currency: string;
  date: string;
  revenue: number;
  source: string;
  units: number;
};

type MatchContext = {
  appName: string;
  appSku: string;
  appStoreId: string;
  bundleId: string;
};

const APPLE_API = "https://api.appstoreconnect.apple.com/v1";
const APPLE_FETCH_TIMEOUT_MS = 8_000;
const APPLE_METADATA_TIMEOUT_MS = 5_000;
const SALES_REPORT_CONCURRENCY = 8;
const FINANCE_REPORT_MONTHS = 6;
const FINANCE_REPORT_CANDIDATES = [
  { regionCode: "ZZ", reportType: "FINANCIAL" },
  { regionCode: "ZZ", reportType: "FINANCE_DETAIL" },
  { regionCode: "Z1", reportType: "FINANCE_DETAIL" },
];

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) as { app?: SyncApp; dateRange?: string } : {};
    const app = body.app;
    if (!app) return json({ ok: false, message: "Missing app payload." }, 400);

    const missing = [
      !app.keyId ? "Key ID" : "",
      !app.issuerId ? "Issuer ID" : "",
      !app.vendorNumber ? "Vendor Number" : "",
      !app.appStoreId ? "App Store ID" : "",
      !app.privateKeyPath ? "Direct .p8 path" : "",
    ].filter(Boolean);

    if (missing.length) {
      return json({ ok: false, message: "App Store Connect sync needs complete Apple credentials.", missing }, 400);
    }

    const privateKey = await readFile(app.privateKeyPath, "utf8");
    const token = createAppStoreConnectToken({ issuerId: app.issuerId, keyId: app.keyId, privateKey });
    const appInfo = await fetchAppleApp(app.appStoreId, token).catch(() => ({ data: { attributes: {} } } satisfies AppleAppResponse));
    const attrs = appInfo.data?.attributes ?? {};
    const matchContext = {
      appName: attrs.name ?? app.name,
      appSku: attrs.sku ?? "",
      appStoreId: app.appStoreId,
      bundleId: attrs.bundleId ?? app.bundleId,
    };
    const dateRange = body.dateRange ?? "30d";
    let asoError = "";
    const aso = await fetchAsoSnapshot({ appStoreId: app.appStoreId, primaryLocale: attrs.primaryLocale ?? "", token }).catch((error) => {
      asoError = error instanceof Error ? error.message : "ASO metadata unavailable.";
      return emptyAsoSnapshot(attrs.primaryLocale ?? "", asoError);
    });
    const release = await fetchReleaseSnapshot({ appStoreId: app.appStoreId, appState: attrs.appStoreState ?? "", token }).catch(() => emptyReleaseSnapshot(attrs.appStoreState ?? ""));
    let salesError = "";
    const salesReport = await fetchSalesReports({ dateRange, matchContext, token, vendorNumber: app.vendorNumber }).catch((error) => {
      salesError = error instanceof Error ? error.message : "Sales reports unavailable.";
      return emptySalesReport(salesError);
    });
    let financeError = "";
    const financeReport = await fetchFinanceReports({ matchContext, token, vendorNumber: app.vendorNumber }).catch((error) => {
      financeError = error instanceof Error ? error.message : "Financial reports unavailable.";
      return null;
    });
    const report = mergeReports(salesReport, financeReport, { financeError, salesError });

    return json({
      ok: true,
      metrics: {
        appId: app.id,
        parserVersion: 6,
        appName: attrs.name ?? app.name,
        bundleId: attrs.bundleId ?? app.bundleId,
        dateRange,
        sku: attrs.sku ?? "",
        state: attrs.appStoreState ?? "",
        syncedAt: new Date().toISOString(),
        aso: asoError ? { ...aso, status: "ASO pending" } : aso,
        release,
        ...report,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "App Store Connect sync failed.";
    return json({ ok: false, message }, 502);
  }
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function createAppStoreConnectToken({ issuerId, keyId, privateKey }: { issuerId: string; keyId: string; privateKey: string }) {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: "appstoreconnect-v1", exp: now + 18 * 60, iat: now, iss: issuerId };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${derToJose(signer.sign(privateKey))}`;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function derToJose(signature: Buffer) {
  let offset = 0;
  if (signature[offset++] !== 0x30) throw new Error("Invalid Apple JWT signature.");
  offset = skipLength(signature, offset);
  const r = readDerInteger(signature, () => offset, (value) => { offset = value; });
  const s = readDerInteger(signature, () => offset, (value) => { offset = value; });
  return Buffer.concat([toPaddedInteger(r), toPaddedInteger(s)]).toString("base64url");
}

function skipLength(buffer: Buffer, offset: number) {
  const lengthByte = buffer[offset++];
  if (lengthByte < 0x80) return offset;
  return offset + (lengthByte & 0x7f);
}

function readDerInteger(buffer: Buffer, getOffset: () => number, setOffset: (offset: number) => void) {
  let offset = getOffset();
  if (buffer[offset++] !== 0x02) throw new Error("Invalid Apple JWT integer.");
  const lengthByte = buffer[offset++];
  let length = lengthByte;
  if (lengthByte >= 0x80) {
    const bytes = lengthByte & 0x7f;
    length = 0;
    for (let index = 0; index < bytes; index += 1) length = (length << 8) + buffer[offset++];
  }
  const value = buffer.subarray(offset, offset + length);
  setOffset(offset + length);
  return value;
}

function toPaddedInteger(value: Buffer) {
  let normalized = value;
  while (normalized.length > 0 && normalized[0] === 0) normalized = normalized.subarray(1);
  if (normalized.length > 32) normalized = normalized.subarray(normalized.length - 32);
  if (normalized.length === 32) return normalized;
  return Buffer.concat([Buffer.alloc(32 - normalized.length), normalized]);
}

async function fetchAppleApp(appStoreId: string, token: string) {
  const params = new URLSearchParams({
    "fields[apps]": "appStoreState,bundleId,name,primaryLocale,sku",
  });
  const response = await fetchWithTimeout(`${APPLE_API}/apps/${encodeURIComponent(appStoreId)}?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  }, "Apple app metadata", APPLE_METADATA_TIMEOUT_MS);
  if (!response.ok) throw new Error(await appleError(response, "Apple app metadata failed."));
  return response.json() as Promise<AppleAppResponse>;
}

async function fetchAppleList<T>(path: string, token: string, label: string, timeoutMs = APPLE_METADATA_TIMEOUT_MS) {
  const response = await fetchWithTimeout(`${APPLE_API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  }, label, timeoutMs);
  if (!response.ok) throw new Error(await appleError(response, `${label} failed.`));
  return response.json() as Promise<AppleListResponse<T>>;
}

async function fetchAsoSnapshot({ appStoreId, primaryLocale, token }: { appStoreId: string; primaryLocale: string; token: string }) {
  const versionsResponse = await fetchAppleList<AppStoreVersionAttrs>(`/apps/${encodeURIComponent(appStoreId)}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,platform`, token, "Apple ASO versions");
  const appInfosResponse = await fetchAppleList<Record<string, never>>(`/apps/${encodeURIComponent(appStoreId)}/appInfos?limit=10`, token, "Apple ASO app info").catch(() => ({ data: [] }));
  const versions = versionsResponse.data ?? [];
  const latestVersion = versions.find((version) => version.attributes?.appStoreState === "READY_FOR_SALE") ?? versions[0];
  const appInfo = appInfosResponse.data?.[0];

  const [appInfoLocalizationsResponse, versionLocalizationsResponse] = await Promise.all([
    appInfo ? fetchAppleList<AppInfoLocalizationAttrs>(`/appInfos/${encodeURIComponent(appInfo.id)}/appInfoLocalizations?limit=200`, token, "Apple ASO app localizations").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    latestVersion ? fetchAppleList<AppStoreVersionLocalizationAttrs>(`/appStoreVersions/${encodeURIComponent(latestVersion.id)}/appStoreVersionLocalizations?limit=200`, token, "Apple ASO version localizations").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
  ]);

  const byLocale = new Map<string, AsoLocalization>();
  for (const item of appInfoLocalizationsResponse.data ?? []) {
    const attrs = item.attributes ?? {};
    const locale = attrs.locale ?? primaryLocale ?? "unknown";
    byLocale.set(locale, {
      description: "",
      keywords: "",
      locale,
      name: attrs.name ?? "",
      promotionalText: "",
      subtitle: attrs.subtitle ?? "",
      whatsNew: "",
    });
  }

  for (const item of versionLocalizationsResponse.data ?? []) {
    const attrs = item.attributes ?? {};
    const locale = attrs.locale ?? primaryLocale ?? "unknown";
    const current = byLocale.get(locale) ?? { description: "", keywords: "", locale, name: "", promotionalText: "", subtitle: "", whatsNew: "" };
    byLocale.set(locale, {
      ...current,
      description: attrs.description ?? current.description,
      keywords: attrs.keywords ?? current.keywords,
      promotionalText: attrs.promotionalText ?? current.promotionalText,
      whatsNew: attrs.whatsNew ?? current.whatsNew,
    });
  }

  const localizations = Array.from(byLocale.values());
  const keywords = Array.from(new Set(localizations.flatMap((localization) => splitKeywords(localization.keywords)))).slice(0, 48);
  const titleCoverage = coverage(localizations, "name");
  const subtitleCoverage = coverage(localizations, "subtitle");
  const descriptionCoverage = coverage(localizations, "description");
  const keywordCoverage = localizations.length ? (localizations.filter((localization) => splitKeywords(localization.keywords).length > 0).length / localizations.length) * 100 : 0;
  const metadataScore = Math.round((titleCoverage * 0.25) + (subtitleCoverage * 0.2) + (descriptionCoverage * 0.25) + (keywordCoverage * 0.3));

  return {
    fetchedAt: new Date().toISOString(),
    status: localizations.length ? "Synced from Apple" : "No localizations found",
    primaryLocale: primaryLocale || localizations[0]?.locale || "Unknown",
    latestVersion: latestVersion?.attributes?.versionString ?? "Unknown",
    localizations: localizations.length,
    locales: localizations.map((localization) => localization.locale).filter(Boolean),
    keywordCount: localizations.reduce((sum, localization) => sum + splitKeywords(localization.keywords).length, 0),
    keywords,
    titleCoverage,
    subtitleCoverage,
    descriptionCoverage,
    metadataScore,
  };
}

function emptyAsoSnapshot(primaryLocale: string, status: string) {
  return {
    fetchedAt: new Date().toISOString(),
    status,
    primaryLocale: primaryLocale || "Unknown",
    latestVersion: "Unknown",
    localizations: 0,
    locales: [],
    keywordCount: 0,
    keywords: [],
    titleCoverage: 0,
    subtitleCoverage: 0,
    descriptionCoverage: 0,
    metadataScore: 0,
  };
}

async function fetchReleaseSnapshot({ appStoreId, appState, token }: { appStoreId: string; appState: string; token: string }) {
  const versionsResponse = await fetchAppleList<AppStoreVersionAttrs>(`/apps/${encodeURIComponent(appStoreId)}/appStoreVersions?limit=200&fields[appStoreVersions]=versionString,appStoreState,platform`, token, "Apple release versions");
  const versions = versionsResponse.data ?? [];
  const latestVersion = versions.find((version) => version.attributes?.appStoreState === "READY_FOR_SALE") ?? versions[0];
  const state = latestVersion?.attributes?.appStoreState ?? appState ?? "UNKNOWN";
  return {
    fetchedAt: new Date().toISOString(),
    latestVersion: latestVersion?.attributes?.versionString ?? "Unknown",
    platform: latestVersion?.attributes?.platform ?? "Unknown",
    state,
    versionCount: versions.length,
    readyForSale: state === "READY_FOR_SALE",
    editable: ["DEVELOPER_REJECTED", "PREPARE_FOR_SUBMISSION", "REJECTED", "WAITING_FOR_REVIEW"].includes(state),
  };
}

function emptyReleaseSnapshot(appState: string) {
  return {
    fetchedAt: new Date().toISOString(),
    latestVersion: "Unknown",
    platform: "Unknown",
    state: appState || "Unknown",
    versionCount: 0,
    readyForSale: appState === "READY_FOR_SALE",
    editable: false,
  };
}

function coverage(localizations: AsoLocalization[], key: "description" | "name" | "subtitle") {
  if (!localizations.length) return 0;
  return (localizations.filter((localization) => localization[key].trim()).length / localizations.length) * 100;
}

function splitKeywords(value: string) {
  return value.split(",").map((keyword) => keyword.trim()).filter(Boolean);
}

function emptySalesReport(message: string) {
  return {
    reportStartDate: null,
    reportEndDate: null,
    currency: "EUR",
    revenue: 0,
    revenueRows: 0,
    downloads: 0,
    units: 0,
    subscriptions: 0,
    inAppPurchases: 0,
    countries: 0,
    countryBreakdown: [] as CountryBreakdown[],
    timeSeries: [] as MetricPoint[],
    rows: 0,
    financeRows: 0,
    revenueSource: "None" as const,
    status: "no_report" as const,
    message,
  };
}

async function fetchSalesReports({ dateRange, matchContext, token, vendorNumber }: { dateRange: string; matchContext: MatchContext; token: string; vendorNumber: string }) {
  const days = rangeDays(dateRange);
  const reports = [];
  const errors: Error[] = [];
  const probeDays = days.slice(0, Math.min(3, days.length));
  const probe = await Promise.all(probeDays.map((date) => fetchSalesReportForDate({ date, matchContext, token, vendorNumber })));

  for (const result of probe) {
    if (result instanceof Error) errors.push(result);
    else if (result) reports.push(result);
  }

  if (!reports.length && errors.length === probeDays.length) {
    throw errors[0];
  }

  const remainingDays = days.slice(probeDays.length);
  for (let index = 0; index < remainingDays.length; index += SALES_REPORT_CONCURRENCY) {
    const chunk = remainingDays.slice(index, index + SALES_REPORT_CONCURRENCY);
    const results = await Promise.all(chunk.map((date) => fetchSalesReportForDate({ date, matchContext, token, vendorNumber })));
    for (const result of results) {
      if (result instanceof Error) errors.push(result);
      else if (result) reports.push(result);
    }
  }

  const rows = reports.flatMap((report) => report.rows);
  const countries = new Set(rows.map((row) => row.country).filter(Boolean)).size;
  const reportDates = reports.filter((report) => report.rows.length).map((report) => report.date).sort();
  const currency = normalizeCurrency(rows.find((row) => row.currency)?.currency);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const revenueRows = rows.filter((row) => row.revenue !== 0).length;
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  const downloads = rows.filter((row) => row.kind === "download").reduce((sum, row) => sum + row.units, 0);
  const subscriptions = rows.filter((row) => row.kind === "subscription").reduce((sum, row) => sum + row.units, 0);
  const inAppPurchases = rows.filter((row) => row.kind === "in_app_purchase").reduce((sum, row) => sum + row.units, 0);
  const countryBreakdown = buildCountryBreakdown(rows);
  const timeSeries: MetricPoint[] = reports.filter((report) => report.rows.length).map((report) => ({
    date: report.date,
    downloads: report.rows.filter((row) => row.kind === "download").reduce((sum, row) => sum + row.units, 0),
    inAppPurchases: report.rows.filter((row) => row.kind === "in_app_purchase").reduce((sum, row) => sum + row.units, 0),
    revenue: report.rows.reduce((sum, row) => sum + row.revenue, 0),
    subscriptions: report.rows.filter((row) => row.kind === "subscription").reduce((sum, row) => sum + row.units, 0),
    units: report.rows.reduce((sum, row) => sum + row.units, 0),
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    reportStartDate: reportDates[0] ?? null,
    reportEndDate: reportDates.at(-1) ?? null,
    currency,
    revenue,
    revenueRows,
    downloads,
    units,
    subscriptions,
    inAppPurchases,
    countries,
    countryBreakdown,
    timeSeries,
    rows: rows.length,
    financeRows: 0,
    revenueSource: revenueRows ? "Sales" : "None",
    status: rows.length ? "synced" : "no_report",
    message: rows.length ? "Synced from Apple" : "No matching Apple report rows",
  };
}

async function fetchSalesReportForDate({ date, matchContext, token, vendorNumber }: { date: string; matchContext: MatchContext; token: string; vendorNumber: string }) {
  try {
    const params = new URLSearchParams({
      "filter[frequency]": "DAILY",
      "filter[reportDate]": date,
      "filter[reportSubType]": "SUMMARY",
      "filter[reportType]": "SALES",
      "filter[vendorNumber]": vendorNumber,
    });
    const response = await fetchWithTimeout(`${APPLE_API}/salesReports?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    }, `Apple sales report ${date}`, APPLE_FETCH_TIMEOUT_MS);
    if (response.status === 404 || response.status === 409) return null;
    if (!response.ok) throw new Error(await appleError(response, "Apple sales report failed."));
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = unzipSalesReport(bytes);
    return { date, ...parseSalesReport(text, matchContext) };
  } catch (error) {
    return normalizeAppleNetworkError(error);
  }
}

async function fetchFinanceReports({ matchContext, token, vendorNumber }: { matchContext: MatchContext; token: string; vendorNumber: string }) {
  const results = [];
  const errors: Error[] = [];

  for (const month of recentFinanceMonths()) {
    let bestReport: { month: string; rows: ParsedFinanceRow[] } | null = null;
    for (const candidate of FINANCE_REPORT_CANDIDATES) {
      const report = await fetchFinanceReportForMonth({ matchContext, month, regionCode: candidate.regionCode, reportType: candidate.reportType, token, vendorNumber }).catch((error) => normalizeAppleNetworkError(error));
      if (report instanceof Error) {
        errors.push(report);
        continue;
      }
      if (!report) continue;
      if (!bestReport || report.rows.some((row) => row.revenue !== 0) || (!bestReport.rows.length && report.rows.length)) bestReport = report;
      if (bestReport.rows.some((row) => row.revenue !== 0)) break;
    }
    if (bestReport) results.push(bestReport);
  }

  const reports = results.filter((result): result is { month: string; rows: ParsedFinanceRow[] } => Boolean(result));
  if (!reports.length && errors.length) throw errors[0];
  const rows = reports.flatMap((report) => report.rows);
  const selectedRows = selectPrimaryCurrencyRows(rows);
  const reportDates = selectedRows.map((row) => row.date).sort();
  const revenue = selectedRows.reduce((sum, row) => sum + row.revenue, 0);
  const revenueRows = selectedRows.filter((row) => row.revenue !== 0).length;
  const currency = normalizeCurrency(selectedRows.find((row) => row.currency)?.currency);
  const byDate = new Map<string, ParsedFinanceRow>();

  for (const row of selectedRows) {
    const current = byDate.get(row.date) ?? { currency: row.currency, date: row.date, revenue: 0, source: row.source, units: 0 };
    byDate.set(row.date, { ...current, revenue: current.revenue + row.revenue, units: current.units + row.units });
  }

  const timeSeries: MetricPoint[] = Array.from(byDate.values()).map((row) => ({
    date: row.date,
    downloads: 0,
    inAppPurchases: 0,
    revenue: row.revenue,
    subscriptions: 0,
    units: row.units,
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    currency,
    financeRows: rows.length,
    financeReportEndDate: reportDates.at(-1) ?? null,
    financeReportStartDate: reportDates[0] ?? null,
    revenue,
    revenueRows,
    revenueSource: revenueRows ? "Financial" : "None",
    timeSeries,
  };
}

async function fetchFinanceReportForMonth({ matchContext, month, regionCode, reportType, token, vendorNumber }: { matchContext: MatchContext; month: string; regionCode: string; reportType: string; token: string; vendorNumber: string }) {
  const params = new URLSearchParams({
    "filter[regionCode]": regionCode,
    "filter[reportDate]": month,
    "filter[reportType]": reportType,
    "filter[vendorNumber]": vendorNumber,
  });
  const response = await fetchWithTimeout(`${APPLE_API}/financeReports?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  }, `Apple ${reportType} report ${month}/${regionCode}`, APPLE_FETCH_TIMEOUT_MS);

  if (response.status === 404 || response.status === 409) return null;
  if (!response.ok) throw new Error(await appleError(response, "Apple financial report failed."));
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = unzipSalesReport(bytes);
  return { month, ...parseFinanceReport(text, matchContext, month, `${reportType}/${regionCode}`) };
}

function mergeReports(salesReport: Awaited<ReturnType<typeof fetchSalesReports>>, financeReport: Awaited<ReturnType<typeof fetchFinanceReports>> | null, errors: { financeError?: string; salesError?: string } = {}) {
  const hasFinanceRevenue = Boolean(financeReport?.revenueRows);
  const revenue = hasFinanceRevenue ? financeReport.revenue : salesReport.revenue;
  const currency = hasFinanceRevenue ? financeReport.currency : salesReport.currency;
  const revenueRows = hasFinanceRevenue ? financeReport.revenueRows : salesReport.revenueRows;
  const reportStartDate = [salesReport.reportStartDate, financeReport?.financeReportStartDate].filter(Boolean).sort()[0] ?? null;
  const reportEndDate = [salesReport.reportEndDate, financeReport?.financeReportEndDate].filter(Boolean).sort().at(-1) ?? null;

  return {
    ...salesReport,
    currency,
    financeRows: financeReport?.financeRows ?? 0,
    financeReportEndDate: financeReport?.financeReportEndDate ?? null,
    financeReportStartDate: financeReport?.financeReportStartDate ?? null,
    reportEndDate,
    reportStartDate,
    revenue,
    revenueRows,
    revenueSource: hasFinanceRevenue ? "Financial" : salesReport.revenueRows ? "Sales" : "None",
    status: salesReport.rows || financeReport?.financeRows ? "synced" : "no_report",
    message: syncMessage(Boolean(salesReport.rows), Boolean(financeReport?.financeRows), Boolean(hasFinanceRevenue), errors),
    timeSeries: mergeTimeSeries(salesReport.timeSeries, hasFinanceRevenue ? financeReport.timeSeries : []),
  };
}

function syncMessage(hasSalesRows: boolean, hasFinanceRows: boolean, hasFinanceRevenue: boolean, errors: { financeError?: string; salesError?: string }) {
  if (hasSalesRows || hasFinanceRows) {
    if (errors.financeError && !hasFinanceRevenue) return "Synced · financials pending";
    if (errors.salesError) return "Synced · sales pending";
    return "Synced";
  }
  if (errors.salesError || errors.financeError) return [errors.salesError, errors.financeError].filter(Boolean).join(" · ");
  return "No matching Apple report rows";
}

function buildCountryBreakdown(rows: ParsedSalesRow[]) {
  const byCountry = new Map<string, CountryBreakdown>();
  for (const row of rows) {
    const country = row.country.trim().toUpperCase();
    if (!country || country.length !== 2) continue;
    const current = byCountry.get(country) ?? { country, downloads: 0, revenue: 0, units: 0 };
    byCountry.set(country, {
      country,
      downloads: current.downloads + (row.kind === "download" ? row.units : 0),
      revenue: current.revenue + row.revenue,
      units: current.units + row.units,
    });
  }
  return Array.from(byCountry.values()).sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue) || b.downloads - a.downloads);
}

function mergeTimeSeries(salesSeries: MetricPoint[], financeSeries: MetricPoint[]) {
  if (!financeSeries.length) return salesSeries;
  const byDate = new Map<string, MetricPoint>();
  for (const point of salesSeries) byDate.set(point.date, { ...point, revenue: 0 });
  for (const point of financeSeries) {
    const current = byDate.get(point.date) ?? { date: point.date, downloads: 0, inAppPurchases: 0, revenue: 0, subscriptions: 0, units: 0 };
    byDate.set(point.date, { ...current, revenue: current.revenue + point.revenue });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchWithTimeout(url: string, init: RequestInit, label: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw normalizeAppleNetworkError(error, label, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAppleNetworkError(error: unknown, label = "Apple request", timeoutMs = APPLE_FETCH_TIMEOUT_MS) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ETIMEDOUT") || message.includes("timed out") || message.includes("abort")) {
    return new Error(`${label} timed out after ${timeoutMs / 1000}s. Check network access to api.appstoreconnect.apple.com and retry.`);
  }
  return error instanceof Error ? error : new Error(message);
}

function rangeDays(dateRange: string) {
  const count = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;
  const dates = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (let index = 0; index < count; index += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

function unzipSalesReport(bytes: Buffer) {
  try {
    return gunzipSync(bytes).toString("utf8");
  } catch {
    return bytes.toString("utf8");
  }
}

function parseSalesReport(text: string, matchContext: MatchContext) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [] as ParsedSalesRow[] };
  const rows = parseTabularReport(text);
  const matched = rows.filter((row) => matchesApp(row, matchContext));
  return {
    rows: matched.map((row) => {
      const productType = String(row["Product Type Identifier"] ?? "").toUpperCase();
      const units = toNumber(row.Units);
      const unitProceeds = firstPresentNumber(
        row["Developer Proceeds"],
        row.Proceeds,
        row["Partner Share"],
        row["Extended Partner Share"],
      );
      const customerPrice = firstPresentNumber(row["Customer Price"], row["Customer Price in USD"], row["Customer Price USD"]);
      return {
        country: String(row["Country Code"] ?? row["Provider Country"] ?? ""),
        currency: normalizeCurrency(String(row["Currency of Proceeds"] ?? row["Customer Currency"] ?? "")),
        kind: classifyProductType(productType),
        revenue: unitProceeds ? unitProceeds * units : customerPrice * units,
        units,
      };
    }),
  };
}

function parseFinanceReport(text: string, matchContext: MatchContext, month: string, source: string) {
  const rows = parseTabularReport(text);
  const matched = rows.filter((row) => matchesApp(row, matchContext));
  return {
    rows: matched.map((row) => {
      const units = toNumber(row.Quantity ?? row.Units);
      const extendedPartnerShare = optionalNumber(row["Extended Partner Share"] ?? row["Developer Proceeds"]);
      const partnerShare = optionalNumber(row["Partner Share"] ?? row.Proceeds);
      const revenue = extendedPartnerShare ?? ((partnerShare ?? 0) * units);
      return {
        currency: normalizeCurrency(String(row["Partner Share Currency"] ?? row["Customer Currency"] ?? "")),
        date: normalizeReportDate(String(row["Begin Date"] ?? row["End Date"] ?? month), month),
        revenue,
        source,
        units,
      };
    }),
  };
}

function parseTabularReport(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [] as Record<string, string>[];
  const headers = lines[0].split("\t").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  }) as Record<string, string>[];
}

function matchesApp(row: Record<string, string>, matchContext: MatchContext) {
  const identifiers = ["Apple Identifier", "App Apple Identifier", "Apple ID", "Adam ID", "Parent Identifier", "Parent Apple Identifier", "App Adam ID"];
  const skus = ["SKU", "Vendor Identifier", "ISRC / ISBN", "Vendor ID", "Parent SKU", "Product SKU"];
  const bundleIds = ["Bundle ID", "Bundle Identifier", "App Bundle ID"];
  const names = ["Title", "App Name", "Product Title", "Parent Title"];
  const appStoreId = normalizeMatchValue(matchContext.appStoreId);
  const appSku = normalizeMatchValue(matchContext.appSku);
  const bundleId = normalizeMatchValue(matchContext.bundleId);
  const appName = normalizeMatchValue(matchContext.appName);
  return Boolean(appStoreId && identifiers.some((key) => normalizeMatchValue(row[key]) === appStoreId))
    || Boolean(appSku && skus.some((key) => normalizeMatchValue(row[key]) === appSku))
    || Boolean(bundleId && bundleIds.some((key) => normalizeMatchValue(row[key]) === bundleId))
    || Boolean(appName && names.some((key) => normalizeMatchValue(row[key]) === appName));
}

function normalizeMatchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeReportDate(value: string, fallbackMonth: string) {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return `${fallbackMonth}-01`;
}

function classifyProductType(productType: string) {
  if (productType.startsWith("IA9") || productType.includes("SUB")) return "subscription";
  if (productType.startsWith("IA")) return "in_app_purchase";
  return "download";
}

function toNumber(value: unknown) {
  const parsed = parseAppleNumber(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstPresentNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = optionalNumber(value);
    if (parsed !== null) return parsed;
  }
  return 0;
}

function optionalNumber(value: unknown) {
  const parsed = parseAppleNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAppleNumber(value: unknown) {
  let text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  let sign = 1;
  if (text.startsWith("(") && text.endsWith(")")) {
    sign = -1;
    text = text.slice(1, -1);
  }
  text = text.replace(/\s/g, "");
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (hasComma) {
    text = text.replace(",", ".");
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed * sign : Number.NaN;
}

function recentFinanceMonths() {
  const months = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  for (let index = 0; index < FINANCE_REPORT_MONTHS; index += 1) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
}

function selectPrimaryCurrencyRows(rows: ParsedFinanceRow[]) {
  if (!rows.length) return rows;
  const byCurrency = new Map<string, ParsedFinanceRow[]>();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), { ...row, currency }]);
  }
  const preferred = byCurrency.get("EUR");
  if (preferred?.some((row) => row.revenue !== 0)) return preferred;
  return Array.from(byCurrency.values()).sort((a, b) => {
    const aRevenue = a.reduce((sum, row) => sum + Math.abs(row.revenue), 0);
    const bRevenue = b.reduce((sum, row) => sum + Math.abs(row.revenue), 0);
    return bRevenue - aRevenue;
  })[0] ?? [];
}

function normalizeCurrency(currency: string | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : "EUR";
}

async function appleError(response: Response, fallback: string) {
  const text = await response.text();
  if (!text) return `${fallback} (${response.status})`;
  return `${fallback} (${response.status}) ${text.slice(0, 400)}`;
}
