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
    // Added by the expenses agent (all optional, backwards compatible):
    recurring: v.optional(v.literal("monthly")), // set on a manual "template" expense repeated every month
    recurringFromId: v.optional(v.string()), // materialized copies point to their template expense id
    manualOverride: v.optional(v.boolean()), // vendor/category edited by hand: rules no longer touch it
    note: v.optional(v.string()),
    vendorHint: v.optional(v.string()), // counterparty name given by the bank export (Qonto, Boursorama...)
    updatedAt: v.optional(v.number()),
  })
    .index("by_date", ["date"])
    .index("by_external", ["externalId"])
    .index("by_vendor_date", ["vendor", "date"])
    .index("by_batch", ["importBatchId"])
    .index("by_source_date", ["source", "date"])
    .index("by_recurring", ["recurring"])
    .index("by_recurring_from", ["recurringFromId"]),

  // Rules turning a raw bank label into vendor/category/app.
  expenseRules: defineTable({
    pattern: v.string(), // case-insensitive substring or /regex/
    vendor: v.string(),
    category: v.string(),
    appSlug: v.optional(v.string()),
    builtin: v.optional(v.boolean()), // part of the default set (re-seeded by "Restaurer les règles par défaut")
    createdAt: v.optional(v.number()),
  }),

  // Imported bank lines Jos deleted (or a rule marked "excluded"): re-imports skip these ids so
  // the expenses table only ever holds real spending.
  expenseTombstones: defineTable({
    externalId: v.string(),
    label: v.string(),
    deletedAt: v.number(),
  }).index("by_external", ["externalId"]),

  importBatches: defineTable({
    fileName: v.string(),
    format: v.string(),
    importedAt: v.number(),
    rowsTotal: v.number(),
    rowsImported: v.number(),
    rowsSkipped: v.number(),
    // Added by the expenses agent:
    rowsCredit: v.optional(v.number()), // credits seen in the file (ignored)
    totalEur: v.optional(v.number()), // EUR sum of the rows actually imported
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    status: v.optional(v.union(v.literal("running"), v.literal("done"))),
  }),
};
