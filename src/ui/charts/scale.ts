// Small chart math shared by every chart.
/** `integer`: data is whole counts (users, downloads), so never put a tick at 2,5 or 0,5. */
export function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) max = min + 1;
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer && !Number.isInteger(step)) step = step < 1 ? 1 : step < 3 ? 2 : Math.ceil(step);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Pick at most ~n indexes on a regular step, anchored on the latest bucket (always labelled).
    A regular step keeps labels from colliding (e.g. "déc. 25" / "janv. 26" side by side). */
export function labelIndexes(length: number, n: number): number[] {
  if (length <= n) return Array.from({ length }, (_, i) => i);
  const step = Math.ceil(length / n);
  const out: number[] = [];
  for (let i = length - 1; i >= 0; i -= step) out.push(i);
  return out.reverse();
}
