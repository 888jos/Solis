import { useCallback, useMemo, useState } from "react";
import { usePeriod } from "@/lib/filters";
import { useUrlParam } from "./data/url";

export const TABS = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "onboarding", label: "Onboarding" },
  { id: "icp", label: "Profil ICP" },
  { id: "monetization", label: "Monétisation" },
  { id: "engagement", label: "Engagement & rétention" },
  { id: "checkin", label: "Daily check-in" },
  { id: "notifications", label: "Notifications" },
  { id: "exercises", label: "Exercices & revenus" },
  { id: "explorer", label: "Explorateur" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

/** Page shell: current tab (?tab=), period subtitle, and the "Actualiser" button shared by every tab. */
export function usePageViewModel() {
  const period = usePeriod();
  const [raw, setRaw] = useUrlParam("tab", "overview");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "overview";
  const [tick, setTick] = useState(0);
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});

  const setBusy = useCallback((key: string, busy: boolean) => {
    setBusyMap((m) => (!!m[key] === busy ? m : { ...m, [key]: busy }));
  }, []);
  const refreshContext = useMemo(() => ({ tick, setBusy }), [tick, setBusy]);
  const busy = Object.values(busyMap).some(Boolean);

  return {
    tab,
    setTab: (t: TabId) => setRaw(t),
    subtitle: `${period.label} · Amplitude (UE) et RevenueCat en direct`,
    refresh: () => setTick((t) => t + 1),
    busy,
    refreshContext,
    sourceNote: "Amplitude Dashboard API (projet UE) et RevenueCat v2, lecture seule · résultats gardés 15 min en cache dans Solis",
  };
}
