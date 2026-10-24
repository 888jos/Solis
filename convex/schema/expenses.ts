import { defineTable } from "convex/server";
import { v } from "convex/values";

export const EXPENSE_CATEGORIES = ["ugc", "ai", "infra", "tools", "apple", "ads", "freelance", "fees", "other"] as const;

// Owner: expenses agent. Every euro spent, whatever the source. amountEur is positive for spending.
export const expenseTables = {
  expenses: defineTable({
    date: v.string(),
    vendor: v.string(), // normalized vendor name ("OpenAI", "Superwall", "SideShift"...)
    label: v.string(), // raw bank label / description
    category: v.string(), // one of EXPENSE_CATEGORIES
    amountEur: v.number(),
    amountOriginal: v.number(),
    currency: v.string(),
    source: v.string(), // "bank_csv" | "manual" | "openai_api" | "anthropic_api" | "ugc_airtable" | "recurring"
    appSlug: v.optional(v.string()), // null = studio-wide
    externalId: v.string(), // dedupe key (bank tx id or hash of date+label+amount)
    importBatchId: v.optional(v.string()),
  })
    .index("by_date", ["date"])
    .index("by_external", ["externalId"])
    .index("by_vendor_date", ["vendor", "date"]),

  // Rules turning a raw bank label into vendor/category/app.
  expenseRules: defineTable({
    pattern: v.string(), // case-insensitive substring or /regex/
    vendor: v.string(),
    category: v.string(),
    appSlug: v.optional(v.string()),
  }),

  importBatches: defineTable({
    fileName: v.string(),
    format: v.string(),
    importedAt: v.number(),
    rowsTotal: v.number(),
    rowsImported: v.number(),
    rowsSkipped: v.number(),
  }),
};
