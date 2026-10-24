import { defineTable } from "convex/server";
import { v } from "convex/values";

// Owner: revenue agent. One row per Apple Sales report line (app × day × country × product × type),
// with amounts pre-converted to EUR on the report day.
//   grossEur    = customer price × units (what the customer paid; VAT-inclusive where VAT applies)
//   exVatEur    = grossEur without VAT/sales tax (country VAT table, see convex/lib/vat.ts)
//   proceedsEur = developer proceeds × units (what Apple pays: after VAT and the 15% commission)
export const revenueTables = {
  appleSales: defineTable({
    appSlug: v.string(),
    date: v.string(),
    country: v.string(), // ISO-3166 alpha-2
    sku: v.string(),
    title: v.string(),
    productTypeId: v.string(), // Apple product type identifier (1F, 3F, 7F, IAY, IA1, ...)
    isSubscription: v.boolean(),
    isDownload: v.boolean(), // first-time download (1F/1/1T/F1...)
    units: v.number(),
    customerPrice: v.number(),
    customerCurrency: v.string(),
    proceeds: v.number(),
    proceedsCurrency: v.string(),
    grossEur: v.number(),
    exVatEur: v.number(),
    proceedsEur: v.number(),
    lineKey: v.string(), // stable dedupe key per report line
  })
    .index("by_date", ["date"])
    .index("by_app_date", ["appSlug", "date"])
    .index("by_line", ["lineKey"]),

  // Which report days have been fetched (Apple returns 404 for days without sales: keep that as empty).
  appleReportDays: defineTable({
    reportType: v.string(), // "SALES" | "SUBSCRIPTION" | "SUBSCRIPTION_EVENT"
    date: v.string(),
    status: v.union(v.literal("ok"), v.literal("empty"), v.literal("error")),
    rows: v.number(),
    fetchedAt: v.number(),
  }).index("by_type_date", ["reportType", "date"]),
};
