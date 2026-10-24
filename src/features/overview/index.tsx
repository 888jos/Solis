import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEurCompact } from "@/lib/format";
import { Card, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, Sparkline, TimeChart } from "@/ui";
import { AppCard } from "./components/AppCard";
import { WatchList } from "./components/WatchList";
import { useOverviewViewModel } from "./useOverviewViewModel";
import "./overview.css";

export default function OverviewPage() {
  const vm = useOverviewViewModel();

  if (vm.loading) {
    return (
      <div className="f-overview">
        <PageHeader title="Vue d'ensemble" subtitle={vm.subtitle} />
        <KpiSkeleton count={6} />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!vm.hasSales) {
    return (
      <div className="f-overview">
        <PageHeader title="Vue d'ensemble" subtitle={vm.subtitle} />
        <div className="card">
          <NotConnected source="Les rapports Sales d'App Store Connect" missing="au moins un rapport quotidien synchronisé (sources/revenue:backfill)" />
        </div>
      </div>
    );
  }

  return (
    <div className="f-overview">
      <PageHeader title="Vue d'ensemble" subtitle={vm.subtitle} />

      <div className="ov-fresh">
        <span>{vm.freshness}</span>
        {vm.syncIssue && (
          <Link to={vm.syncTo} className="ov-fresh__issue">
            <AlertTriangle size={13} />
            {vm.syncIssue}
          </Link>
        )}
      </div>

      <div className="ov-kpis">
        {vm.kpis.map((k) => (
          <Kpi
            key={k.key}
            label={k.label}
            value={k.value}
            delta={k.missing ? undefined : k.delta}
            invertDelta={k.invertDelta}
            hint={k.hint}
            foot={k.missing ? <Link to={k.missing.to}>{k.missing.label}</Link> : k.foot}
            spark={<div className="ov-kpi-spark">{k.spark ? <Sparkline values={k.spark} color={vm.sparkColor} height={26} /> : null}</div>}
          />
        ))}
      </div>

      <div className="grid grid--main-side">
        <Card title="D'où vient le net ?" subtitle={`Net versé par app · ${vm.bucketLabel.toLowerCase()}, remboursements déduits`} action={<span className="ov-total num">{vm.chart.total}</span>}>
          {vm.chart.hasData ? (
            <TimeChart kind="bar" x={vm.chart.x} series={vm.chart.series} height={250} formatValue={formatEurCompact} formatX={vm.formatX} formatXLong={vm.formatXLong} showTotal />
          ) : (
            <EmptyState title="Aucun revenu sur la période" />
          )}
        </Card>

        <Card title="À surveiller" subtitle={vm.watchSubtitle} flush>
          <WatchList rows={vm.watch} />
        </Card>
      </div>

      <div className={vm.singleApp ? "ov-apps ov-apps--single" : "ov-apps"}>
        {vm.apps.map((a) => (
          <AppCard key={a.slug} app={a} />
        ))}
      </div>
    </div>
  );
}
