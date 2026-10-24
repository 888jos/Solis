import { formatDecimal, formatDay, formatPct } from "@/lib/format";
import type {
  BreakdownsP,
  KpisP,
  LinesP,
  RatingsP,
  RetentionP,
  SessionsPerUserP,
} from "../../data/payloads";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  breakdownBars,
  color,
  data,
  dayAxis,
  fmtNum,
  kpiVM,
  linesChart,
  waiting,
  waitingFor,
  type ChartVM,
  type TableVM,
} from "../../data/vm";

const TILES: [string, string, string[]][] = [
  ["sessions", "Sessions", ["session_start"]],
  ["audio", "Séances audio", ["audio_session_started"]],
  ["plan", "Items du plan complétés", ["plan_item_completed"]],
  ["breathe", "Pauses respiration", ["breathe_pause_shown"]],
  ["miloSent", "Messages Milo", ["milo_message_sent"]],
  ["miloReply", "Réponses Milo", ["milo_reply_received"]],
  ["miloError", "Erreurs Milo", ["milo_error"]],
  ["face", "Face checks", ["face_check_completed"]],
  ["faceFail", "Face checks échoués", ["face_check_failed"]],
];
export const BREAKDOWNS = [
  {
    id: "miloSource",
    title: "Messages Milo par source",
    event: "milo_message_sent",
    prop: "source",
  },
  {
    id: "miloError",
    title: "Erreurs Milo par type",
    event: "milo_error",
    prop: "kind",
  },
  {
    id: "dictation",
    title: "Dictée Milo par langue",
    event: "milo_dictation_used",
    prop: "language",
  },
  {
    id: "audio",
    title: "Séances audio par contenu",
    event: "audio_session_started",
    prop: null,
  },
  {
    id: "plan",
    title: "Items du plan complétés par type",
    event: "plan_item_completed",
    prop: "kind",
  },
  {
    id: "rating",
    title: "Notes de séance",
    event: "session_rated",
    prop: "rating",
    sortNumeric: true,
  },
];

export type CohortRowVM = {
  key: string;
  label: string;
  size: string;
  cells: ({ text: string; strength: number } | null)[];
};

/** Engagement & rétention: usage events, retention of new users, Milo and content breakdowns, session ratings. */
export function useEngagementViewModel() {
  const { cell } = useWidgets({
    kpis: {
      w: "kpis",
      p: {
        items: TILES.map(([key, , events]) => ({
          key,
          t: "metric",
          events,
          m: "totals",
          users: true,
        })),
      },
    },
    retention: { w: "retention" },
    usage: {
      w: "lines",
      p: {
        m: "totals",
        items: TILES.slice(0, 8).map(([key, , events]) => ({ key, events })),
      },
    },
    spu: { w: "sessionsPerUser" },
    breakdowns: {
      w: "breakdowns",
      p: {
        items: BREAKDOWNS.map((b) => ({
          id: b.id,
          event: b.event,
          prop: b.prop,
          limit: 12,
        })),
      },
    },
    ratings: { w: "ratings" },
  });

  const kpis = mapCell(cell<KpisP>("kpis"), (p) =>
    TILES.map(([key, label], i) =>
      kpiVM(
        p.items.find((x) => x.key === key),
        label,
        i,
        {
          invert: /Erreurs|échoués/.test(label),
          foot: (o) =>
            `${fmtNum(o.users)} utilisateurs · ${o.users ? formatDecimal((o.value ?? 0) / o.users) : "—"} / utilis.`,
        },
      ),
    ),
  );

  const retention = mapCell(cell<RetentionP>("retention"), (p) => {
    const days = p.days.filter((d) => d.outof > 0).slice(0, 31);
    if (!days.length)
      return waiting({ title: "Pas encore de cohorte sur la période" });
    const at = (n: number) => {
      const d = p.days.find((x) => x.day === n);
      return `J${n} ${d && d.outof ? `${formatPct(d.count / d.outof)} (${d.count}/${d.outof})` : "n/a"}`;
    };
    const cohorts = p.cohorts.filter((c) => c.size > 0).slice(0, 21);
    const maxDay = 14;
    return data({
      chart: {
        x: days.map((d) => `J${d.day}`),
        series: [
          {
            key: "ret",
            label: "Retenus",
            color: color(0),
            values: days.map((d) =>
              d.outof ? (d.count / d.outof) * 100 : null,
            ),
          },
        ],
        kind: "area",
        formatValue: (v: number) => `${formatDecimal(v)} %`,
        formatX: (x: string) => x,
        formatXLong: (x: string) => `Jour ${x.slice(1)}`,
        tags: [
          `Cohorte ${fmtNum(p.cohortSize)} nouveaux`,
          at(1),
          at(7),
          at(30),
        ],
      } satisfies ChartVM,
      heads: Array.from({ length: maxDay + 1 }, (_, i) => `J${i}`),
      cohorts: cohorts.map((c): CohortRowVM => ({
        key: c.date,
        label: c.day ? formatDay(c.day) : c.date,
        size: fmtNum(c.size),
        cells: Array.from({ length: maxDay + 1 }, (_, i) => {
          const v = c.days[i];
          if (v == null) return null;
          const share = v / c.size;
          return {
            text: `${Math.round(share * 100)} %`,
            strength: Math.round(8 + share * 72),
          };
        }),
      })),
    });
  });

  const usage = mapCell(cell<LinesP>("usage"), (p) =>
    linesChart(p, Object.fromEntries(TILES.map(([k, l]) => [k, l]))),
  );

  const spu = mapCell(cell<SessionsPerUserP>("spu"), (p) =>
    p.missing
      ? waiting(waitingFor(["session_start"]))
      : data<ChartVM>({
          x: p.x,
          series: [
            {
              key: "spu",
              label: "Sessions / utilisateur",
              color: color(0),
              values: p.values,
            },
          ],
          formatValue: (v) => formatDecimal(v),
          ...dayAxis,
        }),
  );

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

  const ratings = mapCell(cell<RatingsP>("ratings"), (p) =>
    p.missing || !p.contents.length
      ? waiting(waitingFor(["session_rated"], "Pas encore de note de séance"))
      : data({
          types: p.types.map(
            (t) =>
              `${t.type} : ${formatDecimal(t.average)} / 5 (${fmtNum(t.count)} notes)`,
          ),
          table: {
            columns: [
              { key: "title", header: "Contenu" },
              { key: "type", header: "Type", muted: true },
              { key: "avg", header: "Moyenne", align: "right" },
              { key: "n", header: "Notes", align: "right" },
              {
                key: "dist",
                header: "0 · 1 · 2 · 3 · 4 · 5",
                align: "right",
                muted: true,
              },
            ],
            rows: p.contents.map((c) => ({
              title: c.title,
              type: c.type,
              avg: `${formatDecimal(c.average)} / 5`,
              n: fmtNum(c.count),
              dist: c.distribution.join(" · "),
            })),
          } satisfies TableVM,
        }),
  );

  return { kpis, retention, usage, spu, breakdowns, ratings };
}
