import { AlertTriangle, CreditCard, Download, Hourglass, Receipt, Scale, Wallet, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEurCompact } from "@/lib/format";
import { Card, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, Sparkline, TimeChart } from "@/ui";
import { AppCard } from "./components/AppCard";
import { WatchList } from "./components/WatchList";
import { useOverviewViewModel } from "./useOverviewViewModel";
import "./overview.css";

/** Glow color of each KPI curve: money in is green, money out red, people violet. */
const SPARK_COLOR: Record<string, string> = { net: "var(--glow-good)", margin: "var(--glow-good)", spend: "var(--glow-bad)", paid: "var(--glow-violet)", trials: "var(--glow-violet)", downloads: "var(--glow-violet)" };

const KPI_ICON: Record<string, LucideIcon> = { net: Wallet, spend: Receipt, margin: Scale, paid: CreditCard, trials: Hourglass, downloads: Download };

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
        {vm.kpis.map((k, i) => (
          <Kpi
            key={k.key}
            label={<KpiLabel icon={KPI_ICON[k.key]}>{k.label}</KpiLabel>}
            value={k.value}
            delta={k.missing ? undefined : k.delta}
            invertDelta={k.invertDelta}
            hint={k.hint}
            foot={k.missing ? <Link to={k.missing.to}>{k.missing.label}</Link> : k.foot}
            big={i < 2}
            spark={k.spark ? <Sparkline values={k.spark} color={SPARK_COLOR[k.key] ?? "var(--glow-good)"} height={i < 2 ? 64 : 40} /> : undefined}
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

function KpiLabel({ icon: Icon, children }: { icon?: LucideIcon; children: string }) {
  return (
    <>
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </>
  );
}
