import { useMemo, useState } from "react";
import { formatMonth } from "@/lib/format";
import { Legend } from "@/ui";
import { useWidth } from "@/ui/charts/useWidth";
import type { TimelineLane } from "../useVersionsViewModel";

const LANE_H = 44;
const PAD = { top: 8, right: 16, bottom: 26, left: 92 };
const LABEL_GAP = 34;

/** Swimlane per app: filled dot = public release, ring = version currently at Apple. */
export function ReleaseTimeline({ from, to, lanes }: { from: number; to: number; lanes: TimelineLane[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ lane: number; event: number } | null>(null);
  const compact = width > 0 && width < 520;
  const left = compact ? 12 : PAD.left;
  const innerW = Math.max(0, width - left - PAD.right);
  const laneH = compact ? LANE_H + 14 : LANE_H;
  const height = PAD.top + lanes.length * laneH + PAD.bottom;
  const span = Math.max(1, to - from);
  const xOf = (t: number) => left + ((t - from) / span) * innerW;

  const ticks = useMemo(() => {
    const out: { at: number; label: string }[] = [];
    const d = new Date(from);
    let cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    while (cursor <= to) {
      const iso = new Date(cursor).toISOString().slice(0, 7);
      out.push({ at: cursor, label: formatMonth(iso) });
      const c = new Date(cursor);
      cursor = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    }
    const every = Math.max(1, Math.ceil(out.length / Math.max(2, Math.floor(innerW / 64))));
    return out.filter((_, i) => i % every === 0);
  }, [from, to, innerW]);

  // Version labels: newest first, keep a label only when it does not collide with the one to its right.
  const labelled = useMemo(
    () =>
      lanes.map((lane) => {
        let lastX = Infinity;
        const keep = lane.events.map(() => false);
        for (let i = lane.events.length - 1; i >= 0; i--) {
          const x = xOf(lane.events[i].at);
          if (lastX - x >= LABEL_GAP) {
            keep[i] = true;
            lastX = x;
          }
        }
        return keep;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lanes, innerW, from, to, left],
  );

  const active = hover ? lanes[hover.lane]?.events[hover.event] : null;
  const activeX = active ? xOf(active.at) : 0;

  return (
    <div className="chart vs-timeline" ref={ref} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Frise des sorties par app">
          {ticks.map((t) => (
            <g key={t.at}>
              <line x1={xOf(t.at)} x2={xOf(t.at)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--chart-grid)" />
              <text x={xOf(t.at)} y={height - 8} textAnchor="middle">
                {t.label}
              </text>
            </g>
          ))}
          <line x1={xOf(to)} x2={xOf(to)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--chart-axis)" strokeDasharray="2 3" />
          {lanes.map((lane, li) => {
            const yTop = PAD.top + li * laneH;
            const cy = yTop + laneH - (compact ? 14 : 16);
            return (
              <g key={lane.slug}>
                {!compact && (
                  <text x={0} y={cy + 4} className="vs-timeline__lane">
                    {lane.name}
                  </text>
                )}
                {compact && (
                  <text x={left} y={yTop + 12} className="vs-timeline__lane">
                    {lane.name}
                  </text>
                )}
                <line x1={left} x2={left + innerW} y1={cy} y2={cy} stroke="var(--border-strong)" />
                {lane.events.map((e, ei) => {
                  const x = xOf(e.at);
                  const isHover = hover?.lane === li && hover.event === ei;
                  return (
                    <g key={e.key} onPointerEnter={() => setHover({ lane: li, event: ei })} style={{ cursor: "default" }}>
                      {e.hollow && <line x1={x} x2={xOf(to)} y1={cy} y2={cy} stroke={lane.color} strokeDasharray="3 3" strokeWidth={1.5} />}
                      <circle cx={x} cy={cy} r={12} fill="transparent" />
                      <circle
                        cx={x}
                        cy={cy}
                        r={isHover ? 6 : 4.5}
                        fill={e.hollow ? "var(--surface)" : lane.color}
                        stroke={e.hollow ? lane.color : "var(--surface)"}
                        strokeWidth={e.hollow ? 2 : 1.5}
                      />
                      {labelled[li]?.[ei] && (
                        <text x={x} y={cy - 10} textAnchor="middle" className="vs-timeline__version">
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
      {active && (
        <div className="chart__tooltip" style={{ left: Math.min(Math.max(activeX - 110, 0), Math.max(0, width - 230)), top: PAD.top + (hover!.lane + 1) * laneH }}>
          <div className="chart__tooltip-title">
            {lanes[hover!.lane].name} {active.label}
          </div>
          <div className="secondary">{active.detail}</div>
        </div>
      )}
      <Legend items={lanes.map((l) => ({ label: l.name, color: l.color }))} />
    </div>
  );
}
