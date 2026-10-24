import { AppLabel, Card, DataTable, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, SourceNote, TimeChart, type Column } from "@/ui";
import { formatEurCompact } from "@/lib/format";
import { Waterfall } from "./components/Waterfall";
import { useRevenueViewModel, type ProductRow, type RefundRow } from "./useRevenueViewModel";
import "./revenue.css";

const productColumns: Column<ProductRow>[] = [
  {
    key: "title",
    header: "Produit",
    cell: (r) => (
      <span className="rv-product">
        <span>{r.title}</span>
        <small>
          {r.kind}
          <span className="rv-show-sm"> · {r.appName}</span>
        </small>
      </span>
    ),
  },
  { key: "app", header: <span className="rv-hide-sm">App</span>, cell: (r) => <span className="rv-hide-sm"><AppLabel slug={r.appSlug} /></span> },
  { key: "units", header: "Ventes", align: "right", cell: (r) => <span className="num">{r.units}</span> },
  { key: "refunds", header: <span className="rv-hide-sm">Remb.</span>, align: "right", cell: (r) => <span className="num rv-hide-sm">{r.refunds}</span> },
  { key: "gross", header: <span className="rv-hide-sm">Brut TTC</span>, align: "right", cell: (r) => <span className="num rv-hide-sm">{r.gross}</span> },
  { key: "net", header: "Net", align: "right", cell: (r) => <strong className="num">{r.net}</strong> },
];

const refundColumns: Column<RefundRow>[] = [
  { key: "date", header: "Date", cell: (r) => <span className="num">{r.date}</span> },
  { key: "title", header: "Produit", cell: (r) => r.title },
  { key: "app", header: <span className="rv-hide-sm">App</span>, cell: (r) => <span className="rv-hide-sm"><AppLabel slug={r.appSlug} /></span> },
  { key: "country", header: "Pays", cell: (r) => r.country },
  { key: "gross", header: <span className="rv-hide-sm">Brut</span>, align: "right", cell: (r) => <span className="num rv-hide-sm">{r.gross}</span> },
  { key: "net", header: "Net repris", align: "right", cell: (r) => <span className="num">{r.net}</span> },
];

export default function RevenuePage() {
  const vm = useRevenueViewModel();

  if (vm.notConnected) {
    return (
      <div className="f-revenue">
        <PageHeader title="Revenus" />
        <div className="card">
          <NotConnected source="Les rapports Sales d'App Store Connect" missing="au moins un rapport quotidien synchronisé (lancer sources/revenue:backfill)" />
        </div>
      </div>
    );
  }

  return (
    <div className="f-revenue">
      <PageHeader title="Revenus" subtitle={vm.subtitle} />

      {vm.kpis ? (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} />
          ))}
        </div>
      ) : (
        <KpiSkeleton count={4} />
      )}

      <div className="grid grid--main-side">
        <Card title="Net versé par Apple, par app" subtitle={`${vm.bucketLabel} · remboursements déduits`} action={vm.chart && <span className="rv-chart-total num">{vm.chart.total}</span>}>
          {!vm.chart ? (
            <Skeleton height={260} />
          ) : vm.chart.hasData ? (
            <TimeChart kind="bar" x={vm.chart.x} series={vm.chart.series} height={260} formatValue={formatEurCompact} formatX={vm.formatX} formatXLong={vm.formatXLong} showTotal />
          ) : (
            <EmptyState title="Aucun revenu sur la période" />
          )}
        </Card>

        <Card title="Du brut au net" subtitle="Ce que paient les clients, et ce qui arrive sur le compte">
          {!vm.waterfall ? <Skeleton height={220} /> : vm.waterfall.hasData ? <Waterfall steps={vm.waterfall.steps} /> : <EmptyState title="Rien d'encaissé sur la période" />}
        </Card>
      </div>

      <Card title="Produits qui rapportent" subtitle="Classés par net, remboursements déduits" flush>
        {vm.products ? <DataTable columns={productColumns} rows={vm.products} rowKey={(r) => r.key} empty={<EmptyState title="Aucune vente payante sur la période" />} /> : <Skeleton height={160} />}
      </Card>

      {vm.refunds && vm.refunds.length > 0 && (
        <Card title="Remboursements" subtitle={vm.refundTotal ?? undefined} flush>
          <DataTable columns={refundColumns} rows={vm.refunds} rowKey={(r) => r.key} />
        </Card>
      )}

      <SourceNote source={`App Store Connect, rapports Sales quotidiens${vm.latestDayLabel ? ` jusqu'au ${vm.latestDayLabel}` : ""} · converti en euros au taux du jour de vente`} updatedAt={vm.lastFetchedAt} />
    </div>
  );
}
