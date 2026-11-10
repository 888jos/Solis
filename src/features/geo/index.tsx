import { AppLabel, BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, SourceNote, type Column } from "@/ui";
import { Globe } from "@/ui/charts/Globe";
import { useGeoViewModel, type CountryRow } from "./useGeoViewModel";
import "./geo.css";

const columns: Column<CountryRow>[] = [
  {
    key: "country",
    header: "Pays",
    cell: (r) => (
      <span className="geo-country">
        <span className="geo-country__flag" aria-hidden>
          {r.flag}
        </span>
        <span className="geo-country__name">
          {r.name}
          <small>
            {r.code}
            {r.refunds && <> · {r.refunds}</>}
          </small>
        </span>
      </span>
    ),
  },
  { key: "net", header: "Net", align: "right", cell: (r) => <strong className="num">{r.net}</strong> },
  { key: "gross", header: <span className="geo-hide-sm">Brut TTC</span>, align: "right", cell: (r) => <span className="num geo-hide-sm">{r.gross}</span> },
  { key: "exvat", header: <span className="geo-hide-md">HT</span>, align: "right", cell: (r) => <span className="num geo-hide-md">{r.exVat}</span> },
  { key: "vat", header: <span className="geo-hide-md">TVA eff.</span>, align: "right", cell: (r) => <span className="num geo-hide-md" title={r.vatHint}>{r.vat}</span> },
  { key: "tx", header: <span className="geo-hide-sm">Transac.</span>, align: "right", cell: (r) => <span className="num geo-hide-sm">{r.transactions}</span> },
  { key: "dl", header: "Téléch.", align: "right", cell: (r) => <span className="num">{r.downloads}</span> },
  { key: "conv", header: <span className="geo-hide-sm" title="Nouveaux abonnements payants ÷ premiers téléchargements">Conv.</span>, align: "right", cell: (r) => <span className="num geo-hide-sm" title={r.conversionHint}>{r.conversion}</span> },
  { key: "active", header: <span title="Abonnés payants actifs au dernier rapport Subscription de la période">Abonnés</span>, align: "right", cell: (r) => <span className="num">{r.active}</span> },
];

export default function GeoPage() {
  const vm = useGeoViewModel();

  if (vm.notConnected) {
    return (
      <div className="f-geo">
        <PageHeader title="Pays" />
        <div className="card">
          <NotConnected source="Les rapports Sales d'App Store Connect" missing="au moins un rapport quotidien synchronisé (lancer sources/revenue:backfill)" />
        </div>
      </div>
    );
  }

  return (
    <div className="f-geo">
      <PageHeader title="Pays" subtitle={vm.subtitle} />

      {vm.kpis ? (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} />
          ))}
        </div>
      ) : (
        <KpiSkeleton count={4} />
      )}

      <div className="geo-hero">
        <div className="geo-hero__globe">{vm.netBars && vm.netBars.length > 0 && <Globe points={vm.netBars.map((b) => ({ code: b.key, value: b.value }))} />}</div>
        <Card title="Où se fait le net ?" subtitle={vm.netSubtitle} action={vm.totalNet && <span className="geo-total num">{vm.totalNet}</span>}>
          {!vm.netBars ? <Skeleton height={240} /> : vm.netBars.length ? <BarList items={vm.netBars} formatValue={vm.formatEur} limit={vm.netLimit} /> : <EmptyState title="Aucun net sur la période" />}
        </Card>
      </div>

      <div className="grid grid--2">
        <Card title="Où sont les abonnés payants ?" subtitle={vm.activeSubtitle ?? "Dernier rapport Subscription de la période"}>
          {!vm.activeBars ? (
            <Skeleton height={240} />
          ) : !vm.hasActiveReport ? (
            <EmptyState title="Aucun rapport Subscription sur la période">Le rapport quotidien d'App Store Connect n'est pas encore synchronisé pour ces dates.</EmptyState>
          ) : vm.activeBars.length ? (
            <BarList items={vm.activeBars} formatValue={vm.formatInt} limit={vm.netLimit} />
          ) : (
            <EmptyState title="Aucun abonné payant actif" />
          )}
        </Card>

        {vm.multiples?.map((m) => (
          <Card key={m.slug} title={<AppLabel slug={m.slug} />} subtitle="Top 5 pays par net" action={<span className="geo-total num">{m.total}</span>}>
            {m.items.length ? <BarList items={m.items} formatValue={vm.formatEur} /> : <EmptyState title="Aucun net sur la période" />}
          </Card>
        ))}
      </div>

      <Card
        title="Détail par pays"
        subtitle={vm.tableSubtitle}
        flush
        footer={
          vm.hiddenCount > 0 ? (
            <button type="button" className="geo-more" onClick={vm.toggleShowAll}>
              {vm.showAll ? "Masquer les pays sans vente" : `Afficher ${vm.hiddenCount} pays avec téléchargements seulement`}
            </button>
          ) : undefined
        }
      >
        {vm.rows ? <DataTable columns={columns} rows={vm.rows} rowKey={(r) => r.key} empty={<EmptyState title="Aucune vente sur la période" />} /> : <Skeleton height={200} />}
      </Card>

      <SourceNote
        source={`App Store Connect, rapports Sales et Subscription quotidiens${vm.latestDayLabel ? ` jusqu'au ${vm.latestDayLabel}` : ""} · storefront du client · converti en euros au taux du jour`}
        updatedAt={vm.lastFetchedAt}
      />
    </div>
  );
}
