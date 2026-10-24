// Shape of the cached PostHog summary built by convex/sources/questirlAnalytics.ts.
// Rates are integer percents (0-100), durations in seconds unless named *Minutes.

export type Count = { name: string; count: number };

export type DailyRow = {
  date: string;
  activeUsers: number;
  events: number;
  pageViews: number;
  questsKept: number;
  onboardingScreens: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  paywallViewed: number;
  paywallPurchased: number;
  notificationScheduled: number;
  notificationOpened: number;
  notificationForeground: number;
  notificationCancelled: number;
  notificationAssistedPurchases: number;
  notificationAssistedQuestCompletions: number;
};

export type DropoffRow = {
  stepID: string;
  stepIndex: number | null;
  viewed: number;
  completed: number;
  users: number;
  attempts: number;
  completedAttempts: number;
  nextStepID: string | null;
  nextViewed: number;
  dropoff: number;
  continueRate: number | null;
  completionRate: number;
  avgDuration: number;
  medianDuration: number;
  p90Duration: number;
  exits: number;
  backgroundExits: number;
};

export type SegmentRow = { name: string; started: number; completed: number; paywallReached: number; converted: number; completionRate: number; paywallRate: number; conversionRate: number };

export type ReferralRow = {
  name: string;
  submitted: number;
  completed: number;
  paywallViewers: number;
  buyers: number;
  attempts: number;
  purchaseEvents: number;
  revenue: number;
  rawExamples: string[];
  firstSeenAt: string;
  latestSeenAt: string;
  conversionRate: number;
  paywallConversionRate: number;
};

export type NotificationCategory = { name: string; scheduled: number; opened: number; foreground: number; cancelled: number; scheduleFailures: number; usersOpened: number; latestOpenedAt: string; openRate: number };

export type FunnelStage = { id: string; label: string; count: number; fromPreviousRate: number; absoluteRate: number; dropoffFromPrevious: number };

export type RecentEvent = { timestamp: string; user: string; event: string; page: string; props: string };

export type QuestirlSummary = {
  generatedAt: string;
  analyticsSchema: "v2" | "legacy";
  range: { from: string; to: string; start: string; end: string };
  ingestion: { eventCount: number; latestEventAt: string | null; hasSchemaV2Events: boolean; retentionDay: string | null };
  projectID: string;
  cards: {
    dau: number; wau: number; mau: number; users: number; events: number; pageViews: number;
    onboardingStarted: number; onboardingCompleted: number; onboardingClosed: number;
    onboardingCompletionRate: number; onboardingAbandonmentRate: number; returningAttemptRate: number; resumedAttempts: number;
    medianCompletionMinutes: number; p90CompletionMinutes: number;
    paywallViewers: number; paywallBuyers: number; onboardingPaywallReached: number; trialStarted: number; paywallConversionRate: number;
    notificationScheduled: number; notificationOpened: number; notificationOpenRate: number; notificationAssistedPurchases: number;
    questionsAnswered: number; avgStepDuration: number; questKept: number; questPassed: number; manualTasks: number;
    d1Retention: number; d7Retention: number;
  };
  daily: DailyRow[];
  eventCounts: Count[];
  pages: Count[];
  steps: Count[];
  dropoff: DropoffRow[];
  questions: Count[];
  answers: Count[];
  heroes: Count[];
  sources: Count[];
  languages: SegmentRow[];
  devices: SegmentRow[];
  selectedGoals: SegmentRow[];
  painPoints: SegmentRow[];
  referralSegments: SegmentRow[];
  dominantHeroes: SegmentRow[];
  referrals: ReferralRow[];
  notifications: {
    scheduled: number; opened: number; foreground: number; openRate: number;
    permissionRequests: number; permissionResults: number; permissionGranted: number; permissionDenied: number;
    permissionOptInRate: number; permissionDeniedRate: number;
    assistedOnboardingCompleted: number; assistedPaywallPurchased: number; questCompletedWithin2h: number; streakProtectedWithin2h: number;
    categories: NotificationCategory[];
    lifecycleBreakdown: Count[];
    copyVariants: Count[];
    onboardingByStep: Count[];
    retentionByProgramDay: Count[];
  };
  keyFunnel: FunnelStage[];
  funnelHealth: { worstDropoff: DropoffRow | null; slowestStep: DropoffRow | null };
  recentEvents: RecentEvent[];
};

/** A KPI tile ready to render. */
export type KpiItem = { key: string; label: string; value: string; foot?: string; hint?: string };
