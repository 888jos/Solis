import { defineTable } from "convex/server";
import { v } from "convex/values";

// Money that is not Apple: Stripe (Otto) and paid acquisition (Meta Ads). Filled by convex/sources/stripe.ts
// and convex/sources/metaAds.ts, aggregated per day.
export const paidTables = {
  // One row per Stripe balance day (UTC): what customers paid, Stripe fees, refunds, what lands in the bank.
  stripeDaily: defineTable({
    project: v.string(), // "otto"
    day: v.string(),
    currency: v.string(), // settlement currency (EUR expected)
    gross: v.number(), // charges, in currency units
    fees: v.number(),
    refunds: v.number(), // positive amount refunded
    net: v.number(), // gross − fees − refunds
    charges: v.number(), // number of charges
    syncedAt: v.number(),
  }).index("by_project_day", ["project", "day"]),

  // One row per ad campaign per day.
  adDaily: defineTable({
    channel: v.string(), // "meta"
    appSlug: v.string(),
    day: v.string(),
    campaignId: v.string(),
    campaignName: v.string(),
    spendEur: v.number(),
    impressions: v.number(),
    clicks: v.number(),
    installs: v.number(), // mobile_app_install actions reported by the platform
    syncedAt: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_campaign_day", ["campaignId", "day"]),
};
