import { useState } from "react";
import { formatDay, formatPct } from "@/lib/format";
import type {
  BreakdownsP,
  CatalogP,
  KpisP,
  LinesP,
  TopEventsP,
  UsersP,
} from "../../data/payloads";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  breakdownBars,
  color,
  data,
  dayAxis,
  fmtMoney,
  fmtNum,
  kpiVM,
  linesChart,
  waiting,
  type BarsVM,
  type ChartVM,
} from "../../data/vm";

const PAYWALL = ["paywall_open", "onboarding_paywall_viewed"];
const TRIAL = ["trial_started", "rc_trial_started_event"];
const PURCHASE = [
  "transaction_complete",
  "subscription_started",
  "subscription_purchased",
  "rc_initial_purchase_event",
  "non_recurring_purchase",
];

export const miloEvents = (cat: CatalogP) =>
  cat.events.some((e) => e.name === "milo_message_sent")
    ? ["milo_message_sent"]
    : cat.events.map((e) => e.name).filter((n) => n.startsWith("milo_"));

/** Vue d'ensemble: acquisition, activity and money headline numbers, then the charts and top lists. */
export function useOverviewViewModel() {
  const [topMode, setTopMode] = useState<"week" | "period">("week");
  const catalogSpec = { w: "catalog", periodless: true };
  const pre = useWidgets({ catalog: catalogSpec });
  const catalog = pre.cell<CatalogP>("catalog");
  const milo = catalog.state === "ready" ? miloEvents(catalog.data) : null;

  const { cell } = useWidgets({
    activity: {
      w: "kpis",
      p: {
        items: [
          { key: "new", t: "newUsers" },
          {
            key: "installs",
            t: "metric",
            events: ["[Amplitude] Application Installed"],
            m: "totals",
          },
          { key: "active", t: "activeUsers" },
          { key: "dau", t: "dauAvg" },
          { key: "waumau", t: "wauMau" },
          { key: "onboarding", t: "onboardingRate" },
        ],
      },
    },
    money: {
      w: "kpis",
      p: {
        items: [
          {
            key: "paywalls",
            t: "metric",
            events: PAYWALL,
            m: "totals",
            mode: "first",
          },
          { key: "trials", t: "metric", events: TRIAL, m: "totals" },
          {
            key: "purchases",
            t: "metric",
            events: PURCHASE,
            m: "totals",
            mode: "first",
          },
          { key: "mrr", t: "mrr" },
          { key: "revenue", t: "revenue28" },
          { key: "milo", t: "milo" },
        ],
      },
    },
    users: { w: "users" },
    keyActivity: milo
      ? {
          w: "lines",
          p: {
            m: "totals",
            items: [
              { key: "sessions", events: ["session_start"] },
              { key: "audio", events: ["audio_session_started"] },
              { key: "plan", events: ["plan_item_completed"] },
              { key: "paywall", events: PAYWALL },
              { key: "milo", events: milo },
            ],
          },
        }
      : null,
    topPeriod: topMode === "period" ? { w: "topEventsPeriod" } : null,
    geo: {
      w: "breakdowns",
      p: {
        items: [
          {
            id: "country",
            event: "_active",
            prop: "country",
            ptype: "user",
            m: "uniques",
            limit: 8,
          },
          {
            id: "version",
            event: "_active",
            prop: "version",
            ptype: "user",
            m: "uniques",
            limit: 8,
          },
        ],
      },
    },
  });

  const activity = mapCell(cell<KpisP>("activity"), (p) => {
    const by = (k: string) => p.items.find((i) => i.key === k);
    return [
      kpiVM(by("new"), "Nouveaux utilisateurs", 0, {
        hint: "Premier événement Amplitude",
      }),
      kpiVM(by("installs"), "Installations", 2),
      kpiVM(by("active"), "Utilisateurs actifs", 0, {
        hint: "Uniques sur la période",
      }),
      kpiVM(by("dau"), "DAU moyen", 6, {
        hint: "Moyenne des actifs quotidiens",
      }),
      kpiVM(by("waumau"), "WAU · MAU", 6, {
        format: (v) => `${fmtNum(v)} · ${fmtNum(by("waumau")?.extra?.mau)}`,
        foot: (o) =>
          `Au ${formatDay(String(o.extra?.endDay))} · DAU/MAU ${formatPct(o.extra?.stickiness ?? null)}`,
        hint: "Actifs uniques sur les 7 et 30 derniers jours de la période",
      }),
      kpiVM(by("onboarding"), "Onboarding complété", 2, {
        format: (v) => formatPct(v, 0),
        foot: (o) => `${o.extra?.first} → ${o.extra?.last}`,
        hint: by("onboarding")?.extra?.flow
          ? `Flow : ${by("onboarding")?.extra?.flow}`
          : undefined,
      }),
    ];
  });

  const money = mapCell(cell<KpisP>("money"), (p) => {
    const by = (k: string) => p.items.find((i) => i.key === k);
    const cur = (k: string) => String(by(k)?.extra?.currency ?? "USD");
    return [
      kpiVM(by("paywalls"), "Paywalls affichés", 3),
      kpiVM(by("trials"), "Essais démarrés", 4),
      kpiVM(by("purchases"), "Achats", 2),
      kpiVM(by("mrr"), "MRR", 2, {
        format: (v) => fmtMoney(v, cur("mrr")),
        foot: () => "RevenueCat · vs début de période",
      }),
      kpiVM(by("revenue"), "Revenu (28 j)", 2, {
        format: (v) => fmtMoney(v, cur("revenue")),
        foot: (o) =>
          o.extra?.source === "revenuecat"
            ? "RevenueCat · 28 derniers jours"
            : `Amplitude ${o.extra?.source} · période`,
      }),
      kpiVM(by("milo"), "Usage Milo", 6, {
        foot: (o) => `${fmtNum(o.users)} utilisateurs`,
        hint: by("milo")?.events?.join(", "),
      }),
    ];
  });

  const usersChart = mapCell(cell<UsersP>("users"), (p) =>
    data<ChartVM>({
      x: p.x,
      series: [
        { key: "active", label: "Actifs", color: color(0), values: p.active },
        { key: "new", label: "Nouveaux", color: color(1), values: p.fresh },
      ],
      formatValue: fmtNum,
      ...dayAxis,
    }),
  );

  const keyActivity = mapCell(cell<LinesP>("keyActivity"), (p) =>
    linesChart(p, {
      sessions: "Sessions",
      audio: "Audio",
      plan: "Plan complété",
      paywall: "Paywall",
      milo: "Milo",
    }),
  );

  const top =
    topMode === "week"
      ? mapCell(catalog, (c) => {
          const rows = c.events.filter((e) => e.weekTotal > 0).slice(0, 15);
          return rows.length
            ? data<{ bars: BarsVM; note: string }>({
                bars: {
                  items: rows.map((e) => ({
                    key: e.name,
                    label: e.name,
                    value: e.weekTotal,
                    color: color(0),
                  })),
                  formatValue: fmtNum,
                },
                note: "Semaine en cours (Amplitude events/list)",
              })
            : waiting({ title: "Aucun événement" });
        })
      : mapCell(cell<TopEventsP>("topPeriod"), (p) =>
          p.rows.length
            ? data({
                bars: {
                  items: p.rows.map((r) => ({
                    key: r.name,
                    label: r.name,
                    value: r.total,
                    color: color(0),
                  })),
                  formatValue: fmtNum,
                },
                note: "Période choisie · parmi les 30 événements les plus actifs cette semaine",
              })
            : waiting({ title: "Aucun événement sur la période" }),
        );

  const geo = mapCell(cell<BreakdownsP>("geo"), (p) =>
    data({
      country: breakdownBars(p.items.find((i) => i.id === "country")),
      version: breakdownBars(
        p.items.find((i) => i.id === "version"),
        { colorIndex: 6 },
      ),
    }),
  );

  const sourceLine = mapCell(catalog, (c) => ({
    host: c.amplitudeHost,
    events: c.events.length,
    revenuecat: c.revenuecatConfigured,
  }));

  return {
    activity,
    money,
    usersChart,
    keyActivity,
    top,
    topMode,
    setTopMode,
    geo,
    sourceLine,
  };
}
