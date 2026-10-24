import { Link } from "react-router-dom";
import { Card, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, SourceNote, TimeChart } from "@/ui";
import { formatEurCompact } from "@/lib/format";
import { ContributionTable } from "./components/ContributionTable";
import { PnlTable } from "./components/PnlTable";
import { useProfitabilityViewModel } from "./useProfitabilityViewModel";
import "./profitability.css";

export default function ProfitabilityPage() {
  const vm = useProfitabilityViewModel();

  if (vm.notConnected) {
    return (
      <div className="f-profitability">
        <PageHeader title="Rentabilité" />
        <div className="card">
          <NotConnected source="Les rapports Sales d'App Store Connect" missing="au moins un rapport quotidien synchronisé (lancer sources/revenue:backfill)" />
        </div>
      </div>
    );
  }

  return (
    <div className="f-profitability">
      <PageHeader title="Rentabilité" subtitle={vm.subtitle} />

      {vm.kpis ? (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} />
          ))}
        </div>
      ) : (
        <KpiSkeleton count={4} />
      )}

      {(vm.expensesMissing || vm.partialCoverage) && (
        <div className="card pf-notice">
          <span>{vm.expensesMissing ? "Aucune dépense importée : la marge ne peut pas être calculée, seul le net Apple est affiché." : vm.partialCoverage}</span>
          <Link to="/depenses">Importer un relevé →</Link>
        </div>
      )}

      <div className="grid grid--main-side">
        <Card title="Le net couvre-t-il les dépenses ?" subtitle="Net versé par Apple et dépenses, par mois">
          {vm.loading ? (
            <Skeleton height={240} />
          ) : vm.chart.hasNet || vm.chart.hasMargin ? (
            <TimeChart kind="bar-grouped" x={vm.chart.x} series={vm.chart.netVsSpend} height={240} formatValue={formatEurCompact} formatX={vm.chart.formatX} formatXLong={vm.chart.formatXLong} />
          ) : (
            <EmptyState title="Ni revenu ni dépense sur la période" />
          )}
        </Card>

        <Card title="Marge par mois" subtitle="Net − dépenses">
          {vm.loading ? (
            <Skeleton height={240} />
          ) : vm.chart.hasMargin ? (
            <TimeChart kind="bar" x={vm.chart.x} series={vm.chart.marginSeries} height={240} legend={false} formatValue={formatEurCompact} formatX={vm.chart.formatX} formatXLong={vm.chart.formatXLong} />
          ) : (
            <EmptyState title="Marge indisponible">Il faut les dépenses de ces mois (relevé bancaire ou saisie manuelle).</EmptyState>
          )}
        </Card>
      </div>

      <Card title="Compte de résultat mensuel" subtitle="Du brut payé par les clients à la marge, mois par mois" flush>
        {vm.loading ? <Skeleton height={220} /> : vm.pnl.rows.length ? <PnlTable columns={vm.pnl.columns} rows={vm.pnl.rows} total={vm.pnl.total} /> : <EmptyState title="Aucun mois sur la période" />}
      </Card>

      <Card title="Quelle app paie les coûts ?" subtitle={["Net de chaque app moins ses dépenses attribuées, coûts studio à part", vm.contribution?.note].filter(Boolean).join(" · ")} flush>
        {vm.contribution ? (
          vm.contribution.rows.length ? <ContributionTable rows={vm.contribution.rows} /> : <EmptyState title="Aucun revenu ni dépense par app sur la période" />
        ) : (
          <Skeleton height={160} />
        )}
      </Card>

      <SourceNote source={`Net : App Store Connect, rapports Sales · Dépenses : relevés importés, saisies et paiements UGC${vm.coverageNote ? ` · ${vm.coverageNote}` : ""}`} />
    </div>
  );
}
