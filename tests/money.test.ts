// Money rules every page relies on: VAT, EUR conversion, dates, bank CSV parsing.
// Run: npm test (node --test with type stripping; imports need the .ts extension).
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween, monthOf } from "../convex/lib/dates.ts";
import { convertToEur } from "../convex/lib/fx.ts";
import { isKnownVatCountry, vatRate } from "../convex/lib/vat.ts";
import { parseAmount, parseBankCsv, parseDate } from "../src/features/expenses/csv.ts";

test("VAT: EU rates, US/CA tax-exclusive, unknown = 0", () => {
  assert.equal(vatRate("FR"), 0.2);
  assert.equal(vatRate("fr"), 0.2);
  assert.equal(vatRate("DE"), 0.19);
  assert.equal(vatRate("US"), 0);
  assert.equal(vatRate("CA"), 0);
  assert.equal(vatRate("ZZ"), 0);
  assert.equal(isKnownVatCountry("ZZ"), false);
  // Ex-VAT from a tax-inclusive French price.
  assert.equal(Math.round((12 / (1 + vatRate("FR"))) * 100) / 100, 10);
});

test("FX: EUR passthrough, conversion, unknown rate", () => {
  const rates = { USD: 1.1, GBP: 0.85 };
  assert.equal(convertToEur(10, "EUR", rates), 10);
  assert.equal(convertToEur(11, "usd", rates), 10);
  assert.equal(convertToEur(0, "JPY", rates), 0);
  assert.equal(convertToEur(5, "JPY", rates), null);
});

test("Dates: month and year boundaries", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(daysBetween("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(monthOf("2026-11-10"), "2026-11");
});

test("CSV amounts: French and English formats", () => {
  assert.equal(parseAmount("1 234,56", true), 1234.56);
  assert.equal(parseAmount("-1.234,56", true), -1234.56);
  assert.equal(parseAmount("(12.50)", false), -12.5);
  assert.equal(parseAmount("12,50-", true), -12.5);
  assert.equal(parseAmount("€12.50", false), 12.5);
  assert.equal(parseAmount("", false), null);
  assert.equal(parseAmount("abc", false), null);
});

test("CSV dates: d/m/y, ISO, invalid", () => {
  assert.equal(parseDate("03/11/2026"), "2026-11-03");
  assert.equal(parseDate("03/11/2026", "mdy"), "2026-03-11");
  assert.equal(parseDate("2026-11-03"), "2026-11-03");
  assert.equal(parseDate("31/02/2026"), null);
});

test("Bank CSV: only debits become expenses", () => {
  const csv = ["Date;Libellé;Montant", "03/11/2026;OPENAI *CHATGPT;-23,00", "04/11/2026;VIREMENT APPLE;150,00", "05/11/2026;CLOUDFLARE;-5,50"].join("\n");
  const result = parseBankCsv(csv, "releve.csv");
  assert.equal(result.debits.length, 2);
  assert.equal(result.creditCount, 1);
  assert.deepEqual(
    result.debits.map((t) => [t.date, t.amount]),
    [
      ["2026-11-03", -23],
      ["2026-11-05", -5.5],
    ],
  );
});
