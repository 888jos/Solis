import { formatInt, formatPct } from "@/lib/format";
import type { FunnelStep } from "../components/Funnel";

/** Users per ordered step → funnel rows: width vs the largest step, share of the first, conversion from previous. */
export function buildFunnel(items: { key: string; label: string; users: number; sublabel?: string }[]): FunnelStep[] {
  const first = items[0]?.users ?? 0;
  const max = Math.max(1, ...items.map((i) => i.users));
  const n = items.length;
  return items.map((item, i) => {
    const prev = i > 0 ? items[i - 1].users : null;
    const lost = prev != null ? prev - item.users : 0;
    return {
      key: item.key,
      label: item.label,
      sublabel: item.sublabel,
      value: formatInt(item.users),
      widthPct: (item.users / max) * 100,
      shade: Math.round(100 - (n > 1 ? (i / (n - 1)) * 60 : 0)),
      share: first > 0 ? formatPct(item.users / first, 0) : "—",
      conversion: prev == null ? null : prev > 0 ? `${formatPct(item.users / prev)} passent` : "—",
      lost: prev != null && lost > 0 ? `−${formatInt(lost)}` : null,
    };
  });
}

/** a / b as a share, null when b = 0. */
export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
