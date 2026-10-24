import { formatPct } from "@/lib/format";
import type {
  BreakdownsP,
  CatalogP,
  KpisP,
  LinesP,
  NtByTypeP,
  NtPermissionP,
} from "../../data/payloads";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  breakdownBars,
  color,
  data,
  fmtNum,
  kpiVM,
  linesChart,
  waiting,
  waitingFor,
  type BarsVM,
  type TableVM,
} from "../../data/vm";

const SCHEDULED = ["notification_scheduled"];
const DELIVERED = ["notification_delivered", "notification_received"];
const OPENED = ["notification_opened", "notification_clicked"];
const LEGACY = [
  "daily_notifications_scheduled",
  "reengagement_notifications_scheduled",
];

/** Notifications: scheduled → delivered → opened, permission status, breakdowns by type, hour, action. */
export function useNotificationsViewModel() {
  const pre = useWidgets({ catalog: { w: "catalog", periodless: true } });
  const catalog = pre.cell<CatalogP>("catalog");
  const legacy =
    catalog.state === "ready"
      ? (LEGACY.find((e) => catalog.data.events.some((x) => x.name === e)) ??
        LEGACY[0])
      : null;
  const breakdownDefs = [
    {
      id: "state",
      title: "Délivrées par état de l'app",
      event: "notification_delivered",
      prop: "app_state",
    },
    {
      id: "hour",
      title: "Délivrées par heure",
      event: "notification_delivered",
      prop: "delivered_hour",
      sortNumeric: true,
      limit: 24,
    },
    {
      id: "action",
      title: "Ouvertes par action",
      event: "notification_opened",
      prop: "action",
    },
    {
      id: "fire",
      title: "Programmées par heure de déclenchement",
      event: "notification_scheduled",
      prop: "fire_hour",
      sortNumeric: true,
      limit: 24,
    },
    {
      id: "to",
      title: "Changements de permission (vers)",
      event: "notification_permission_changed",
      prop: "to",
    },
    {
      id: "legacy",
      title: "Programmations (anciens événements)",
      event: legacy ?? LEGACY[0],
      prop: null as string | null,
    },
  ];

  const { cell } = useWidgets({
    kpis: {
      w: "kpis",
      p: {
        items: [
          { key: "scheduled", t: "metric", events: SCHEDULED, m: "totals" },
          { key: "delivered", t: "metric", events: DELIVERED, m: "totals" },
          { key: "opened", t: "metric", events: OPENED, m: "totals" },
          { key: "rate", t: "ratio", num: OPENED, den: DELIVERED },
          {
            key: "perm",
            t: "metric",
            events: ["notification_permission_changed"],
            m: "totals",
          },
        ],
      },
    },
    trend: {
      w: "lines",
      p: {
        m: "totals",
        items: [
          { key: "scheduled", events: SCHEDULED },
          { key: "delivered", events: DELIVERED },
          { key: "opened", events: OPENED },
        ],
      },
    },
    permission: { w: "ntPermission" },
    byType: { w: "ntByType" },
    breakdowns: legacy
      ? {
          w: "breakdowns",
          p: {
            items: breakdownDefs.map((b) => ({
              id: b.id,
              event: b.event,
              prop: b.prop,
              limit: b.limit ?? 12,
            })),
          },
        }
      : null,
  });

  const kpis = mapCell(cell<KpisP>("kpis"), (p) => {
    const by = (k: string) => p.items.find((x) => x.key === k);
    return [
      kpiVM(by("scheduled"), "Programmées", 0),
      kpiVM(by("delivered"), "Délivrées", 2),
      kpiVM(by("opened"), "Ouvertes", 1),
      kpiVM(by("rate"), "Taux d'ouverture", 6, {
        format: (v) => formatPct(v),
        foot: () => "ouvertes / délivrées",
      }),
      kpiVM(by("perm"), "Changements de permission", 4),
    ];
  });

  const trend = mapCell(cell<LinesP>("trend"), (p) =>
    linesChart(
      p,
      { scheduled: "Programmées", delivered: "Délivrées", opened: "Ouvertes" },
      {
        colors: { scheduled: color(0), delivered: color(2), opened: color(1) },
      },
    ),
  );

  const permission = mapCell(cell<NtPermissionP>("permission"), (p) => {
    if (!p.rows.length)
      return waiting({ title: p.reason ?? "Pas encore de données" });
    const total = p.rows.reduce((t, r) => t + r.total, 0);
    return data<BarsVM>({
      items: p.rows.map((r) => ({
        key: r.value,
        label: r.value,
        value: r.total,
        color: color(0),
      })),
      formatValue: (v) =>
        `${fmtNum(v)} · ${formatPct(total ? v / total : null)}`,
      subtitle:
        p.source === "user"
          ? "Utilisateurs actifs par propriété notification_permission"
          : `En attendant notification_permission : ${p.alt?.event} par ${p.alt?.prop} (utilisateurs uniques)`,
    });
  });

  const byType = mapCell(cell<NtByTypeP>("byType"), (p) =>
    p.rows.length
      ? data<TableVM>({
          columns: [
            { key: "t", header: "Type" },
            { key: "s", header: "Programmées", align: "right" },
            { key: "d", header: "Délivrées", align: "right" },
            { key: "o", header: "Ouvertes", align: "right" },
            { key: "r", header: "Taux d'ouverture", align: "right" },
          ],
          rows: p.rows.map((r) => ({
            t: r.type,
            s: fmtNum(r.scheduled),
            d: fmtNum(r.delivered),
            o: fmtNum(r.opened),
            r: r.delivered ? formatPct(r.opened / r.delivered) : "—",
          })),
        })
      : waiting(
          waitingFor(
            [...SCHEDULED, DELIVERED[0], OPENED[0]],
            "Pas encore de notification avec notification_type",
          ),
        ),
  );

  const breakdowns = mapCell(cell<BreakdownsP>("breakdowns"), (p) =>
    data(
      breakdownDefs.map((b, i) => ({
        id: b.id,
        title: b.title,
        bars: breakdownBars(
          p.items.find((x) => x.id === b.id),
          { sortNumeric: b.sortNumeric, colorIndex: i },
        ),
      })),
    ),
  );

  return { kpis, trend, permission, byType, breakdowns };
}
