import { useSearchParams } from "react-router-dom";
import { usePeriod } from "@/lib/filters";
import { useFirestoreReport } from "./data/useFirestoreReport";

export type TabKey = "overview" | "onboarding" | "free" | "notifications" | "events" | "store";

const TABS: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Vue d'ensemble" },
  { value: "onboarding", label: "Onboarding" },
  { value: "free", label: "Réveils gratuits" },
  { value: "notifications", label: "Notifications" },
  { value: "events", label: "Événements" },
  { value: "store", label: "App Store" },
];

/** Page ViewModel: tab in the URL (?tab=), shared Firestore report, header texts. */
export function useCocoriseViewModel() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.value === raw) ? (raw as TabKey) : "overview";
  const setTab = (next: TabKey) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "overview") p.delete("tab");
      else p.set("tab", next);
      return p;
    });

  const period = usePeriod();
  const fs = useFirestoreReport();
  const usesFirestore = tab !== "store";
  const coverage = fs.report ? ` · données Firestore du ${fs.report.from.split("-").reverse().join("/")} au ${fs.report.to.split("-").reverse().join("/")}` : "";

  return {
    tab,
    setTab,
    tabs: TABS,
    fs,
    subtitle: `${period.label}${usesFirestore ? coverage : " · App Store Connect"}`,
    showRefresh: usesFirestore && fs.state.kind !== "notConnected",
    refreshing: fs.refreshing,
    refresh: fs.refresh,
    sourceNote: usesFirestore ? `Firestore snapwake-33207 (analytics_events, users) · jours de Paris${fs.lastDayLabel ? ` · dernier événement le ${fs.lastDayLabel}` : ""}` : null,
    fetchedAt: fs.fetchedAt,
  };
}
