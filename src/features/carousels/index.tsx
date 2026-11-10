import { EmptyState, KpiSkeleton, PageHeader, Segmented, Skeleton, SourceNote } from "@/ui";
import { CarouselDetail } from "./components/CarouselDetail";
import { CarouselEditorScreen } from "./components/CarouselEditor";
import { Gallery } from "./components/Gallery";
import { ModelsView } from "./components/ModelsView";
import { PlanView } from "./components/PlanView";
import { useCarouselsViewModel, type ViewKey } from "./useCarouselsViewModel";
import "./carousels.css";

export default function CarouselsPage() {
  const vm = useCarouselsViewModel();

  const header = (
    <PageHeader
      title="Carrousels"
      subtitle={`Comptes TikTok ${vm.app === "questirl" ? "Quest IRL" : "CortiFree"} : plan du jour, validation, production`}
      actions={
        vm.cid ? undefined : (
          <div className="cr-head-controls">
            <Segmented<string> label="App" value={vm.app} onChange={vm.setApp} options={vm.apps} />
            <Segmented<ViewKey>
              label="Vue"
              value={vm.view}
              onChange={vm.setView}
              options={vm.app === "cortifree" ? vm.views : vm.views.filter((v) => v.value !== "models")}
            />
          </div>
        )
      }
    />
  );

  let body;
  if (vm.loading) {
    body = (
      <>
        {!vm.cid && vm.view === "plan" && <KpiSkeleton count={4} />}
        <Skeleton height={360} />
      </>
    );
  } else if (vm.cid) {
    body = vm.detail && vm.detailData ? (
      vm.editing ? (
        <CarouselEditorScreen detail={vm.detailData} onClose={vm.closeEditor} />
      ) : (
        <CarouselDetail detail={vm.detail} review={vm.review} onClose={vm.close} onEdit={vm.openEditor} />
      )
    ) : (
      <div className="card">
        <EmptyState title="Carrousel introuvable" action={<button type="button" className="btn" onClick={vm.close}>Retour</button>}>
          Il n'existe pas ici, ou il n'a pas encore été synchronisé depuis le Mac.
        </EmptyState>
      </div>
    );
  } else if (vm.view === "models") {
    body = <ModelsView />;
  } else if (vm.view === "plan" && vm.plan) {
    body = <PlanView plan={vm.plan} date={vm.date} onDate={vm.setDate} />;
  } else if (vm.gallery) {
    body = (
      <Gallery
        gallery={vm.gallery}
        showFilters={vm.view === "all"}
        statusFilter={vm.statusFilter}
        onStatus={vm.setStatusFilter}
        account={vm.account}
        onAccount={vm.setAccount}
        emptyTitle={vm.view === "review" ? "Rien à valider" : "Aucun carrousel"}
      />
    );
  }

  return (
    <div className="stack f-carousels">
      {header}
      {vm.review.flash && (
        <p className="cr-flash" role="status">
          {vm.review.flash}
        </p>
      )}
      {body}
      {vm.syncNote && <SourceNote source={`Carousel Factory (Mac), ${vm.syncNote}`} />}
    </div>
  );
}
