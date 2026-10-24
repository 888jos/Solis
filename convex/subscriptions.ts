import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { APPS } from "./lib/apps";
import { addDays } from "./lib/dates";
import { comparablePrevTo } from "./revenue";

// Subscriptions model (read side). Sources: Apple SUBSCRIPTION + SUBSCRIPTION_EVENT daily reports
// (all apps) and RevenueCat (CortiFree only). Everything is aggregated here; results stay small.
//
// Definitions
//  - Abonnés payants (paid)   = active standard price + active paid intro offers + active paid promo/offer-code/win-back
//                               (Apple SUBSCRIPTION report, end of day). Billing retry and grace period are NOT counted.
//  - Essais en cours (trials) = active free-trial intro offers + free promo/offer-code/win-back offers.
//  - Conversion essai→payant  = cohort rate. Among the free trials STARTED in the period whose trial has already
//      ended (start + offer duration ≤ latest event report day), the share that became paid
//      ("Paid Subscription from Introductory Offer" whose Original Start Date falls in the period, any later date).
//      Trials still running are left out of both sides, so the rate does not drop just because they are young.

export type Plan = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly" | "other";

export function planOf(durationLabel: string): Plan {
  const d = durationLabel.trim().toLowerCase();
  if (d === "7 days" || d === "1 week") return "weekly";
  if (d === "1 month") return "monthly";
  if (d === "2 months" || d === "3 months") return "quarterly";
  if (d === "6 months") return "semiannual";
  if (d === "1 year") return "yearly";
  return "other";
}

export type EventKind = "trialStart" | "conversion" | "newPaid" | "renewal" | "trialCancel" | "cancel" | "refund" | "billingIssue" | "other";

const isFreeTrial = (offerType: string | undefined) => /free trial/i.test(offerType ?? "");

/**
 * Apple SUBSCRIPTION_EVENT label (+ offer type) → our category. Labels seen in the real reports:
 * Start Introductory Offer, Paid Subscription from Introductory Offer, Subscribe, Renew, Renewals from
 * Grace Period, Cancel, Canceled from Billing Retry, Refund, Grace Period from …, Billing Retry from ….
 * A renewal that still carries the Free Trial offer type is the first paid period after a trial
 * recovered from a billing issue: it counts as a conversion.
 */
export function eventKind(event: string, offerType: string | undefined): EventKind {
  const e = event.trim().toLowerCase();
  const trial = isFreeTrial(offerType);
  if (e.startsWith("start introductory") || e === "start free trial") return trial || e === "start free trial" ? "trialStart" : "newPaid";
  if (e.startsWith("paid subscription from introductory")) return "conversion";
  if (e === "subscribe" || e.startsWith("paid subscription from")) return "newPaid";
  if (e.startsWith("renew")) return trial ? "conversion" : "renewal";
  // "Canceled from Billing Retry": the subscription ended after failed renewals (involuntary churn).
  if (e === "cancel" || e.startsWith("canceled from")) return trial ? "trialCancel" : "cancel";
  if (e === "refund") return "refund";
  if (e.startsWith("billing retry") || e.startsWith("grace period")) return "billingIssue";
  return "other";
}

/** "3 Days" / "1 Week" / "1 Month" → days (approximate for months). */
function offerDays(label: string | undefined): number {
  const m = /(\d+)\s*(day|week|month|year)/i.exec(label ?? "");
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
}

function bucketKey(day: string, bucket: "day" | "week" | "month"): string {
  if (bucket === "day") return day;
  if (bucket === "month") return day.slice(0, 7);
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

function bucketsBetween(from: string, to: string, bucket: "day" | "week" | "month"): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = bucketKey(d, bucket);
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

type Counts = { paid: number; trials: number; billing: number };

function countsOf(rows: Doc<"appleSubscriptionDaily">[]): Counts {
  const c = { paid: 0, trials: 0, billing: 0 };
  for (const r of rows) {
    c.paid += r.activeStandard + r.activeIntroPaid + r.activePromo;
    c.trials += r.activeIntroTrial + (r.activeFreeOffer ?? 0);
    c.billing += r.billingRetry + r.gracePeriod;
  }
  return c;
}

/** Latest SUBSCRIPTION report day with data on or before `day` (null if none). */
async function latestDailyDay(ctx: QueryCtx, day: string): Promise<string | null> {
  const row = await ctx.db
    .query("appleReportDays")
    .withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION").lte("date", day))
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "ok"))
    .first();
  return row?.date ?? null;
}

async function dailyRowsOn(ctx: QueryCtx, day: string | null, apps: string[]) {
  if (!day) return [];
  const rows = await ctx.db.query("appleSubscriptionDaily").withIndex("by_date", (q) => q.eq("date", day)).collect();
  return rows.filter((r) => apps.includes(r.appSlug));
}

const EVENT_KINDS: EventKind[] = ["trialStart", "conversion", "newPaid", "renewal", "trialCancel", "cancel", "refund", "billingIssue", "other"];
const emptyEvents = () => Object.fromEntries(EVENT_KINDS.map((k) => [k, 0])) as Record<EventKind, number>;

export const overview = authQuery({
  args: {
    from: v.string(),
    to: v.string(),
    prevFrom: v.string(),
    prevTo: v.string(),
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    app: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { from, to, prevFrom, prevTo, bucket, app }) => {
    const apps = app ? APPS.filter((a) => a.slug === app).map((a) => a.slug as string) : APPS.map((a) => a.slug as string);

    /* --- Active state (Apple SUBSCRIPTION) --- */
    const latestDay = await latestDailyDay(ctx, to);
    const prevDay = await latestDailyDay(ctx, prevTo);
    const latestRows = await dailyRowsOn(ctx, latestDay, apps);
    const prevRows = prevDay && prevDay !== latestDay ? await dailyRowsOn(ctx, prevDay, apps) : [];

    const perApp = apps.map((slug) => {
      const rows = latestRows.filter((r) => r.appSlug === slug);
      const plans: Record<Plan, number> = { weekly: 0, monthly: 0, quarterly: 0, semiannual: 0, yearly: 0, other: 0 };
      for (const r of rows) plans[planOf(r.durationLabel)] += r.activeStandard + r.activeIntroPaid + r.activePromo;
      return { appSlug: slug, ...countsOf(rows), prev: prevDay ? countsOf(prevRows.filter((r) => r.appSlug === slug)) : null, plans };
    });

    // Series: end-of-bucket snapshot (last report day of each bucket), per app.
    const periodRows = (
      await ctx.db
        .query("appleSubscriptionDaily")
        .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
        .collect()
    ).filter((r) => apps.includes(r.appSlug));
    const okDays = (
      await ctx.db
        .query("appleReportDays")
        .withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION").gte("date", from).lte("date", to))
        .collect()
    )
      .filter((d) => d.status === "ok")
      .map((d) => d.date)
      .sort();
    const x = bucketsBetween(from, to, bucket);
    const lastDayOfBucket = new Map<string, string>();
    for (const d of okDays) lastDayOfBucket.set(bucketKey(d, bucket), d);
    const byDayApp = new Map<string, Counts>();
    for (const r of periodRows) {
      const key = `${r.date}|${r.appSlug}`;
      const c = byDayApp.get(key) ?? { paid: 0, trials: 0, billing: 0 };
      const add = countsOf([r]);
      c.paid += add.paid;
      c.trials += add.trials;
      c.billing += add.billing;
      byDayApp.set(key, c);
    }
    const activeSeries = apps.map((slug) => ({
      appSlug: slug,
      paid: x.map((k) => {
        const d = lastDayOfBucket.get(k);
        return d ? (byDayApp.get(`${d}|${slug}`)?.paid ?? 0) : null;
      }),
      trials: x.map((k) => {
        const d = lastDayOfBucket.get(k);
        return d ? (byDayApp.get(`${d}|${slug}`)?.trials ?? 0) : null;
      }),
    }));

    /* --- Events (Apple SUBSCRIPTION_EVENT) --- */
    const lastEventReport = await ctx.db
      .query("appleReportDays")
      .withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION_EVENT"))
      .order("desc")
      .filter((q) => q.neq(q.field("status"), "error"))
      .first();
    // Previous-period event totals cover as many reported days as the current window (Apple lag).
    const prevEventsTo = await comparablePrevTo(ctx, "SUBSCRIPTION_EVENT", to, prevTo);
    // Events from prevFrom onwards (the conversion cohort needs later events too).
    const events = (
      await ctx.db
        .query("appleSubscriptionEvents")
        .withIndex("by_date", (q) => q.gte("date", prevFrom))
        .collect()
    ).filter((e) => apps.includes(e.appSlug));

    const totals = Object.fromEntries(apps.map((s) => [s, emptyEvents()])) as Record<string, Record<EventKind, number>>;
    const prevTotals = emptyEvents();
    const eventSeries = Object.fromEntries(EVENT_KINDS.map((k) => [k, x.map(() => 0)])) as Record<EventKind, number[]>;
    const xIndex = new Map(x.map((k, i) => [k, i]));
    const otherLabels = new Map<string, number>();
    for (const e of events) {
      const kind = eventKind(e.event, e.offerType);
      if (e.date >= from && e.date <= to) {
        totals[e.appSlug][kind] += e.count;
        const i = xIndex.get(bucketKey(e.date, bucket));
        if (i != null) eventSeries[kind][i] += e.count;
        if (kind === "other") otherLabels.set(e.event, (otherLabels.get(e.event) ?? 0) + e.count);
      } else if (e.date >= prevFrom && e.date <= prevEventsTo) {
        prevTotals[kind] += e.count;
      }
    }

    // Conversion cohort (see definition at the top of the file).
    const horizon = lastEventReport?.date ?? to;
    const cohort = (lo: string, hi: string) => {
      const per = Object.fromEntries(apps.map((s) => [s, { started: 0, matured: 0, converted: 0 }])) as Record<string, { started: number; matured: number; converted: number }>;
      for (const e of events) {
        const kind = eventKind(e.event, e.offerType);
        if (kind === "trialStart" && e.date >= lo && e.date <= hi) {
          per[e.appSlug].started += e.count;
          if (addDays(e.date, offerDays(e.offerDuration)) <= horizon) per[e.appSlug].matured += e.count;
        }
        if (kind === "conversion" && e.originalStartDate && e.originalStartDate >= lo && e.originalStartDate <= hi) {
          per[e.appSlug].converted += e.count;
        }
      }
      return per;
    };
    const conv = cohort(from, to);
    const prevConv = cohort(prevFrom, prevTo);
    const sumConv = (per: ReturnType<typeof cohort>) => Object.values(per).reduce((a, c) => ({ started: a.started + c.started, matured: a.matured + c.matured, converted: a.converted + c.converted }), { started: 0, matured: 0, converted: 0 });

    /* --- RevenueCat (CortiFree) --- */
    let revenuecat = null as null | {
      date: string;
      mrrEur: number;
      mrrUsd: number;
      fxDate: string | null;
      activeSubscriptions: number;
      activeTrials: number;
      prevMrrEur: number | null;
      prevMrrUsd: number | null;
      fetchedAt: number;
      series: (number | null)[];
      seriesUsd: (number | null)[];
    };
    if (apps.includes("cortifree")) {
      const snaps = await ctx.db
        .query("revenuecatSnapshots")
        .withIndex("by_app_date", (q) => q.eq("appSlug", "cortifree").gte("date", prevTo).lte("date", addDays(to, 1)))
        .collect();
      // Latest value: the overview row of today when the period ends yesterday, else the period's last day.
      const latest = [...snaps].reverse().find((s) => s.date >= from);
      const prev = snaps.find((s) => s.date === prevTo) ?? null;
      if (latest) {
        const byDate = new Map(snaps.map((s) => [s.date, s.mrrEur]));
        const lastOf = new Map<string, number>();
        const lastUsd = new Map<string, number>();
        for (const s of snaps) {
          if (s.date < from || s.date > to) continue;
          lastOf.set(bucketKey(s.date, bucket), s.mrrEur);
          lastUsd.set(bucketKey(s.date, bucket), s.mrrUsd);
        }
        revenuecat = {
          date: latest.date,
          mrrEur: latest.mrrEur,
          mrrUsd: latest.mrrUsd,
          fxDate: latest.fxDate ?? null,
          activeSubscriptions: latest.activeSubscriptions,
          activeTrials: latest.activeTrials,
          prevMrrEur: prev ? (byDate.get(prev.date) ?? null) : null,
          prevMrrUsd: prev?.mrrUsd ?? null,
          fetchedAt: latest.fetchedAt,
          series: x.map((k) => lastOf.get(k) ?? null),
          seriesUsd: x.map((k) => lastUsd.get(k) ?? null),
        };
      }
    }

    const syncRun = await ctx.db
      .query("syncRuns")
      .withIndex("by_source_started", (q) => q.eq("source", "asc_subscriptions"))
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "ok"))
      .first();
    const anyAppleData = (await ctx.db.query("appleReportDays").withIndex("by_type_date", (q) => q.eq("reportType", "SUBSCRIPTION")).first()) != null;

    return {
      anyAppleData,
      latestDay,
      prevDay,
      lastEventDay: lastEventReport?.date ?? null,
      appleSyncedAt: syncRun ? (syncRun.finishedAt ?? syncRun.startedAt) : null,
      perApp,
      x,
      activeSeries,
      events: { perApp: totals, prev: prevTotals, series: eventSeries, otherLabels: [...otherLabels.entries()].map(([label, count]) => ({ label, count })) },
      conversion: { perApp: conv, total: sumConv(conv), prev: sumConv(prevConv) },
      revenuecat,
    };
  },
});
