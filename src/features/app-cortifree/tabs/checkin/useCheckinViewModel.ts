import { formatDecimal, formatPct } from "@/lib/format";
import type {
  BreakdownsP,
  CiAveragesP,
  KpisP,
  LinesP,
} from "../../data/payloads";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  breakdownBars,
  color,
  data,
  kpiVM,
  linesChart,
  waiting,
  waitingFor,
  type TableVM,
} from "../../data/vm";

const SHOWN = ["daily_checkin_shown"];
const DONE = ["daily_checkin_completed"];
const SKIPPED = ["daily_checkin_skipped"];
const CARD = ["daily_checkin_home_card_tapped"];

const BREAKDOWNS = [
  {
    id: "day",
    title: "Bilan d'aujourd'hui ou d'hier",
    event: DONE[0],
    prop: "day",
  },
  { id: "mood", title: "Humeur", event: DONE[0], prop: "mood" },
  {
    id: "stress",
    title: "Stress (1 calme → 5 stressé)",
    event: DONE[0],
    prop: "stress",
    sortNumeric: true,
  },
  {
    id: "sleep",
    title: "Sommeil (1 → 5)",
    event: DONE[0],
    prop: "sleep",
    sortNumeric: true,
  },
  {
    id: "energy",
    title: "Énergie (1 → 5)",
    event: DONE[0],
    prop: "energy",
    sortNumeric: true,
  },
  { id: "note", title: "Avec une note", event: DONE[0], prop: "has_note" },
  {
    id: "skipStep",
    title: "Passé à quelle question",
    event: SKIPPED[0],
    prop: "step",
  },
  {
    id: "shownDay",
    title: "Vu : aujourd'hui ou hier",
    event: SHOWN[0],
    prop: "day",
  },
  {
    id: "streak",
    title: "Série en cours au check-in",
    event: DONE[0],
    prop: "current_streak",
    sortNumeric: true,
    limit: 20,
  },
];

/** Daily check-in (the evening recap drawer): reach, completion, answers. */
export function useCheckinViewModel() {
  const { cell } = useWidgets({
    kpis: {
      w: "kpis",
      p: {
        items: [
          { key: "shown", t: "metric", events: SHOWN, m: "uniques" },
          { key: "done", t: "metric", events: DONE, m: "uniques" },
          { key: "skipped", t: "metric", events: SKIPPED, m: "uniques" },
          { key: "rate", t: "ratio", num: DONE, den: SHOWN },
          { key: "card", t: "metric", events: CARD, m: "totals" },
        ],
      },
    },
    trend: {
      w: "lines",
      p: {
        m: "uniques",
        items: [
          { key: "shown", events: SHOWN },
          { key: "done", events: DONE },
          { key: "skipped", events: SKIPPED },
        ],
      },
    },
    averages: { w: "ciAverages" },
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
      kpiVM(by("shown"), "Ont vu le check-in", 0, {
        foot: () => "utilisateurs uniques",
      }),
      kpiVM(by("done"), "L'ont terminé", 2, {
        foot: () => "utilisateurs uniques",
      }),
      kpiVM(by("skipped"), "Ont passé", 4, {
        foot: () => "utilisateurs uniques",
      }),
      kpiVM(by("rate"), "Taux de complétion", 6, {
        format: (v) => formatPct(v),
        foot: () => "terminés / vus (événements)",
      }),
      kpiVM(by("card"), "Ouverts depuis l'accueil", 1, {
        foot: () => "événements",
      }),
    ];
  });

  const trend = mapCell(cell<LinesP>("trend"), (p) =>
    linesChart(
      p,
      { shown: "Vu", done: "Terminé", skipped: "Passé" },
      { colors: { shown: color(0), done: color(2), skipped: color(4) } },
    ),
  );

  const averages = mapCell(cell<CiAveragesP>("averages"), (p) => {
    if (p.missing) return waiting(waitingFor(DONE));
    const fmt = (v: number | null, max: number) =>
      v == null ? "—" : `${formatDecimal(v)} / ${max}`;
    return data<TableVM>({
      columns: [
        { key: "q", header: "Question" },
        { key: "avg", header: "Moyenne", align: "right" },
        { key: "read", header: "Lecture", muted: true },
      ],
      rows: [
        { q: "Humeur", avg: fmt(p.mood, 6), read: "1 = terrible … 6 = génial" },
        {
          q: "Stress",
          avg: fmt(p.stress, 5),
          read: "1 = très calme … 5 = très stressé",
        },
        {
          q: "Sommeil",
          avg: fmt(p.sleep, 5),
          read: "1 = très mal … 5 = très bien",
        },
        {
          q: "Énergie",
          avg: fmt(p.energy, 5),
          read: "1 = à plat … 5 = au top",
        },
      ],
    });
  });

  const breakdowns = mapCell(cell<BreakdownsP>("breakdowns"), (p) =>
    data(
      BREAKDOWNS.map((b, i) => ({
        id: b.id,
        title: b.title,
        bars: breakdownBars(
          p.items.find((x) => x.id === b.id),
          { sortNumeric: b.sortNumeric, colorIndex: i },
        ),
      })),
    ),
  );

  return { kpis, trend, averages, breakdowns };
}
