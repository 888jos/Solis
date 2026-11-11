import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Every scheduled sync. Each target is a cheap `syncRecent` (or equivalent) that records a syncRuns row,
// so the Sources page shows the result. Times are UTC; jobs are staggered so they never pile up.
const crons = cronJobs();

// App Store Connect: Apple publishes a Pacific day around 13:00 UTC; 6 h is plenty.
crons.cron("asc sales", "5 */6 * * *", internal.sources.revenue.syncRecent, {});
// Apple subscription reports + RevenueCat (CortiFree) run in the same action.
crons.cron("subscriptions + revenuecat", "20 */3 * * *", internal.sources.subscriptions.syncRecent, {});
crons.cron("reviews + ratings", "35 */6 * * *", internal.sources.reviews.syncRecent, {});
crons.cron("versions + builds", "45 */6 * * *", internal.sources.versions.syncRecent, {});

// Product analytics.
crons.cron("amplitude + posthog", "50 1,7,13,19 * * *", internal.sources.engagement.syncRecent, {});

// Growth.
// Post for Me: every account's posts and metrics (page Performance).
crons.cron("post for me", "7 */3 * * *", internal.sources.postforme.syncRecent, {});
crons.cron("airtable ugc", "10 2,8,14,20 * * *", internal.sources.airtable.syncRecent, {});
// App Store Analytics Reports (impressions, product page views, first downloads by source): daily instances.
crons.cron("asc analytics", "10 7,15 * * *", internal.sources.ascAnalytics.syncRecent, {});
// Apple Ads search term popularity: Apple publishes the previous week on Mondays 07:00 UTC.
crons.cron("apple ads popularity", "30 9 * * 1", internal.sources.appleAds.syncRecent, {});
crons.cron("aso metadata + ranks", "15 4 * * *", internal.sources.aso.syncRecent, {});

// Stripe (Otto) and Meta Ads (CortiFree): skipped until their keys are set on Convex.
crons.cron("stripe otto", "25 */6 * * *", internal.sources.stripe.syncRecent, {});
crons.cron("meta ads", "40 3,9,15,21 * * *", internal.sources.metaAds.syncRecent, {});

// Money helpers.
crons.cron("fx rates", "0 5 * * *", internal.fx.syncRecent, {});
crons.cron("ai api costs", "25 5 * * *", internal.sources.aiCosts.syncRecent, {});
// Creates this month's copy of each monthly expense (idempotent): daily so a new template lands quickly.
crons.cron("recurring expenses", "40 0 * * *", internal.expensesData.materializeRecurring, {});

// Watchdog: one Telegram message when a source breaks or falls behind, one when it is back.
crons.cron("source watchdog", "55 * * * *", internal.watchdog.checkSources, {});
// Unusual moves on the last data day (Apple publishes ~13:00 UTC, Otto is pushed from the Mac).
crons.cron("anomalies", "20 15 * * *", internal.watchdog.checkAnomalies, {});

// Telegram: daily brief ~07:30/08:30 Paris; weekly recap Monday afternoon, once Apple has published Sunday.
crons.cron("daily brief", "30 6 * * *", internal.brief.sendDaily, {});
crons.cron("weekly recap", "30 14 * * 1", internal.brief.sendWeekly, {});
// Weekly review written by Claude from the week's aggregates, right after the numbers recap.
crons.cron("weekly review", "45 14 * * 1", internal.review.weekly, {});

export default crons;
