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
crons.cron("airtable ugc", "10 2,8,14,20 * * *", internal.sources.airtable.syncRecent, {});
crons.cron("aso metadata + ranks", "15 4 * * *", internal.sources.aso.syncRecent, {});

// Money helpers.
crons.cron("fx rates", "0 5 * * *", internal.fx.syncRecent, {});
crons.cron("ai api costs", "25 5 * * *", internal.sources.aiCosts.syncRecent, {});
// Creates this month's copy of each monthly expense (idempotent): daily so a new template lands quickly.
crons.cron("recurring expenses", "40 0 * * *", internal.expensesData.materializeRecurring, {});

// Telegram: daily brief ~07:30/08:30 Paris; weekly recap Monday afternoon, once Apple has published Sunday.
crons.cron("daily brief", "30 6 * * *", internal.brief.sendDaily, {});
crons.cron("weekly recap", "30 14 * * 1", internal.brief.sendWeekly, {});

export default crons;
