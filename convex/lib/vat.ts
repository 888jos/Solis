// Standard VAT / GST rate applied to digital services sold to consumers, per App Store storefront
// (ISO-3166 alpha-2). Used to turn Apple's customer price (tax-inclusive) into an ex-VAT amount.
//
// Sources (rates in force on 2026-10-01): European Commission "VAT rates in the EU" (taxation-customs.ec.europa.eu),
// PwC Worldwide Tax Summaries "Corporate/Indirect taxes – VAT/GST rates" (taxsummaries.pwc.com), and Apple's
// App Store Connect Help "Tax information by region" for which storefronts Apple collects tax in.
// Notable recent changes included: FI 25.5 % (09/2024), SK 23 % (01/2025), EE 24 % (07/2025), RO 21 % (08/2025),
// RU 22 % (01/2026), KZ 16 % (01/2026), ID 12 % nominal on an 11/12 base = 11 % effective.
//
// Conventions:
//   - US and CA are 0: Apple prices there exclude sales tax / GST (tax is added on top at checkout).
//   - 0 where no consumption tax applies to digital services bought from a foreign seller (HK, MO, QA, KW...).
//   - BR is 0: Brazil has no VAT on these sales; Apple withholds local taxes from proceeds instead.
//   - A storefront missing from this table is treated as 0 (logged by the sync as an unknown country).
export const VAT_RATES: Record<string, number> = {
  // European Union
  AT: 0.2, BE: 0.21, BG: 0.2, HR: 0.25, CY: 0.19, CZ: 0.21, DK: 0.25, EE: 0.24, FI: 0.255, FR: 0.2,
  DE: 0.19, GR: 0.24, HU: 0.27, IE: 0.23, IT: 0.22, LV: 0.21, LT: 0.21, LU: 0.17, MT: 0.18, NL: 0.21,
  PL: 0.23, PT: 0.23, RO: 0.21, SK: 0.23, SI: 0.22, ES: 0.21, SE: 0.25,
  // Rest of Europe and Central Asia
  GB: 0.2, NO: 0.25, IS: 0.24, CH: 0.081, LI: 0.081, AL: 0.2, AM: 0.2, AZ: 0.18, BY: 0.2, BA: 0.17,
  GE: 0.18, XK: 0.18, MD: 0.2, ME: 0.21, MK: 0.18, RS: 0.2, UA: 0.2, RU: 0.22, TR: 0.2, KZ: 0.16,
  UZ: 0.12, KG: 0.12, TJ: 0.14, TM: 0.15,
  // Middle East and Africa
  AE: 0.05, SA: 0.15, BH: 0.1, OM: 0.05, QA: 0, KW: 0, JO: 0.16, LB: 0.11, IL: 0.18, IQ: 0, YE: 0,
  EG: 0.14, MA: 0.2, TN: 0.19, DZ: 0.19, LY: 0, ZA: 0.15, NG: 0.075, KE: 0.16, GH: 0.15, TZ: 0.18,
  UG: 0.18, RW: 0.18, ZM: 0.16, ZW: 0.155, MW: 0.165, MZ: 0.16, NA: 0.15, BW: 0.14, MU: 0.15, SN: 0.18,
  CI: 0.18, CM: 0.1925, BJ: 0.18, BF: 0.18, ML: 0.18, NE: 0.19, TD: 0.18, CG: 0.18, CD: 0.16, GA: 0.18,
  GW: 0.19, MG: 0.2, SC: 0.15, CV: 0.15, LR: 0, SL: 0.15, GM: 0.15, AO: 0.14, SZ: 0.15, ET: 0.15,
  MR: 0.16,
  // Asia-Pacific
  JP: 0.1, KR: 0.1, CN: 0.06, TW: 0.05, HK: 0, MO: 0, SG: 0.09, MY: 0.08, TH: 0.07, ID: 0.11, PH: 0.12,
  VN: 0.1, IN: 0.18, PK: 0, BD: 0.15, LK: 0.18, NP: 0.13, KH: 0.1, LA: 0.1, MM: 0, MN: 0.1, BT: 0,
  MV: 0.08, BN: 0, AU: 0.1, NZ: 0.15, FJ: 0.15, PG: 0.1, SB: 0.15, TO: 0.15, VU: 0.15, PW: 0, FM: 0,
  NR: 0, AF: 0,
  // Americas
  US: 0, CA: 0, MX: 0.16, BR: 0, AR: 0.21, CL: 0.19, CO: 0.19, PE: 0.18, UY: 0.22, PY: 0.1, BO: 0.13,
  EC: 0.15, VE: 0.16, CR: 0.13, PA: 0.07, GT: 0.12, HN: 0.15, SV: 0.13, NI: 0.15, DO: 0.18, JM: 0.15,
  TT: 0.125, BB: 0.175, BS: 0.1, BZ: 0.125, BM: 0, KY: 0, AG: 0.17, DM: 0.15, GD: 0.15, KN: 0.17,
  LC: 0.125, VC: 0.16, GY: 0.14, SR: 0.1, AI: 0, MS: 0, VG: 0, TC: 0,
};

/** VAT share for a storefront (0.2 = 20 %). Unknown storefronts count as 0. */
export function vatRate(country: string): number {
  return VAT_RATES[country.toUpperCase()] ?? 0;
}

export function isKnownVatCountry(country: string): boolean {
  return country.toUpperCase() in VAT_RATES;
}

/** Tax-inclusive amount → amount without VAT. */
export function withoutVat(amountInclVat: number, country: string): number {
  return amountInclVat / (1 + vatRate(country));
}
