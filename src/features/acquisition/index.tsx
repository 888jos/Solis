import { AppLabel, BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, SourceNote, TimeChart, type Column } from "@/ui";
import { formatCompact, formatInt } from "@/lib/format";
import { useAcquisitionViewModel, type FunnelRow } from "./useAcquisitionViewModel";
import "./acquisition.css";

const funnelColumns: Column<FunnelRow>[] = [
  { key: "app", header: "App", cell: (r) => (r.appSlug ? <AppLabel slug={r.appSlug} /> : <strong>{r.label}</strong>) },
  { key: "downloads", header: "Téléch.", align: "right", cell: (r) => <span className="num">{r.downloads}</span> },
  { key: "redownloads", header: <span className="aq-hide-sm">Re-téléch.</span>, align: "right", cell: (r) => <span className="num aq-hide-sm">{r.redownloads}</span> },
  { key: "newUsers", header: <span className="aq-hide-sm" title="Nouveaux utilisateurs vus par l'outil d'analytics">Nouveaux utilis.</span>, align: "right", cell: (r) => <span className="num aq-hide-sm" title={r.newUsersHint}>{r.newUsers}</span> },
  { key: "trials", header: <span className="aq-hide-sm">Essais</span>, align: "right", cell: (r) => <span className="num aq-hide-sm">{r.trialStarts}</span> },
  { key: "paid", header: <span title="Essais convertis + abonnements directs">Nouv. payants</span>, align: "right", cell: (r) => <span className="num">{r.newPaid}</span> },
  { key: "ratio", header: <span title="Nouveaux payants ÷ téléchargements">Taux</span>, align: "right", cell: (r) => <strong className="num">{r.ratio}</strong> },
];

export default function AcquisitionPage() {
  const vm = useAcquisitionViewModel();

  if (vm.notConnected) {
    return (
      <div className="f-acquisition">
        <PageHeader title="Acquisition" />
        <div className="card">
          <NotConnected source="Les rapports Sales d'App Store Connect" missing="au moins un rapport quotidien synchronisé (lancer sources/revenue:backfill)" />
        </div>
      </div>
    );
  }

  const ugc = vm.ugc;

  return (
    <div className="f-acquisition">
      <PageHeader title="Acquisition" subtitle={vm.subtitle} />

      {vm.kpis ? (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} invertDelta={k.invertDelta} foot={k.foot} hint={k.hint} />
          ))}
        </div>
      ) : (
        <KpiSkeleton count={4} />
      )}

      <div className="grid grid--main-side">
        <Card title="Téléchargements par app" subtitle={`${vm.bucketLabel} · premiers téléchargements uniquement`} action={vm.downloadsChart && <span className="aq-total num">{vm.downloadsChart.total}</span>}>
          {!vm.downloadsChart ? (
            <Skeleton height={260} />
          ) : vm.downloadsChart.hasData ? (
            <TimeChart kind="bar" x={vm.downloadsChart.x} series={vm.downloadsChart.series} height={260} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} showTotal />
          ) : (
            <EmptyState title="Aucun téléchargement sur la période" />
          )}
        </Card>

        <Card title="D'où viennent les téléchargements" subtitle="10 premiers pays" footer={vm.countries?.footer ? <span className="aq-foot">{vm.countries.footer}</span> : undefined}>
          {!vm.countries ? <Skeleton height={260} /> : vm.countries.hasData ? <BarList items={vm.countries.items} formatValue={formatInt} /> : <EmptyState title="Aucun téléchargement sur la période" />}
        </Card>
      </div>

      <Card
        title="Ma fiche App Store convertit-elle ?"
        subtitle={vm.store.kind === "ok" ? `Impressions → vues de la fiche → 1ers téléchargements, par source${vm.store.lastDay ? ` · données Apple jusqu'au ${vm.store.lastDay}` : ""}` : "Impressions → vues de la fiche → 1ers téléchargements, par source"}
      >
        {vm.store.kind === "loading" ? (
          <Skeleton height={120} />
        ) : vm.store.kind === "pending" ? (
          <EmptyState title="Rapports demandés à Apple">Apple génère les premiers rapports Analytics 1 à 2 jours après la demande (faite le 10 nov.). Ils arriveront ici tout seuls.{vm.store.message ? ` Dernière synchro : ${vm.store.message}` : ""}</EmptyState>
        ) : (
          <div className="stack">
            <div className="grid grid--kpi">
              {vm.store.kpis.map((k) => (
                <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} />
              ))}
            </div>
            <DataTable
              columns={[
                { key: "source", header: "Source", cell: (r) => r.source },
                { key: "imp", header: "Impressions", align: "right", cell: (r) => <span className="num">{r.impressions}</span> },
                { key: "pv", header: "Vues fiche", align: "right", cell: (r) => <span className="num">{r.pageViews}</span> },
                { key: "pr", header: <span className="aq-hide-sm" title="Visiteurs uniques de la fiche ÷ impressions uniques">Clic</span>, align: "right", cell: (r) => <span className="num aq-hide-sm">{r.pageRate}</span> },
                { key: "dl", header: "Téléch.", align: "right", cell: (r) => <span className="num">{r.downloads}</span> },
                { key: "cvr", header: <span title="1ers téléchargements ÷ visiteurs uniques de la fiche">Conv.</span>, align: "right", cell: (r) => <strong className="num">{r.cvr}</strong> },
              ]}
              rows={vm.store.sources}
              rowKey={(r) => r.key}
              empty={<EmptyState title="Aucune donnée sur la période" />}
            />
          </div>
        )}
      </Card>

      <Card title="La pub payante est-elle rentable ?" subtitle="Meta Ads · dépense, installations rapportées par Meta, coût par installation">
        {vm.ads.kind === "loading" ? (
          <Skeleton height={120} />
        ) : vm.ads.kind === "notConnected" ? (
          <NotConnected source="Meta Ads" missing={vm.ads.configured ? "une première synchro (page Sources)" : "META_ACCESS_TOKEN et META_AD_ACCOUNT_ID dans les variables Convex"} />
        ) : (
          <div className="stack">
            <div className="grid grid--kpi">
              {vm.ads.kpis.map((k) => (
                <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} invertDelta={k.invertDelta} foot={k.foot} />
              ))}
            </div>
            <DataTable
              columns={[
                { key: "name", header: "Campagne", cell: (r) => r.name },
                { key: "app", header: "App", cell: (r) => <AppLabel slug={r.appSlug} /> },
                { key: "spend", header: "Dépense", align: "right", cell: (r) => <span className="num">{r.spend}</span> },
                { key: "installs", header: "Install.", align: "right", cell: (r) => <span className="num">{r.installs}</span> },
                { key: "cpi", header: "CPI", align: "right", cell: (r) => <strong className="num">{r.cpi}</strong> },
              ]}
              rows={vm.ads.campaigns}
              rowKey={(r) => r.id}
              empty={<EmptyState title="Aucune dépense sur la période" />}
            />
            <SourceNote source="Meta Marketing API" updatedAt={vm.ads.syncedAt} />
          </div>
        )}
      </Card>

      <Card
        title="Les vidéos UGC font-elles monter les téléchargements ?"
        subtitle={ugc.kind === "ok" ? `${vm.bucketLabel} · vues comptées le jour de publication de la vidéo · CortiFree` : "Vues des vidéos UGC face aux téléchargements, sur les mêmes dates"}
        action={ugc.kind === "ok" ? <span className="aq-foot num">{ugc.totalViews} vues · {ugc.totalVideos}</span> : undefined}
      >
        {ugc.kind === "loading" ? (
          <Skeleton height={300} />
        ) : ugc.kind === "otherApp" ? (
          <EmptyState title="Pas d'UGC sur cette app">Les créateurs UGC ne travaillent que sur CortiFree.</EmptyState>
        ) : ugc.kind === "notConnected" ? (
          <NotConnected source="Airtable (base UGC)" missing={ugc.missing} />
        ) : (
          <div className="aq-aligned">
            <div>
              <div className="aq-chart-label">Téléchargements CortiFree</div>
              <TimeChart kind="bar" x={ugc.x} series={ugc.downloads} height={150} legend={false} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} />
            </div>
            <div>
              <div className="aq-chart-label">Vues UGC</div>
              {ugc.hasViews ? (
                <TimeChart kind="bar" x={ugc.x} series={ugc.views} height={150} legend={false} formatValue={formatCompact} formatX={vm.formatX} formatXLong={vm.formatXLong} />
              ) : (
                <EmptyState title="Aucune vidéo publiée sur la période" />
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Combien de téléchargements deviennent payants ?" subtitle={vm.funnelSubtitle} flush>
        {vm.funnel ? <DataTable columns={funnelColumns} rows={vm.funnel} rowKey={(r) => r.key} /> : <Skeleton height={140} />}
      </Card>

      <SourceNote
        source={`App Store Connect, rapports Sales et Subscription Event quotidiens${vm.latestDayLabel ? ` jusqu'au ${vm.latestDayLabel}` : ""} · nouveaux utilisateurs : Amplitude (CortiFree), PostHog (Quest IRL) · dépenses : page Dépenses`}
        updatedAt={vm.lastFetchedAt}
      />
    </div>
  );
}
