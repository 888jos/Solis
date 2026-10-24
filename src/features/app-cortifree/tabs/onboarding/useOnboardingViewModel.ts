import { formatPct } from "@/lib/format";
import type {
  BreakdownsP,
  FunnelP,
  IcpSegmentsP,
  ObDailyP,
  ObTimeP,
  OnboardingP,
  OnboardingStepP,
} from "../../data/payloads";
import { useUrlParam } from "../../data/url";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  amplitudeFunnel,
  breakdownBars,
  color,
  data,
  dayAxis,
  fmtDuration,
  fmtNum,
  funnelSteps,
  pct0,
  segmentTable,
  waiting,
  waitingFor,
  type ChartVM,
  type FunnelVM,
  type TableVM,
} from "../../data/vm";

export const PATH_LABELS: Record<string, string> = {
  ai: "Mon IA répond",
  manual: "Je réponds moi-même",
  ai_to_manual: "IA puis à la main",
  undecided: "Avant le choix",
};

const PATH_STEPS = [
  { event_type: "onboarding_quiz_mode_selected", label: "Choix du quiz" },
  { event_type: "onboarding_completed", label: "Onboarding fini" },
  { event_type: "paywall_open", label: "Paywall vu" },
  { event_type: "trial_started", label: "Essai" },
  { event_type: "subscription_purchased", label: "Achat" },
];
const mode = (m: string) => ({
  event_type: "onboarding_quiz_mode_selected",
  filters: [
    {
      subprop_type: "event",
      subprop_key: "mode",
      subprop_op: "is",
      subprop_value: [m],
    },
  ],
});

/** Onboarding: screens funnel (with per-screen detail), conversion funnels, AI vs manual path. */
export function useOnboardingViewModel() {
  const [flowParam, setFlow] = useUrlParam("flow", "");
  const flow = flowParam || null;
  const { cell } = useWidgets({
    onboarding: { w: "onboarding", p: { flow } },
    daily: { w: "obDaily", p: { flow } },
    acq: { w: "obAcqPaywall", p: { flow } },
    paywall: {
      w: "funnel",
      p: {
        steps: [
          {
            label: "Paywall vu",
            events: ["paywall_open", "onboarding_paywall_viewed"],
          },
          { label: "Transaction démarrée", events: ["transaction_start"] },
          {
            label: "Essai démarré",
            events: ["trial_started", "rc_trial_started_event"],
          },
          {
            label: "Essai converti",
            events: ["trial_converted", "rc_trial_converted_event"],
          },
          {
            label: "Achat / abonnement",
            events: [
              "transaction_complete",
              "subscription_started",
              "subscription_purchased",
              "rc_initial_purchase_event",
            ],
          },
        ],
      },
    },
    path: {
      w: "icpSegments",
      p: { prop: "onboarding_path", steps: PATH_STEPS },
    },
    aiPath: {
      w: "funnel",
      p: {
        steps: [
          { label: "Clic « Mon IA répond »", spec: mode("ai_picker") },
          { label: "App IA choisie (prompt copié)", spec: mode("ai") },
          {
            label: "Revenu dans CortiFree",
            events: ["onboarding_ai_quiz_return"],
          },
          { label: "Réponse collée", events: ["onboarding_ai_quiz_pasted"] },
          { label: "Plan confirmé", events: ["onboarding_ai_quiz_confirmed"] },
        ],
      },
    },
    time: { w: "obTime" },
    splits: {
      w: "breakdowns",
      p: {
        items: [
          {
            id: "aiApp",
            event: "onboarding_quiz_mode_selected",
            prop: "ai_app",
            m: "uniques",
            limit: 10,
          },
          {
            id: "aiReply",
            event: "onboarding_ai_quiz_pasted",
            prop: "success",
            m: "uniques",
            limit: 20,
          },
          {
            id: "leftScreen",
            event: "onboarding_backgrounded",
            prop: "screen_name",
            m: "uniques",
            limit: 20,
          },
          {
            id: "leftPath",
            event: "onboarding_backgrounded",
            prop: "onboarding_path",
            m: "uniques",
            limit: 20,
          },
        ],
      },
    },
  });

  const ob = cell<OnboardingP>("onboarding");
  const flowOptions =
    ob.state === "ready" && ob.data.flows.length
      ? [
          ...ob.data.flows.map((f) => ({
            value: f.id,
            label: `${f.label} · ${fmtNum(f.users)} utilis.`,
          })),
          { value: "all", label: "Tous les flows confondus" },
        ]
      : null;
  const flowValue = ob.state === "ready" ? (ob.data.flow ?? "") : "";

  const screens = mapCell(ob, (p) => {
    if (p.missing)
      return waiting(
        waitingFor(
          ["onboarding_screen_viewed"],
          "Pas encore d'onboarding tracé",
        ),
      );
    if (!p.steps.length)
      return waiting({ title: "Aucun écran vu sur cette période" });
    const first = p.steps[0].users;
    const last = p.steps[p.steps.length - 1].users;
    return data<FunnelVM>({
      steps: funnelSteps(
        p.steps.map((s) => ({
          key: s.screen,
          label: s.screen,
          count: s.users,
          hint: `step_number ${s.stepNumbers.join(", ")} · clique pour le détail`,
        })),
      ),
      tags: [
        `Complétion ${formatPct(first ? last / first : null)}`,
        `${p.steps.length} écrans`,
        `${fmtNum(first)} → ${fmtNum(last)} utilisateurs`,
        p.flowLabel ?? "",
      ].filter(Boolean),
      note: "Clique sur un écran pour voir son détail (questions et réponses des quiz, événements envoyés). Les écrans optionnels (variantes A/B) peuvent avoir moins d'utilisateurs que l'étape suivante. Par défaut : la dernière version de l'onboarding (onboarding_version) ; les anciens flows restent dans le menu.",
    });
  });

  const daily = mapCell(cell<ObDailyP>("daily"), (p) =>
    p.missing || !p.first || !p.last
      ? waiting(waitingFor(["onboarding_screen_viewed"]))
      : data<ChartVM>({
          x: p.x,
          series: [
            {
              key: "first",
              label: `Début (${p.first.screen})`,
              color: color(0),
              values: p.first.values,
            },
            {
              key: "last",
              label: `Fin (${p.last.screen})`,
              color: color(2),
              values: p.last.values,
            },
          ],
          formatValue: fmtNum,
          ...dayAxis,
        }),
  );

  const acq = mapCell(cell<FunnelP>("acq"), amplitudeFunnel);
  const paywall = mapCell(cell<FunnelP>("paywall"), amplitudeFunnel);
  const aiPath = mapCell(cell<FunnelP>("aiPath"), amplitudeFunnel);

  const path = mapCell(cell<IcpSegmentsP>("path"), (p) => {
    const segs = p.segments.filter((s) => s.value !== "(none)");
    if (p.missing || !segs.length)
      return waiting({
        title: "En attente de onboarding_path",
        note: "Envoyé par l'app à partir de l'écran du choix IA / manuel.",
      });
    const t = segmentTable(
      p.steps,
      segs,
      (v) => PATH_LABELS[v] ?? v,
      p.steps[0],
    );
    t.columns[0].header = "Parcours";
    return data<TableVM>(t);
  });

  const time = mapCell(cell<ObTimeP>("time"), (p) =>
    p.rows.length
      ? data<TableVM>({
          columns: [
            { key: "path", header: "Parcours" },
            { key: "n", header: "Onboardings finis", align: "right" },
            { key: "t", header: "Temps moyen", align: "right" },
          ],
          rows: p.rows.map((r) => ({
            path: PATH_LABELS[r.path] ?? r.path,
            n: fmtNum(r.completed),
            t:
              r.totalSeconds != null && r.completed
                ? fmtDuration((r.totalSeconds / r.completed) * 1000)
                : "—",
          })),
        })
      : waiting(
          waitingFor(
            ["onboarding_completed"],
            "Pas encore de temps d'onboarding",
            "total_time_seconds et onboarding_path sont envoyés avec onboarding_completed.",
          ),
        ),
  );

  const splits = mapCell(cell<BreakdownsP>("splits"), (p) => {
    const by = (id: string) => p.items.find((i) => i.id === id);
    return data({
      aiApp: breakdownBars(by("aiApp"), { share: true, dropNone: true }),
      aiReply: breakdownBars(by("aiReply"), {
        share: true,
        dropNone: true,
        labels: { true: "Oui", false: "Non (l'IA n'a pas suivi le format)" },
        colorIndex: 2,
      }),
      leftScreen: breakdownBars(by("leftScreen"), {
        share: true,
        dropNone: true,
        colorIndex: 3,
      }),
      leftPath: breakdownBars(by("leftPath"), {
        share: true,
        dropNone: true,
        labels: PATH_LABELS,
        colorIndex: 3,
      }),
    });
  });

  return {
    flowOptions,
    flowValue,
    setFlow: (v: string) => setFlow(v),
    screens,
    daily,
    acq,
    paywall,
    aiPath,
    path,
    time,
    splits,
  };
}

/** Detail under one funnel row: quiz questions with their answers, and the screen's own events. */
export function useStepDetailViewModel(screen: string) {
  const { cell } = useWidgets({ step: { w: "onboardingStep", p: { screen } } });
  return mapCell(cell<OnboardingStepP>("step"), (p) => {
    const quiz = (p.quiz ?? []).map((q, i, all) => {
      const prev = i > 0 ? all[i - 1].answered : null;
      const lost = prev ? (prev - q.viewed) / prev : null;
      const total = q.answers.reduce((t, a) => t + a.users, 0);
      return {
        key: String(q.number),
        title: `Q${q.number}`,
        text: q.text || `Question ${q.number}`,
        tags: [
          `${fmtNum(q.viewed)} vus`,
          `${fmtNum(q.answered)} répondus${q.viewed ? ` · ${pct0(q.answered / q.viewed)}` : ""}`,
          ...(q.avgSeconds != null
            ? [`${String(q.avgSeconds).replace(".", ",")} s en moyenne`]
            : []),
          ...(lost != null && lost > 0
            ? [`−${pct0(lost)} vs Q${all[i - 1].number}`]
            : []),
        ],
        answers: q.answers.map((a) => ({
          key: a.text,
          label: a.text,
          value: a.users,
          color: color(0),
          hint: a.text,
        })),
        formatAnswer: (v: number) =>
          `${fmtNum(v)} · ${pct0(total ? v / total : null)}`,
      };
    });
    return data({
      intro: quiz.length
        ? `${quiz.length} questions · utilisateurs uniques${p.answersTracked === false ? " · réponses pas encore envoyées par cette version de l'app" : ""}`
        : null,
      quiz,
      events: p.events.length
        ? ({
            columns: [
              { key: "name", header: "Événement" },
              { key: "users", header: "Utilisateurs", align: "right" },
              { key: "totals", header: "Total", align: "right" },
            ],
            rows: p.events.map((e) => ({
              name: e.name,
              users: fmtNum(e.users),
              totals: fmtNum(e.totals),
            })),
          } satisfies TableVM)
        : null,
      empty:
        !quiz.length && !p.events.length
          ? "Pas d'autre événement pour cet écran sur la période (seulement onboarding_screen_viewed)."
          : null,
    });
  });
}
