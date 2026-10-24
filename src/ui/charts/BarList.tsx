import type { ReactNode } from "react";

export type BarListItem = { key: string; label: ReactNode; value: number; color?: string; hint?: string };

/** Ranked horizontal bars (countries, vendors, creators...). Value text stays in ink, the bar carries identity. */
export function BarList({ items, formatValue, max, limit }: { items: BarListItem[]; formatValue: (v: number) => string; max?: number; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  const top = max ?? Math.max(0, ...shown.map((i) => i.value));
  return (
    <div>
      {shown.map((item) => (
        <div className="hbar" key={item.key} title={item.hint}>
          <span className="hbar__label">{item.label}</span>
          <span className="hbar__track">
            <span className="hbar__fill" style={{ display: "block", width: `${top > 0 ? Math.max(1.5, (item.value / top) * 100) : 0}%`, background: item.color ?? "var(--series-1)" }} />
          </span>
          <span className="hbar__value">{formatValue(item.value)}</span>
        </div>
      ))}
    </div>
  );
}
