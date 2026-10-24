import { RefreshCw } from "lucide-react";
import { PageHeader, Segmented, SourceNote } from "@/ui";
import { AppStoreTab } from "./tabs/AppStoreTab";
import { EventsTab } from "./tabs/EventsTab";
import { FreeWakeupsTab } from "./tabs/FreeWakeupsTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { OnboardingTab } from "./tabs/OnboardingTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { useCocoriseViewModel, type TabKey } from "./useCocoriseViewModel";
import "./cocorise.css";

export default function CocorisePage() {
  const vm = useCocoriseViewModel();
  const actions = vm.showRefresh ? (
    <div className="cr-actions">
      {vm.refreshing && (
        <span className="cr-computing">
          <RefreshCw size={13} className="cr-spin" aria-hidden />
          Lecture Firestore…
        </span>
      )}
      <button type="button" className="btn" onClick={vm.refresh} disabled={vm.refreshing}>
        <RefreshCw size={14} aria-hidden />
        Rafraîchir
      </button>
    </div>
  ) : undefined;

  return (
    <div className="f-cocorise">
      <PageHeader title="Cocorise" subtitle={vm.subtitle} actions={actions} />
      <div className="cr-tabs">
        <Segmented<TabKey> label="Rubrique" value={vm.tab} onChange={vm.setTab} options={vm.tabs} />
      </div>
      {vm.tab === "overview" ? (
        <OverviewTab fs={vm.fs} />
      ) : vm.tab === "onboarding" ? (
        <OnboardingTab fs={vm.fs} />
      ) : vm.tab === "free" ? (
        <FreeWakeupsTab fs={vm.fs} />
      ) : vm.tab === "notifications" ? (
        <NotificationsTab fs={vm.fs} />
      ) : vm.tab === "events" ? (
        <EventsTab fs={vm.fs} />
      ) : (
        <AppStoreTab />
      )}
      {vm.sourceNote && <SourceNote source={vm.sourceNote} updatedAt={vm.fetchedAt} />}
    </div>
  );
}
