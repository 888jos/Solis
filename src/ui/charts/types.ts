export type Series = {
  key: string;
  label: string;
  /** CSS color, e.g. appColor(slug) or "var(--series-4)". */
  color: string;
  /** One value per x bucket; null = no data (gap). */
  values: (number | null)[];
};

export type ChartData = {
  /** Bucket keys (e.g. days "2026-10-01", months "2026-10"). */
  x: string[];
  series: Series[];
};
