import { useMemo, useState, type ReactNode } from "react";
import { ChartTooltip } from "./Tooltip";
import { Legend } from "./Legend";
import { labelIndexes, niceTicks } from "./scale";
import type { ChartData, Series } from "./types";
import { useWidth } from "./useWidth";

type Props = ChartData & {
  /** "line" (default), "area" (single-series emphasis), "bar" (stacked when several series), "bar-grouped". */
  kind?: "line" | "area" | "bar" | "bar-grouped";
  height?: number;
  formatValue: (value: number) => string;
  /** Short tick label, e.g. formatDay. */
  formatX: (x: string) => string;
  /** Long label for the tooltip title (defaults to formatX). */
  formatXLong?: (x: string) => string;
  /** Show a total row in the tooltip for stacked bars / multi-series. */
  showTotal?: boolean;
  legend?: boolean;
  emptyLabel?: ReactNode;
  /** Draw small values at the top (ranks: 1 is best). Line charts only. */
  invertY?: boolean;
  /** Optional dashed line drawn over the chart (e.g. the previous period), with its own tooltip label. */
  overlay?: Series & { tooltipLabel?: (i: number) => string };
};

const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

/** One chart for every time series in Solis: line, area, stacked or grouped bars, with a crosshair tooltip. */
export function TimeChart({ x, series, kind = "line", height = 240, formatValue, formatX, formatXLong, showTotal, legend = true, emptyLabel, invertY = false, overlay }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const isBar = kind === "bar" || kind === "bar-grouped";
  const stacked = kind === "bar" && series.length > 1;

  const { ticks, yMin, yMax } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    x.forEach((_, i) => {
      if (stacked) {
        let pos = 0;
        let neg = 0;
        series.forEach((s) => {
          const v = s.values[i] ?? 0;
          if (v >= 0) pos += v;
          else neg += v;
        });
        hi = Math.max(hi, pos);
        lo = Math.min(lo, neg);
      } else {
        series.forEach((s) => {
          const v = s.values[i];
          if (v == null) return;
          hi = Math.max(hi, v);
          lo = Math.min(lo, v);
        });
      }
    });
    overlay?.values.forEach((v) => {
      if (v == null) return;
      hi = Math.max(hi, v);
      lo = Math.min(lo, v);
    });
    const integer = series.every((s) => s.values.every((v) => v == null || Number.isInteger(v)));
    const t = niceTicks(lo, hi === lo ? lo + 1 : hi, 4, integer);
    return { ticks: t, yMin: t[0], yMax: t[t.length - 1] };
  }, [x, series, stacked, overlay]);

  // Axis labels: when every tick is a whole number, drop the ",00" decimals ("50,00 €" → "50 €").
  const tickLabels = useMemo(() => {
    const raw = ticks.map((t) => formatValue(t));
    return ticks.every((t) => Number.isInteger(t)) ? raw.map((s) => s.replace(/,00(?=\D|$)/, "")) : raw;
  }, [ticks, formatValue]);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = x.length;
  const band = n > 0 ? innerW / n : 0;
  const xCenter = (i: number) => PAD.left + (isBar ? band * i + band / 2 : n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v: number) => {
    const t = (v - yMin) / (yMax - yMin || 1);
    return PAD.top + (invertY ? t : 1 - t) * innerH;
  };
  const labels = labelIndexes(n, Math.max(2, Math.min(8, Math.floor(innerW / 70))));

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    const i = isBar ? Math.floor(px / band) : Math.round((px / (innerW || 1)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const linePath = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xCenter(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const barW = Math.max(1, Math.min(28, band * (kind === "bar-grouped" ? 0.8 : 0.62)));
  const groupW = kind === "bar-grouped" ? barW / Math.max(1, series.length) : barW;

  const tooltipRows =
    hover == null
      ? []
      : series
          .filter((s) => s.values[hover] != null)
          .map((s) => ({ color: s.color, label: s.label, value: formatValue(s.values[hover] as number) }));
  if (hover != null && showTotal && series.length > 1) {
    const total = series.reduce((sum, s) => sum + (s.values[hover] ?? 0), 0);
    tooltipRows.push({ color: "transparent", label: "Total", value: formatValue(total) });
  }
  if (hover != null && overlay && overlay.values[hover] != null) {
    tooltipRows.push({ color: overlay.color, label: overlay.tooltipLabel ? overlay.tooltipLabel(hover) : overlay.label, value: formatValue(overlay.values[hover] as number) });
  }

  if (!series.some((s) => s.values.some((v) => v != null))) {
    return (
      <div className="chart chart--empty" style={{ height }}>
        {emptyLabel ?? "Aucune donnée sur la période"}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {legend && <Legend items={[...series.map((s) => ({ label: s.label, color: s.color })), ...(overlay ? [{ label: overlay.label, color: overlay.color }] : [])]} />}
      <div className="chart" ref={ref} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")}>
            {ticks.map((t, ti) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {tickLabels[ti]}
                </text>
              </g>
            ))}
            {labels.map((i) => {
              // Edge labels hug the plot edges so they never spill outside the card (narrow bars included).
              const edge = !isBar || band < 48;
              const anchor = edge && i === 0 && n > 1 ? "start" : edge && i === n - 1 && n > 1 ? "end" : "middle";
              const lx = anchor === "start" ? (isBar ? xCenter(i) - barW / 2 : xCenter(i)) : anchor === "end" ? (isBar ? xCenter(i) + barW / 2 : xCenter(i)) : xCenter(i);
              return (
                <text key={x[i]} x={lx} y={height - 6} textAnchor={anchor}>
                  {formatX(x[i])}
                </text>
              );
            })}

            {hover != null && <line x1={xCenter(hover)} x2={xCenter(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--chart-axis)" strokeDasharray={isBar ? undefined : "3 3"} />}

            {isBar &&
              x.map((key, i) => {
                let pos = 0;
                let neg = 0;
                return (
                  <g key={key} opacity={hover == null || hover === i ? 1 : 0.55}>
                    {series.map((s, si) => {
                      const v = s.values[i];
                      if (v == null || v === 0) return null;
                      if (stacked) {
                        const base = v >= 0 ? pos : neg;
                        const top = base + v;
                        if (v >= 0) pos = top;
                        else neg = top;
                        const y0 = y(Math.max(base, top));
                        const h = Math.max(1, Math.abs(y(base) - y(top)) - (series.length > 1 ? 1 : 0));
                        return <rect key={s.key} x={xCenter(i) - barW / 2} y={y0} width={barW} height={h} rx={Math.min(3, barW / 3)} fill={s.color} />;
                      }
                      const left = xCenter(i) - barW / 2 + si * groupW;
                      const y0 = y(Math.max(0, v));
                      const h = Math.max(1, Math.abs(y(0) - y(v)));
                      return <rect key={s.key} x={left + 0.5} y={y0} width={Math.max(1, groupW - 1)} height={h} rx={Math.min(3, groupW / 3)} fill={s.color} />;
                    })}
                  </g>
                );
              })}

            {!isBar &&
              series.map((s) => {
                const d = linePath(s.values);
                if (!d) return null;
                const area =
                  kind === "area" && series.length === 1
                    ? `${d}L${xCenter(s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null)).toFixed(1)},${y(Math.max(0, yMin))}L${xCenter(s.values.findIndex((v) => v != null)).toFixed(1)},${y(Math.max(0, yMin))}Z`
                    : null;
                return (
                  <g key={s.key}>
                    {area && <path d={area} fill={s.color} opacity={0.1} />}
                    <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {hover != null && s.values[hover] != null && (
                      <circle cx={xCenter(hover)} cy={y(s.values[hover] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                    )}
                  </g>
                );
              })}

            {overlay && (
              <path d={linePath(overlay.values)} fill="none" stroke={overlay.color} strokeWidth={1.5} strokeDasharray="4 4" strokeLinejoin="round" opacity={0.85} />
            )}

            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
        )}
        {hover != null && tooltipRows.length > 0 && (
          <ChartTooltip left={xCenter(hover)} top={PAD.top} width={width} title={(formatXLong ?? formatX)(x[hover])} rows={tooltipRows} />
        )}
      </div>
    </div>
  );
}
