import { BarList, Card, DataTable, EmptyState, Skeleton, type Column } from "@/ui";
import { Funnel } from "../components/Funnel";
import { KpiGrid } from "../components/KpiGrid";
import { formatSeconds } from "../format";
import type { QuestirlSummary } from "../types";
import { useOnboardingViewModel, type FrictionRow } from "./useOnboardingViewModel";

const hide = (node: React.ReactNode) => <span className="qi-hide-sm">{node}</span>;
const n = (v: string) => <span className="num">{v}</span>;

const columns: Column<FrictionRow>[] = [
  { key: "index", header: hide("#"), cell: (r) => hide(n(r.index)), width: 36 },
  { key: "step", header: "Écran", cell: (r) => <span className="qi-code">{r.step}</span> },
  { key: "attempts", header: "Tentatives", align: "right", cell: (r) => n(r.attempts) },
  { key: "completion", header: hide("Validé"), align: "right", cell: (r) => hide(n(r.completion)) },
  { key: "next", header: hide("Vers suivant"), align: "right", cell: (r) => hide(n(r.next)) },
  { key: "continue", header: "Continuent", align: "right", cell: (r) => n(r.continueRate) },
  { key: "dropoff", header: "Perdus", align: "right", cell: (r) => (r.dropoffValue > 0 ? <strong className="num">{r.dropoff}</strong> : n(r.dropoff)) },
  { key: "median", header: hide("Médiane"), align: "right", cell: (r) => hide(n(r.median)) },
  { key: "p90", header: hide("P90"), align: "right", cell: (r) => hide(n(r.p90)) },
  { key: "exits", header: hide("Sorties (arr.-plan)"), align: "right", cell: (r) => hide(n(r.exits)) },
];

export function OnboardingTab({ data }: { data: QuestirlSummary | null }) {
  const vm = useOnboardingViewModel(data);
  return (
    <>
      <KpiGrid items={vm?.kpis ?? null} />
      <KpiGrid items={vm?.kpis2 ?? null} />

      <div className="grid grid--main-side">
        <Card title="Où les tentatives d'onboarding décrochent-elles ?" subtitle={`Une tentative = un onboarding_attempt_id · % sous chaque nombre = part des démarrages${vm?.legacy ? " · ancien schéma (fallback)" : ""}`}>
          {!vm ? <Skeleton height={260} /> : vm.hasFunnel ? <Funnel steps={vm.funnel} /> : <EmptyState title="Aucun onboarding démarré sur la période" />}
        </Card>
        <Card title="Écrans les plus lents" subtitle="Durée médiane passée sur l'écran">
          {!vm ? <Skeleton height={260} /> : vm.slowest.length ? <BarList items={vm.slowest} formatValue={formatSeconds} limit={14} /> : <EmptyState title="Pas encore de durées mesurées" />}
        </Card>
      </div>

      <Card title="Friction par écran" subtitle="Par tentative, dans l'ordre du flow · Perdus = tentatives qui n'ont pas vu l'écran suivant" flush>
        {vm ? <DataTable columns={columns} rows={vm.friction} rowKey={(r) => r.key} empty={<EmptyState title="Aucune donnée d'onboarding" />} /> : <Skeleton height={240} />}
      </Card>
    </>
  );
}
