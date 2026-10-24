import { BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, NotConnected, Skeleton, SourceNote, TimeChart, type Column } from "@/ui";
import { formatEurCompact, formatInt } from "@/lib/format";
import { useAppStoreViewModel, type VersionRow } from "./useAppStoreViewModel";

const versionColumns: Column<VersionRow>[] = [
  { key: "version", header: "Version", cell: (r) => <strong className="num">{r.version}</strong> },
  { key: "state", header: "État", cell: (r) => r.state },
  { key: "date", header: "Date", cell: (r) => <span className="num">{r.date}</span> },
  { key: "build", header: <span className="cr-hide-sm">Build</span>, align: "right", cell: (r) => <span className="num cr-hide-sm">{r.build}</span> },
];

export function AppStoreTab() {
  const vm = useAppStoreViewModel();
  if (vm.loading) {
    return (
      <>
        <KpiSkeleton count={4} />
        <Skeleton height={240} />
      </>
    );
  }
  if (!vm.hasSales) {
    return (
      <Card>
        <NotConnected source="Les rapports Sales d'App Store Connect" missing="un rapport quotidien synchronisé pour Cocorise (sources/revenue:backfill)" />
      </Card>
    );
  }
  return (
    <>
      <div className="grid grid--kpi">
        {vm.kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} />
        ))}
      </div>
      <div className="grid grid--2">
        <Card title="Téléchargements" subtitle={`${vm.bucketLabel} · premiers téléchargements`}>
          {vm.hasDownloads ? <TimeChart kind="bar" x={vm.x} series={vm.downloads} height={220} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} legend={false} /> : <EmptyState title="Aucun téléchargement sur la période" />}
        </Card>
        <Card title="Net versé par Apple" subtitle={`${vm.bucketLabel} · remboursements déduits`}>
          {vm.hasProceeds ? <TimeChart kind="bar" x={vm.x} series={vm.proceeds} height={220} formatValue={formatEurCompact} formatX={vm.formatX} formatXLong={vm.formatXLong} legend={false} /> : <EmptyState title="Aucun revenu sur la période" />}
        </Card>
      </div>

      <h2 className="cr-section-title">Abonnements</h2>
      <div className="grid grid--kpi">
        {vm.subsKpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} />
        ))}
      </div>
      <div className="grid grid--main-side">
        <Card title="Avis récents" subtitle={vm.periodReviews} action={<span className="num secondary" title={vm.rating.foot}>{vm.rating.value} ★</span>}>
          {vm.reviews.length ? (
            <div className="cr-reviews">
              {vm.reviews.map((r) => (
                <article className="cr-review" key={r.key}>
                  <div className="cr-review__head">
                    <strong>{r.title}</strong>
                    <span className="secondary" aria-label={r.stars}>{r.stars}</span>
                  </div>
                  {r.body && <p className="cr-review__body">{r.body}</p>}
                  <span className="cr-review__meta">{r.meta}</span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Aucun avis écrit" />
          )}
        </Card>
        <div className="stack">
          <Card title="Mouvements d'abonnement" subtitle="Rapport SUBSCRIPTION_EVENT Apple, sur la période">
            {vm.events.length ? <BarList items={vm.events} formatValue={formatInt} /> : <EmptyState title="Aucun mouvement sur la période" />}
          </Card>
          <Card title="Versions" subtitle="Dernières versions App Store Connect" flush>
            <DataTable columns={versionColumns} rows={vm.versions} rowKey={(r) => r.key} />
          </Card>
        </div>
      </div>
      <SourceNote source={`App Store Connect (Sales, Subscription, avis, versions)${vm.latestSaleLabel ? ` · ventes jusqu'au ${vm.latestSaleLabel}` : ""}`} />
    </>
  );
}
