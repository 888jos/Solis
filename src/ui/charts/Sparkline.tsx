import { useWidth } from "./useWidth";

/** Tiny trend line for KPI tiles. No axes, no interaction (the parent tile carries the number). */
export function Sparkline({ values, color = "var(--series-1)", height = 28 }: { values: (number | null)[]; color?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <div ref={ref} style={{ height }} />;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) return void (pen = false);
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <div ref={ref} style={{ height }} aria-hidden>
      {width > 0 && (
        <svg width={width} height={height}>
          <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
