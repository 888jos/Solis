import { useMemo } from "react";
import type { BarListItem } from "@/ui";
import { formatInt, formatMinutes, formatSeconds, pct100 } from "../format";
import type { FunnelStep } from "../components/Funnel";
import type { KpiItem, QuestirlSummary } from "../types";

export type FrictionRow = { key: string; index: string; step: string; attempts: string; completion: string; next: string; continueRate: string; dropoff: string; dropoffValue: number; median: string; p90: string; exits: string };

/** Onboarding: attempts funnel (one unit = one onboarding attempt), friction per screen, timings. */
export function useOnboardingViewModel(data: QuestirlSummary | null) {
  return useMemo(() => {
    if (!data) return null;
    const c = data.cards;
    const kpis: KpiItem[] = [
      { key: "started", label: "Tentatives d'onboarding", value: formatInt(c.onboardingStarted), foot: `${pct100(c.returningAttemptRate)} de visites de retour`, hint: "onboarding_started, une par tentative (onboarding_attempt_id)" },
      { key: "completed", label: "Onboardings terminés", value: formatInt(c.onboardingCompleted), foot: `${pct100(c.onboardingCompletionRate)} des tentatives`, hint: "onboarding_completed (transaction Superwall), hors hard paywall atteint" },
      { key: "closed", label: "Abandons", value: formatInt(c.onboardingClosed), foot: `${pct100(c.onboardingAbandonmentRate)} des tentatives`, hint: "onboarding_closed : onboarding quitté sans transaction" },
      { key: "resumed", label: "Sessions reprises", value: formatInt(c.resumedAttempts), foot: "retour après mise en arrière-plan", hint: "Tentatives avec onboarding_session_resumed" },
    ];
    const kpis2: KpiItem[] = [
      { key: "median", label: "Durée médiane jusqu'à la fin", value: formatMinutes(c.medianCompletionMinutes), foot: `P90 ${formatMinutes(c.p90CompletionMinutes)}`, hint: "elapsed_since_first_seen_seconds sur les onboardings terminés" },
      { key: "step", label: "Durée moyenne par écran", value: formatSeconds(c.avgStepDuration), foot: "écrans validés", hint: "duration_seconds des onboarding_step_completed (< 10 min)" },
      { key: "answers", label: "Réponses aux questions", value: formatInt(c.questionsAnswered), foot: "onboarding_question_answered" },
      { key: "paywall", label: "Paywall atteint", value: formatInt(c.onboardingPaywallReached), foot: "tentatives", hint: "onboarding_paywall_reached" },
    ];

    const stages = data.keyFunnel;
    const top = Math.max(1, ...stages.map((s) => s.count));
    const funnel: FunnelStep[] = stages.map((s, i) => ({
      key: s.id,
      label: s.label,
      value: formatInt(s.count),
      widthPct: (s.count / top) * 100,
      shade: Math.round(100 - (i * 55) / Math.max(1, stages.length - 1)),
      share: i === 0 ? "100 %" : pct100(s.absoluteRate),
      conversion: i === 0 ? null : `${pct100(s.fromPreviousRate)} passent`,
      lost: i === 0 || !s.dropoffFromPrevious ? null : `− ${formatInt(s.dropoffFromPrevious)}`,
    }));

    const friction: FrictionRow[] = data.dropoff.map((r) => ({
      key: r.stepID,
      index: r.stepIndex == null ? "—" : String(r.stepIndex),
      step: r.stepID,
      attempts: formatInt(r.attempts),
      completion: pct100(r.completionRate),
      next: r.nextStepID ? formatInt(r.nextViewed) : "—",
      continueRate: r.continueRate == null ? "—" : pct100(r.continueRate),
      dropoff: r.nextStepID ? formatInt(r.dropoff) : "—",
      dropoffValue: r.dropoff,
      median: formatSeconds(r.medianDuration),
      p90: formatSeconds(r.p90Duration),
      exits: r.backgroundExits ? `${formatInt(r.exits)} (${formatInt(r.backgroundExits)})` : formatInt(r.exits),
    }));

    const slowest: BarListItem[] = data.dropoff
      .filter((r) => r.medianDuration > 0)
      .sort((a, b) => b.medianDuration - a.medianDuration)
      .map((r) => ({ key: r.stepID, label: r.stepID, value: r.medianDuration, color: "var(--series-1)", hint: `${r.stepID} : médiane ${formatSeconds(r.medianDuration)}, P90 ${formatSeconds(r.p90Duration)}` }));

    return { kpis, kpis2, funnel, hasFunnel: (stages[0]?.count ?? 0) > 0, friction, slowest, legacy: data.analyticsSchema !== "v2" };
  }, [data]);
}
