import { RefreshCw } from "lucide-react";
import { Card, EmptyState, NotConnected, PageHeader, Segmented, SourceNote } from "@/ui";
import { ActivityTab } from "./tabs/ActivityTab";
import { AnswersTab } from "./tabs/AnswersTab";
import { ConversionTab } from "./tabs/ConversionTab";
import { CreatorsTab } from "./tabs/CreatorsTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { OnboardingTab } from "./tabs/OnboardingTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { useQuestirlViewModel, type TabKey } from "./useQuestirlViewModel";
import "./questirl.css";

export default function QuestirlPage() {
  const vm = useQuestirlViewModel();

  if (vm.missingEnv.length) {
    return (
      <div className="f-questirl">
        <PageHeader title="Quest IRL" />
        <div className="card">
          <NotConnected source="PostHog (Quest IRL)" missing={vm.missingEnv.join(", ")}>
            À définir sur Convex (dev et prod) : npx convex env set NOM valeur, valeurs dans LifeQuest/analytics-dashboard/.env.
          </NotConnected>
        </div>
      </div>
    );
  }

  const actions = (
    <>
      {vm.computing && (
        <span className="qi-computing">
          <RefreshCw size={13} className="qi-spin" aria-hidden />
          Calcul PostHog…
        </span>
      )}
      <button type="button" className="btn" onClick={vm.refresh} disabled={vm.computing}>
        <RefreshCw size={14} aria-hidden />
        Rafraîchir
      </button>
    </>
  );

  const body =
    vm.error && !vm.data ? (
      <Card>
        <EmptyState title="PostHog n'a pas répondu">{vm.error}</EmptyState>
      </Card>
    ) : vm.tab === "overview" ? (
      <OverviewTab data={vm.data} window={vm.periodDays} />
    ) : vm.tab === "onboarding" ? (
      <OnboardingTab data={vm.data} />
    ) : vm.tab === "conversion" ? (
      <ConversionTab data={vm.data} />
    ) : vm.tab === "creators" ? (
      <CreatorsTab data={vm.data} />
    ) : vm.tab === "notifications" ? (
      <NotificationsTab data={vm.data} window={vm.periodDays} />
    ) : vm.tab === "answers" ? (
      <AnswersTab data={vm.data} />
    ) : (
      <ActivityTab data={vm.data} />
    );

  return (
    <div className="f-questirl">
      <PageHeader title="Quest IRL" subtitle={vm.subtitle} actions={actions} />
      <div className="qi-tabs">
        <Segmented<TabKey> label="Rubrique" value={vm.tab} onChange={vm.setTab} options={vm.tabs} />
      </div>
      {body}
      <SourceNote source={vm.sourceNote} updatedAt={vm.fetchedAt} />
    </div>
  );
}
