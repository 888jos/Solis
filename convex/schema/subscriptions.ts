import { defineTable } from "convex/server";
import { v } from "convex/values";

// Owner: subscriptions agent.
export const subscriptionTables = {
  // Apple SUBSCRIPTION report (SUMMARY, DAILY, 1_4): daily snapshot of active state, aggregated per
  // app × day × subscription product × country (Apple splits lines further by price/device/state/offer).
  appleSubscriptionDaily: defineTable({
    appSlug: v.string(),
    date: v.string(),
    subscriptionName: v.string(),
    subscriptionAppleId: v.string(),
    durationLabel: v.string(), // "7 Days", "1 Month", "1 Year"...
    country: v.string(),
    activeStandard: v.number(), // "Active Standard Price Subscriptions"
    activeIntroTrial: v.number(), // "Active Free Trial Introductory Offer Subscriptions"
    activeIntroPaid: v.number(), // pay up front + pay as you go introductory offers
    activePromo: v.number(), // paid promotional / offer code / win-back offers
    activeFreeOffer: v.optional(v.number()), // free promotional / offer code / win-back offers
    billingRetry: v.number(),
    gracePeriod: v.number(),
    lineKey: v.string(),
  })
    .index("by_app_date", ["appSlug", "date"])
    .index("by_date", ["date"])
    .index("by_line", ["lineKey"]),

  // Apple SUBSCRIPTION_EVENT report (SUMMARY, DAILY, 1_4), aggregated (sum of Quantity) per distinct line.
  appleSubscriptionEvents: defineTable({
    appSlug: v.string(),
    date: v.string(), // "Event Date"
    reportDate: v.optional(v.string()), // report day the line came from (dedupe on resync)
    event: v.string(), // Apple label: "Start Introductory Offer", "Paid Subscription from Introductory Offer", "Renew", "Cancel", "Refund"...
    offerType: v.optional(v.string()), // "Subscription Offer Type": "Free Trial", "Pay As You Go", "Pay Up Front" or ""
    offerDuration: v.optional(v.string()), // "Subscription Offer Duration", e.g. "3 Days"
    durationLabel: v.optional(v.string()), // "Standard Subscription Duration"
    originalStartDate: v.optional(v.string()),
    subscriptionName: v.string(),
    subscriptionAppleId: v.optional(v.string()),
    country: v.string(),
    count: v.number(),
    lineKey: v.string(),
  })
    .index("by_app_date", ["appSlug", "date"])
    .index("by_date", ["date"])
    .index("by_report_date", ["reportDate"])
    .index("by_line", ["lineKey"]),

  // RevenueCat v2 metrics, one row per app per day. History comes from the charts API (mrr, actives,
  // trials, end-of-day values); the current day also gets the overview's 28-day figures.
  revenuecatSnapshots: defineTable({
    appSlug: v.string(),
    date: v.string(),
    mrrUsd: v.number(),
    mrrEur: v.number(),
    usdPerEur: v.optional(v.number()),
    fxDate: v.optional(v.string()),
    activeSubscriptions: v.number(),
    activeTrials: v.number(),
    revenue28dUsd: v.optional(v.number()),
    newCustomers28d: v.optional(v.number()),
    activeUsers28d: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_app_date", ["appSlug", "date"]),
};
