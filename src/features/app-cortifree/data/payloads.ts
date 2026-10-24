// Shapes of the widget payloads computed by convex/sources/cortifreeAnalytics.ts.

export type Filter = {
  subprop_type: string;
  subprop_key: string;
  subprop_op: string;
  subprop_value: string[];
};
export type Spec = { event_type: string; filters?: Filter[] };

export type CatalogEvent = {
  name: string;
  display: string;
  weekTotal: number;
  weekDelta: number | null;
  hidden: boolean;
};
export type CatalogP = {
  events: CatalogEvent[];
  amplitudeHost: string;
  revenuecatConfigured: boolean;
};

export type KpiOut = {
  key: string;
  missing?: string[];
  missingNote?: string;
  value: number | null;
  prev?: number | null;
  spark?: (number | null)[];
  events?: string[];
  users?: number;
  extra?: Record<string, any>;
};
export type KpisP = { items: KpiOut[] };

export type LineOut = {
  key: string;
  missing: boolean;
  candidates: string[];
  events: string[];
  values: number[];
  total: number;
};
export type LinesP = { x: string[]; lines: LineOut[] };

export type UsersP = { x: string[]; active: number[]; fresh: number[] };

export type BreakdownRow = { value: string; total: number; series?: number[] };
export type BreakdownOut = {
  id: string;
  event: string;
  prop: string | null;
  missing: boolean;
  reason: string | null;
  rows: BreakdownRow[];
  x: string[];
};
export type BreakdownsP = { items: BreakdownOut[] };

export type FunnelP = {
  computed: boolean;
  steps: {
    label: string;
    event: string;
    count: number;
    medianMs: number | null;
  }[];
  waiting: string[];
};

export type OnboardingP = {
  missing: boolean;
  flows: { id: string; label: string; users: number }[];
  flow: string | null;
  flowLabel: string | null;
  steps: {
    screen: string;
    users: number;
    order: number;
    stepNumbers: number[];
  }[];
};

export type OnboardingStepP = {
  screen: string;
  events: { name: string; users: number; totals: number }[];
  quiz:
    | {
        number: number | string;
        text: string;
        viewed: number;
        answered: number;
        avgSeconds: number | null;
        answers: { text: string; users: number }[];
      }[]
    | null;
  answersTracked?: boolean;
};

export type ObDailyP = {
  missing: boolean;
  x: string[];
  first: { screen: string; values: number[] } | null;
  last: { screen: string; values: number[] } | null;
};

export type IcpSegmentsP = {
  missing: boolean;
  prop: string;
  steps: string[];
  segments: { value: string; counts: number[] }[];
};
export type IcpAllP = {
  steps: { label: string; event: string }[];
  notYet: string[];
  dims: (IcpSegmentsP & { error?: string | null })[];
  partial?: boolean;
};

export type ObTimeP = {
  rows: { path: string; completed: number; totalSeconds: number | null }[];
};
export type TopEventsP = { rows: { name: string; total: number }[] };
export type ProductMixP = {
  sources: string[];
  rows: { product: string; counts: Record<string, number> }[];
};
export type PaywallsP = {
  events: string[];
  missing: string[];
  rows: { value: string; counts: Record<string, number> }[];
};
export type RevenueAmpP = {
  candidates: string[];
  series: { event: string; x: string[]; values: number[]; total: number }[];
  ltv: {
    totalRevenue: Record<string, number>;
    arpu: Record<string, number>;
  } | null;
};
export type LifecycleP = {
  rows: { event: string; current: number; previous: number }[];
  missing: string[];
};
export type RetentionP = {
  cohortSize: number;
  days: { day: number; count: number; outof: number; incomplete: boolean }[];
  cohorts: {
    date: string;
    day: string | null;
    size: number;
    days: (number | null)[];
  }[];
};
export type SessionsPerUserP = {
  missing: boolean;
  x: string[];
  values: (number | null)[];
};
export type RatingsP = {
  missing: boolean;
  types: { type: string; count: number; average: number }[];
  contents: {
    key: string;
    type: string;
    id: string;
    title: string;
    count: number;
    average: number;
    distribution: number[];
  }[];
};
export type CiAveragesP = {
  missing: boolean;
  mood: number | null;
  stress: number | null;
  sleep: number | null;
  energy: number | null;
};
export type NtPermissionP = {
  source: "user" | "event" | null;
  rows: BreakdownRow[];
  reason: string | null;
  alt: { event: string; prop: string } | null;
};
export type NtByTypeP = {
  rows: {
    type: string;
    scheduled: number;
    delivered: number;
    opened: number;
  }[];
};
export type ExOutcomesP = {
  buckets: string[];
  outcomes: {
    key: string;
    counts: Record<string, number>;
    total: number;
    sum: number | null;
  }[];
};
export type ExplorerEventP = {
  missing: boolean;
  x: string[];
  totals: number[];
  uniques: number[];
  total: number;
  users: number;
  prevTotal: number;
};
export type ExplorerPropsP = { event: string[]; user: string[] };

export type RcOverviewP =
  | { configured: false }
  | {
      configured: true;
      currency: string;
      metrics: {
        id: string;
        name: string;
        description: string | null;
        unit: string | null;
        period: string | null;
        value: number | null;
      }[];
    };
export type RcChart =
  | { configured: false; chart: string }
  | {
      configured: true;
      chart: string;
      name: string;
      currency: string | null;
      measures: {
        name: string;
        unit: string | null;
        chartable: boolean;
        description: string | null;
      }[];
      x: string[];
      series: (number | null)[][];
      summary: Record<string, Record<string, number>> | null;
    };
export type RcChartsP = { charts: RcChart[] };
