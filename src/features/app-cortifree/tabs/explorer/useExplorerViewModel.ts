import { useState } from "react";
import { change } from "@/lib/format";
import type {
  BreakdownsP,
  CatalogP,
  ExplorerEventP,
  ExplorerPropsP,
} from "../../data/payloads";
import { useUrlParam } from "../../data/url";
import { mapCell, useWidgets } from "../../data/useWidgets";
import {
  color,
  data,
  dayAxis,
  fmtNum,
  pct0,
  waiting,
  type ChartVM,
  type TableVM,
} from "../../data/vm";

/** Explorateur: every Amplitude event, its daily volume and a breakdown by any event or user property. */
export function useExplorerViewModel() {
  const [search, setSearch] = useState("");
  const [event, setEvent] = useUrlParam("event", "");
  const [propParam, setProp] = useUrlParam("prop", "");
  const [metric, setMetric] = useUrlParam("m", "totals");

  const pre = useWidgets({
    catalog: { w: "catalog", periodless: true },
    props: event
      ? { w: "explorerProps", p: { event }, periodless: true }
      : null,
  });
  const catalog = pre.cell<CatalogP>("catalog");
  const props = pre.cell<ExplorerPropsP>("props");
  const defaultProp =
    props.state === "ready"
      ? props.data.event.length
        ? `event:${props.data.event[0]}`
        : "user:country"
      : null;
  // A property chosen for another event is kept only when this event has it too.
  const propKnown =
    props.state === "ready" &&
    (propParam.startsWith("event:")
      ? props.data.event.includes(propParam.slice(6))
      : props.data.user.includes(propParam.slice(5)));
  const propValue = propParam && propKnown ? propParam : defaultProp;
  const [ptype, ...rest] = (propValue ?? "").split(":");
  const prop = rest.join(":");

  const { cell } = useWidgets({
    detail: event ? { w: "explorerEvent", p: { event } } : null,
    breakdown:
      event && propValue
        ? {
            w: "breakdowns",
            p: {
              items: [
                {
                  id: "b",
                  event,
                  prop,
                  ptype,
                  m: metric === "uniques" ? "uniques" : "totals",
                  limit: 25,
                  withSeries: true,
                },
              ],
            },
          }
        : null,
  });

  const list = mapCell(catalog, (c) => {
    const q = search.trim().toLowerCase();
    const items = c.events.filter((e) => e.name.toLowerCase().includes(q));
    const groups = new Map<string, typeof items>();
    for (const e of items) {
      const g = e.name.startsWith("[")
        ? "Amplitude"
        : e.name.includes("_")
          ? e.name.split("_")[0]
          : "autres";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(e);
    }
    return {
      count: c.events.length,
      groups: [...groups.entries()]
        .sort(
          (a, b) =>
            b[1].reduce((t, e) => t + e.weekTotal, 0) -
            a[1].reduce((t, e) => t + e.weekTotal, 0),
        )
        .map(([name, evs]) => ({
          name: `${name} · ${evs.length}`,
          items: evs.map((e) => ({
            name: e.name,
            count: fmtNum(e.weekTotal),
            active: e.name === event,
          })),
        })),
    };
  });

  const detail = mapCell(cell<ExplorerEventP>("detail"), (p) =>
    p.missing
      ? waiting({ title: `« ${event} » n'a pas encore été reçu par Amplitude` })
      : data({
          total: fmtNum(p.total),
          delta: change(p.total, p.prevTotal),
          tags: [
            `${fmtNum(p.users)} utilisateurs`,
            `${p.users ? fmtNum(Math.round((p.total / p.users) * 10) / 10) : "—"} / utilisateur`,
            `préc. ${fmtNum(p.prevTotal)}`,
          ],
          chart: {
            x: p.x,
            series: [
              { key: "t", label: "Total", color: color(0), values: p.totals },
              {
                key: "u",
                label: "Utilisateurs",
                color: color(1),
                values: p.uniques,
              },
            ],
            formatValue: fmtNum,
            ...dayAxis,
          } satisfies ChartVM,
        }),
  );

  const propOptions =
    props.state === "ready"
      ? [
          ...props.data.event.map((p) => ({
            value: `event:${p}`,
            label: p,
            group: "Propriétés d'événement",
          })),
          ...props.data.user.map((p) => ({
            value: `user:${p}`,
            label: p,
            group: "Propriétés utilisateur",
          })),
        ]
      : [];

  const breakdown = mapCell(cell<BreakdownsP>("breakdown"), (p) => {
    const b = p.items[0];
    if (!b || b.missing)
      return waiting({ title: b?.reason ?? "Pas encore de données" });
    const rows = b.rows.filter((r) => r.total > 0);
    if (!rows.length) return waiting({ title: "Aucune valeur sur la période" });
    const total = rows.reduce((t, r) => t + r.total, 0);
    return data({
      chart: {
        x: b.x,
        series: rows
          .slice(0, 6)
          .map((r, i) => ({
            key: r.value,
            label: r.value,
            color: color(i),
            values: r.series ?? [],
          })),
        formatValue: fmtNum,
        ...dayAxis,
      } satisfies ChartVM,
      table: {
        columns: [
          { key: "v", header: prop },
          {
            key: "n",
            header: metric === "uniques" ? "Utilisateurs" : "Total",
            align: "right",
          },
          { key: "s", header: "Part", align: "right" },
        ],
        rows: rows.map((r) => ({
          v: r.value,
          n: fmtNum(r.total),
          s: pct0(total ? r.total / total : null),
        })),
      } satisfies TableVM,
    });
  });

  return {
    search,
    setSearch,
    list,
    event: event || null,
    select: (name: string) => setEvent(name),
    detail,
    propOptions,
    propValue: propValue ?? "",
    setProp: (v: string) => setProp(v),
    metric,
    setMetric: (v: string) => setMetric(v),
    breakdown,
  };
}
