import { RefreshCw } from "lucide-react";
import { lazy, Suspense } from "react";
import { PageHeader, Segmented, Skeleton, SourceNote } from "@/ui";
import { usePageViewModel, TABS, type TabId } from "./usePageViewModel";
import { RefreshContext } from "./data/useWidgets";
import "./cortifree.css";

const VIEWS: Record<
  TabId,
  React.LazyExoticComponent<() => React.JSX.Element>
> = {
  overview: lazy(() => import("./tabs/overview/OverviewTab")),
  onboarding: lazy(() => import("./tabs/onboarding/OnboardingTab")),
  icp: lazy(() => import("./tabs/icp/IcpTab")),
  monetization: lazy(() => import("./tabs/monetization/MonetizationTab")),
  engagement: lazy(() => import("./tabs/engagement/EngagementTab")),
  checkin: lazy(() => import("./tabs/checkin/CheckinTab")),
  notifications: lazy(() => import("./tabs/notifications/NotificationsTab")),
  exercises: lazy(() => import("./tabs/exercises/ExercisesTab")),
  explorer: lazy(() => import("./tabs/explorer/ExplorerTab")),
};

/** Apps > CortiFree: the old local Amplitude + RevenueCat dashboard, one tab per page. */
export default function CortiFreePage() {
  const vm = usePageViewModel();
  const View = VIEWS[vm.tab];
  return (
    <RefreshContext.Provider value={vm.refreshContext}>
      <div className="stack f-cortifree" style={{ gap: "var(--space-5)" }}>
        <PageHeader
          title="CortiFree"
          subtitle={vm.subtitle}
          actions={
            <button
              type="button"
              className="btn"
              onClick={vm.refresh}
              disabled={vm.busy}
              title="Recalculer depuis Amplitude et RevenueCat (ignore le cache)"
            >
              <RefreshCw className={vm.busy ? "cf-spin" : undefined} />
              {vm.busy ? "Calcul…" : "Actualiser"}
            </button>
          }
        />
        <div className="cf-tabs">
          <Segmented<TabId>
            label="Section"
            value={vm.tab}
            onChange={vm.setTab}
            options={TABS.map((t) => ({ value: t.id, label: t.label }))}
          />
        </div>
        <Suspense fallback={<Skeleton height={320} />}>
          <View key={vm.tab} />
        </Suspense>
        <SourceNote source={vm.sourceNote} />
      </div>
    </RefreshContext.Provider>
  );
}
