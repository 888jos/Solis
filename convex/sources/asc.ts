"use node";

import crypto from "node:crypto";
import zlib from "node:zlib";

// App Store Connect API client (key SAL78N6ZZZ, read-only use). Node runtime: import only from "use node" files.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_B64 (base64 of the .p8), ASC_VENDOR_NUMBER.
let cached: { token: string; exp: number } | null = null;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function ascToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = now + 15 * 60;
  const head = b64({ alg: "ES256", kid: env("ASC_KEY_ID"), typ: "JWT" });
  const body = b64({ iss: env("ASC_ISSUER_ID"), iat: now, exp, aud: "appstoreconnect-v1" });
  const key = Buffer.from(env("ASC_PRIVATE_KEY_B64"), "base64").toString("utf8");
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { token: `${head}.${body}.${sig}`, exp };
  return cached.token;
}

/** GET a JSON:API resource. `path` starts with /v1/... Follows nothing; use ascGetAll for paging. */
export async function ascGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${ascToken()}` } });
  if (!res.ok) throw new Error(`ASC ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** GET every page of a JSON:API collection (follows links.next). */
export async function ascGetAll<T = any>(path: string, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `https://api.appstoreconnect.apple.com${path}`;
  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${ascToken()}` } });
    if (!res.ok) throw new Error(`ASC ${res.status} on ${url}: ${(await res.text()).slice(0, 300)}`);
    const json: any = await res.json();
    out.push(...(json.data ?? []));
    url = json.links?.next ?? null;
  }
  return out;
}

/**
 * Download a Sales and Trends report and parse its TSV. Returns null when Apple has no report for
 * that day (404 "no sales" / not yet available).
 * reportType: SALES (subType SUMMARY, version 1_1), SUBSCRIPTION (SUMMARY, 1_4), SUBSCRIPTION_EVENT (SUMMARY, 1_4).
 */
export async function ascSalesReport(opts: {
  reportType: "SALES" | "SUBSCRIPTION" | "SUBSCRIPTION_EVENT" | "SUBSCRIBER";
  reportSubType: "SUMMARY" | "DETAILED";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  reportDate: string;
  version: string;
}): Promise<Record<string, string>[] | null> {
  const q = new URLSearchParams({
    "filter[frequency]": opts.frequency,
    "filter[reportType]": opts.reportType,
    "filter[reportSubType]": opts.reportSubType,
    "filter[vendorNumber]": env("ASC_VENDOR_NUMBER"),
    "filter[reportDate]": opts.reportDate,
    "filter[version]": opts.version,
  });
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${q}`, { headers: { Authorization: `Bearer ${ascToken()}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ASC report ${opts.reportType} ${opts.reportDate}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const tsv = zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  return parseTsv(tsv);
}

export function parseTsv(tsv: string): Record<string, string>[] {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}
