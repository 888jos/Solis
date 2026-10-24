import { AlertTriangle, RefreshCw } from "lucide-react";
import { formatInt } from "@/lib/format";
import { AppLabel, AppPicker, Badge, BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, PageHeader, Skeleton, SourceNote, TimeChart, type Column } from "@/ui";
import { AppStatusCard } from "./components/AppStatusCard";
import { ReleaseTimeline } from "./components/ReleaseTimeline";
import { useVersionsViewModel } from "./useVersionsViewModel";
import "./versions.css";

type View = NonNullable<ReturnType<typeof useVersionsViewModel>["view"]>;
type VersionRow = View["versionRows"][number];
type BuildRow = View["buildRows"][number];

export default function VersionsPage() {
  const vm = useVersionsViewModel();
  const v = vm.view;

  const syncButton = (
    <button type="button" className="btn" onClick={vm.sync.run} disabled={vm.sync.running}>
      <RefreshCw className={vm.sync.running ? "vs-spin" : undefined} />
      {vm.sync.running ? "Synchro…" : "Actualiser"}
    </button>
  );
  const header = (
    <PageHeader
      title="Versions"
      subtitle="Ce qui est en ligne, ce qui arrive, et le rythme de sortie"
      actions={
        <>
          <AppPicker value={vm.app} onChange={vm.setApp} />
          {syncButton}
        </>
      }
    />
  );

  if (vm.loading || !v) {
    return (
      <div className="stack f-versions" style={{ gap: "var(--space-5)" }}>
        {header}
        <KpiSkeleton count={4} />
        <Skeleton height={220} />
        <Skeleton height={260} />
      </div>
    );
  }

  const error = vm.sync.error ?? v.storedError;

  if (v.empty) {
    return (
      <div className="stack f-versions" style={{ gap: "var(--space-5)" }}>
        {header}
        <div className="card">
          <EmptyState title="Pas encore synchronisé" action={syncButton}>
            {error ? `Dernière synchro en erreur : ${error}` : "Aucune version ni build App Store Connect en base. Lance une première synchro."}
          </EmptyState>
        </div>
      </div>
    );
  }

  const versionColumns: Column<VersionRow>[] = [
    ...(v.showAppColumn ? [{ key: "app", header: "App", cell: (r: VersionRow) => <AppLabel slug={r.appSlug} /> }] : []),
    { key: "version", header: "Version", cell: (r) => <span className="vs-strong">{r.version}</span> },
    { key: "state", header: "État", cell: (r) => <Badge status={r.status} icon={r.status !== "neutral"}>{r.stateLabel}</Badge> },
    { key: "build", header: "Build", align: "right", cell: (r) => r.build },
    { key: "created", header: "Créée", align: "right", cell: (r) => <span className="muted">{r.created}</span> },
    { key: "submitted", header: "Soumise", align: "right", cell: (r) => r.submitted },
    { key: "released", header: "En ligne", align: "right", cell: (r) => r.released },
    { key: "s2l", header: "Soumission → ligne", align: "right", cell: (r) => r.submitToLive },
    { key: "gap", header: "Depuis la précédente", align: "right", cell: (r) => r.gap },
    { key: "subs", header: "Soumissions", align: "right", cell: (r) => r.submissions },
    { key: "release", header: "Publication", cell: (r) => <span className="muted">{r.release}</span> },
  ];

  const buildColumns: Column<BuildRow>[] = [
    ...(v.showAppColumn ? [{ key: "app", header: "App", cell: (r: BuildRow) => <AppLabel slug={r.appSlug} /> }] : []),
    { key: "version", header: "Version", cell: (r) => <span className="vs-strong">{r.version}</span> },
    { key: "build", header: "Build", align: "right", cell: (r) => r.build },
    { key: "uploaded", header: "Envoyé", align: "right", cell: (r) => r.uploaded },
    { key: "state", header: "État", cell: (r) => <Badge status={r.status} icon={r.status !== "neutral"}>{r.stateLabel}</Badge> },
    { key: "expiry", header: "Expiration TestFlight", align: "right", cell: (r) => <span className="muted">{r.expiry}</span> },
    { key: "minos", header: "iOS min.", align: "right", cell: (r) => <span className="muted">{r.minOs}</span> },
    { key: "attached", header: "Version App Store", align: "right", cell: (r) => r.attachedTo },
  ];

  return (
    <div className="stack f-versions" style={{ gap: "var(--space-5)" }}>
      {header}

      {error && (
        <div className="card" style={{ padding: "var(--space-3) var(--space-5)" }}>
          <div className="vs-error">
            <Badge status="critical">Synchro</Badge>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="grid grid--kpi">
        {v.kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} hint={k.hint} />
        ))}
      </div>

      {v.appCards.length === 1 ? (
        <AppStatusCard card={v.appCards[0]} wide />
      ) : (
        <div className="grid grid--3">
          {v.appCards.map((card) => (
            <AppStatusCard key={card.slug} card={card} />
          ))}
        </div>
      )}

      <Card title="Quand chaque version est-elle sortie ?" subtitle="Point plein : mise en ligne publique. Anneau : version en cours chez Apple.">
        <ReleaseTimeline from={v.timeline.from} to={v.timeline.to} lanes={v.timeline.lanes} />
      </Card>

      <div className="grid grid--2">
        <Card title="Combien de builds envoyés chaque mois ?" subtitle={`${formatInt(v.builds.total)} builds au total · ${formatInt(v.builds.last90)} sur 90 jours`}>
          <TimeChart kind="bar" x={v.builds.x} series={v.builds.series} height={220} formatValue={formatInt} formatX={v.formatMonth} showTotal />
        </Card>
        <Card title="Combien de temps entre soumission et mise en ligne ?" subtitle="Dernières versions publiées, publication manuelle comprise">
          {v.reviewBars.length ? (
            <BarList items={v.reviewBars} formatValue={v.formatDuration} />
          ) : (
            <EmptyState title="Aucune soumission liée à une version publiée" />
          )}
        </Card>
      </div>

      <Card title="Historique des versions" subtitle="Toutes les versions App Store Connect, la plus récente en premier" flush>
        <DataTable columns={versionColumns} rows={v.versionRows} rowKey={(r) => r.key} empty={<EmptyState title="Aucune version" />} />
      </Card>

      <Card title="Builds envoyés" subtitle="Du plus récent au plus ancien" flush>
        <DataTable columns={buildColumns} rows={v.buildRows} rowKey={(r) => r.key} empty={<EmptyState title="Aucun build" />} />
        {(v.buildsHidden > 0 || v.buildsCapped) && (
          <div className="vs-more">
            {v.buildsHidden > 0 && (
              <button type="button" className="btn btn--ghost" onClick={vm.toggleBuilds}>
                {v.buildsShownAll ? "Afficher moins" : `Afficher ${formatInt(v.buildsHidden)} builds de plus`}
              </button>
            )}
            {v.buildsCapped && v.buildsShownAll && (
              <span className="vs-meta row">
                <AlertTriangle size={13} />
                200 builds les plus récents affichés
              </span>
            )}
          </div>
        )}
      </Card>

      <SourceNote source="App Store Connect (versions, builds, soumissions) · dates de sortie : fiche App Store publique" updatedAt={v.updatedAt} />
    </div>
  );
}
