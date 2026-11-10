import { useId } from "react";
import { useWidth } from "./useWidth";

/** Trend line for KPI tiles: a glowing line over a soft gradient, ending on a bright dot.
 *  No axes, no interaction (the parent tile carries the number). */
export function Sparkline({ values, color = "var(--series-1)", height = 28, glow = true }: { values: (number | null)[]; color?: string; height?: number; glow?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const id = useId().replace(/:/g, "");
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <div ref={ref} style={{ height }} />;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const pad = glow ? 5 : 2;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - lo) / (hi - lo || 1)) * (height - pad * 2);
  let d = "";
  let pen = false;
  let first: number | null = null;
  let last: [number, number] | null = null;
  values.forEach((v, i) => {
    if (v == null) return void (pen = false);
    if (first == null) first = x(i);
    last = [x(i), y(v)];
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const end = last as [number, number] | null;
  return (
    <div ref={ref} className="sparkline" style={{ height }} aria-hidden>
      {width > 0 && end && (
        <svg width={width} height={height} style={{ overflow: "visible" }}>
          {glow && (
            <defs>
              <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.26} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={color} stopOpacity={0.2} />
                <stop offset="0.55" stopColor={color} stopOpacity={0.85} />
                <stop offset="1" stopColor={color} />
              </linearGradient>
              <filter id={`${id}g`} x="-10%" y="-60%" width="120%" height="220%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
          )}
          {glow && <path d={`${d}L${end[0].toFixed(1)},${height}L${(first ?? 0).toFixed(1)},${height}Z`} fill={`url(#${id}a)`} />}
          {glow && <path d={d} fill="none" stroke={color} strokeWidth={4} opacity={0.45} filter={`url(#${id}g)`} />}
          <path d={d} fill="none" stroke={glow ? `url(#${id}l)` : color} strokeWidth={glow ? 2 : 1.75} strokeLinejoin="round" strokeLinecap="round" />
          {glow && (
            <>
              <circle cx={end[0]} cy={end[1]} r={7} fill={color} opacity={0.35} filter={`url(#${id}g)`} />
              <circle cx={end[0]} cy={end[1]} r={3.6} fill="#fff" stroke={color} strokeWidth={1.6} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
