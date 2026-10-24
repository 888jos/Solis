import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { APPS, type AppSlug } from "./apps";

// Global filters live in the URL (?p=30d&app=cortifree) so every view is linkable and the
// back button works. Every ViewModel reads them through usePeriod() / useAppFilter().
export type PeriodKey = "7d" | "30d" | "90d" | "mtd" | "12m" | "all";

export const PERIODS: { key: PeriodKey; label: string; short: string }[] = [
  { key: "7d", label: "7 derniers jours", short: "7 j" },
  { key: "30d", label: "30 derniers jours", short: "30 j" },
  { key: "90d", label: "90 derniers jours", short: "90 j" },
  { key: "mtd", label: "Mois en cours", short: "Mois" },
  { key: "12m", label: "12 derniers mois", short: "12 mois" },
  { key: "all", label: "Depuis le début", short: "Tout" },
];

/** First day Solis considers (CortiFree launch period). */
export const STUDIO_START = "2026-01-01";

export type Period = {
  key: PeriodKey;
  label: string;
  from: string; // inclusive YYYY-MM-DD
  to: string; // inclusive YYYY-MM-DD (yesterday: Apple reports lag a day)
  prevFrom: string; // same-length previous window
  prevTo: string;
  days: number;
  /** Suggested bucket for time series. */
  bucket: "day" | "week" | "month";
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shift(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

export function computePeriod(key: PeriodKey, today = iso(new Date())): Period {
  const to = shift(today, -1);
  let from: string;
  switch (key) {
    case "7d":
      from = shift(to, -6);
      break;
    case "30d":
      from = shift(to, -29);
      break;
    case "90d":
      from = shift(to, -89);
      break;
    case "mtd":
      from = `${today.slice(0, 7)}-01`;
      if (from > to) from = to;
      break;
    case "12m":
      from = shift(to, -364);
      break;
    case "all":
      from = STUDIO_START;
      break;
  }
  const days = diffDays(from, to);
  const prevTo = shift(from, -1);
  const prevFrom = shift(prevTo, -(days - 1));
  const bucket = days <= 45 ? "day" : days <= 200 ? "week" : "month";
  return { key, label: PERIODS.find((p) => p.key === key)!.label, from, to, prevFrom, prevTo, days, bucket };
}

type Filters = {
  period: Period;
  setPeriod: (key: PeriodKey) => void;
  /** null = all apps */
  app: AppSlug | null;
  setApp: (app: AppSlug | null) => void;
};

const FiltersContext = createContext<Filters | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const periodKey = (PERIODS.some((p) => p.key === params.get("p")) ? params.get("p") : "30d") as PeriodKey;
  const appParam = params.get("app");
  const app = APPS.some((a) => a.slug === appParam) ? (appParam as AppSlug) : null;

  const value = useMemo<Filters>(
    () => ({
      period: computePeriod(periodKey),
      app,
      setPeriod: (key) =>
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          if (key === "30d") next.delete("p");
          else next.set("p", key);
          return next;
        }),
      setApp: (slug) =>
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          if (slug) next.set("app", slug);
          else next.delete("app");
          return next;
        }),
    }),
    [periodKey, app, setParams],
  );
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): Filters {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters outside FiltersProvider");
  return ctx;
}

export const usePeriod = () => useFilters().period;
export const useAppFilter = () => useFilters().app;
