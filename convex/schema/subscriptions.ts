import { defineTable } from "convex/server";
import { v } from "convex/values";

// Owner: subscriptions agent.
export const subscriptionTables = {
  // Apple SUBSCRIPTION report (daily snapshot of active state per subscription product).
  appleSubscriptionDaily: defineTable({
    appSlug: v.string(),
    date: v.string(),
    subscriptionName: v.string(),
    subscriptionAppleId: v.string(),
    durationLabel: v.string(), // "1 Week", "1 Month", "1 Year"...
    country: v.string(),
    activeStandard: v.number(),
    activeIntroTrial: v.number(), // free trials
    activeIntroPaid: v.number(),
    activePromo: v.number(),
    billingRetry: v.number(),
    gracePeriod: v.number(),
    lineKey: v.string(),
  })
    .index("by_app_date", ["appSlug", "date"])
    .index("by_date", ["date"])
    .index("by_line", ["lineKey"]),

  // Apple SUBSCRIPTION_EVENT report (trial starts, conversions, cancellations, refunds...).
  appleSubscriptionEvents: defineTable({
    appSlug: v.string(),
    date: v.string(),
    event: v.string(), // Apple event label, e.g. "Start Introductory Price", "Paid Subscription from Introductory Price", "Cancel"
    subscriptionName: v.string(),
    country: v.string(),
    count: v.number(),
    lineKey: v.string(),
  })
    .index("by_app_date", ["appSlug", "date"])
    .index("by_date", ["date"])
    .index("by_line", ["lineKey"]),

  // RevenueCat v2 overview metrics snapshot (one per app per day; latest wins).
  revenuecatSnapshots: defineTable({
    appSlug: v.string(),
    date: v.string(),
    mrrUsd: v.number(),
    mrrEur: v.number(),
    activeSubscriptions: v.number(),
    activeTrials: v.number(),
    revenue28dUsd: v.number(),
    newCustomers28d: v.number(),
    activeUsers28d: v.number(),
    fetchedAt: v.number(),
  }).index("by_app_date", ["appSlug", "date"]),
};
