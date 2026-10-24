import type { ReactNode } from "react";

export function ChartTooltip({ left, top, title, rows, width }: { left: number; top: number; title: ReactNode; rows: { color: string; label: string; value: string }[]; width: number }) {
  // Keep the tooltip inside the chart box.
  const flip = left > width - 180;
  return (
    <div className="chart__tooltip" style={{ left: flip ? undefined : left + 14, right: flip ? width - left + 14 : undefined, top }}>
      <div className="chart__tooltip-title">{title}</div>
      {rows.map((row) => (
        <div className="chart__tooltip-row" key={row.label}>
          <span className="legend__swatch" style={{ background: row.color }} />
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
