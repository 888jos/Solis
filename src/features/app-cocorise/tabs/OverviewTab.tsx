import { AlertTriangle } from "lucide-react";
import { Card, EmptyState, Kpi, KpiSkeleton, TimeChart } from "@/ui";
import { formatInt } from "@/lib/format";
import { FirestoreGate } from "../components/FirestoreGate";
import { Funnel } from "../components/Funnel";
import type { FirestoreData } from "../data/useFirestoreReport";
import { useOverviewViewModel } from "./useOverviewViewModel";

export function OverviewTab({ fs }: { fs: FirestoreData }) {
  const vm = useOverviewViewModel(fs);
  return (
    <>
      {vm.silence && (
        <div className="cr-banner" role="note">
          <AlertTriangle size={14} aria-hidden />
          <span>{vm.silence}</span>
        </div>
      )}

      <FirestoreGate gate={vm.gate}>
        {vm.kpis && (
          <div className="grid grid--kpi">
            {vm.kpis.map((k) => (
              <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} hint={k.hint} />
            ))}
          </div>
        )}
        <div className="grid grid--main-side">
          <Card title="Où l'onboarding perd du monde" subtitle="Étapes clés, utilisateurs distincts">
            {vm.funnel && <Funnel steps={vm.funnel} />}
          </Card>
          <Card title="Départs et fins d'onboarding" subtitle={vm.rangeLabel ? `Par jour · ${vm.rangeLabel}` : "Par jour"}>
            {vm.trend && vm.trend.hasData ? (
              <TimeChart kind="bar-grouped" x={vm.trend.x} series={vm.trend.series} height={240} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} />
            ) : (
              <EmptyState title="Aucun onboarding démarré" />
            )}
          </Card>
        </div>
      </FirestoreGate>

      <h2 className="cr-section-title">App Store sur la période</h2>
      {vm.storeKpis ? (
        <div className="grid grid--kpi">
          {vm.storeKpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} />
          ))}
        </div>
      ) : (
        <KpiSkeleton count={4} />
      )}
    </>
  );
}
