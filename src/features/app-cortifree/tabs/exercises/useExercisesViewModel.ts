import { formatDecimal } from "@/lib/format";
import type {
  BreakdownsP,
  ExOutcomesP,
  IcpSegmentsP,
  KpisP,
  LinesP,
} from "../../data/payloads";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  breakdownBars,
  data,
  fmtNum,
  kpiVM,
  linesChart,
  pct0,
  segmentTable,
  waiting,
  type TableVM,
} from "../../data/vm";

const DONE = "exercise_completed";
const CATS: [string, string][] = [
  ["Respirations", "breathing"],
  ["Méditations", "meditation"],
  ["Sons", "sounds"],
  ["Autres", "other"],
];
const byCat = (c: string) => ({
  event_type: DONE,
  filters: [
    {
      subprop_type: "event",
      subprop_key: "category",
      subprop_op: "is",
      subprop_value: [c],
    },
  ],
});
const BUCKETS = ["0", "1-2", "3-5", "6-10", "11+"];
const BREAKDOWNS = [
  { id: "cat", title: "Par catégorie", event: DONE, prop: "category" },
  {
    id: "top",
    title: "Exercices les plus faits",
    event: DONE,
    prop: "exercise_id",
    limit: 15,
  },
  { id: "source", title: "D'où ils sont lancés", event: DONE, prop: "source" },
  {
    id: "plan",
    title: "Éléments du plan terminés",
    event: "plan_item_completed",
    prop: null,
  },
];

/** Exercices & revenus: practice in the app and how it relates to trial outcomes. */
export function useExercisesViewModel() {
  const { cell } = useWidgets({
    kpis: {
      w: "kpis",
      p: {
        items: [
          { key: "done", t: "metric", events: [DONE], m: "totals" },
          { key: "people", t: "metric", events: [DONE], m: "uniques" },
          {
            key: "plan",
            t: "metric",
            events: ["plan_item_completed"],
            m: "totals",
          },
        ],
      },
    },
    outcomes: { w: "exOutcomes" },
    segment: {
      w: "icpSegments",
      p: {
        prop: "exercises_bucket",
        steps: [
          { event_type: "trial_started", label: "Essai" },
          { event_type: "trial_converted", label: "Converti" },
        ],
      },
    },
    trend: {
      w: "lines",
      p: {
        m: "totals",
        items: CATS.map(([, c]) => ({ key: c, events: [byCat(c)] })),
      },
    },
    breakdowns: {
      w: "breakdowns",
      p: {
        items: BREAKDOWNS.map((b) => ({
          id: b.id,
          event: b.event,
          prop: b.prop,
          limit: b.limit ?? 12,
        })),
      },
    },
  });

  const kpis = mapCell(cell<KpisP>("kpis"), (p) => {
    const by = (k: string) => p.items.find((x) => x.key === k);
    return [
      kpiVM(by("done"), "Exercices terminés", 0, {
        hint: "séances (exercise_completed)",
      }),
      kpiVM(by("people"), "Personnes qui pratiquent", 2, {
        hint: "utilisateurs uniques",
      }),
      kpiVM(by("plan"), "Éléments du plan faits", 4, {
        hint: "plan_item_completed",
      }),
    ];
  });

  const outcomes = mapCell(cell<ExOutcomesP>("outcomes"), (p) => {
    const [conv, off, exp] = ["converted", "cancelled", "expired"].map((k) =>
      p.outcomes.find((o) => o.key === k)!,
    );
    if (![conv, off, exp].some((o) => o && o.total)) {
      return waiting({
        title: "En attente de exercises_bucket",
        note: "Envoyé par l'app avec trial_converted, trial_expired et subscription_auto_renew_off. Les essais finis avant n'ont pas l'info.",
      });
    }
    const avg = (o: typeof conv) =>
      o && o.sum != null && o.total ? formatDecimal(o.sum / o.total) : "—";
    return data<TableVM>({
      columns: [
        { key: "b", header: "Exercices faits" },
        { key: "c", header: "Essai converti", align: "right" },
        { key: "o", header: "Essai annulé", align: "right" },
        { key: "e", header: "Essai expiré", align: "right" },
        { key: "r", header: "% d'annulation", align: "right" },
      ],
      rows: [
        ...BUCKETS.map((b) => {
          const c = conv.counts[b] ?? 0;
          const x = off.counts[b] ?? 0;
          return {
            b,
            c: fmtNum(c),
            o: fmtNum(x),
            e: fmtNum(exp.counts[b] ?? 0),
            r: c + x ? pct0(x / (c + x)) : "—",
          };
        }),
        { b: "Moyenne", c: avg(conv), o: avg(off), e: avg(exp), r: "" },
      ],
      note: "% d'annulation = essais annulés ÷ (annulés + convertis) dans la tranche. Une personne qui annule puis laisse expirer apparaît dans les deux colonnes.",
    });
  });

  const segment = mapCell(cell<IcpSegmentsP>("segment"), (p) => {
    const segs = p.segments
      .filter((s) => s.value !== "(none)")
      .sort((a, b) => BUCKETS.indexOf(a.value) - BUCKETS.indexOf(b.value));
    if (p.missing || !segs.length)
      return waiting({
        title: "En attente de exercises_bucket",
        note: "Propriété utilisateur envoyée par l'app.",
      });
    const t = segmentTable(p.steps, segs, (v) => v, p.steps[0]);
    t.columns[0].header = "Exercices faits";
    return data<TableVM>(t);
  });

  const trend = mapCell(cell<LinesP>("trend"), (p) => {
    const c = linesChart(p, Object.fromEntries(CATS.map(([l, k]) => [k, l])));
    return c.kind === "waiting"
      ? waiting({ title: "Pas encore de données", events: [DONE] })
      : c;
  });

  const breakdowns = mapCell(cell<BreakdownsP>("breakdowns"), (p) =>
    data(
      BREAKDOWNS.map((b, i) => ({
        id: b.id,
        title: b.title,
        bars: breakdownBars(
          p.items.find((x) => x.id === b.id),
          { colorIndex: i },
        ),
      })),
    ),
  );

  return { kpis, outcomes, segment, trend, breakdowns };
}
