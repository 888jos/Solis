import { BarList, Card, DataTable, EmptyState, Kpi, type Column } from "@/ui";
import { formatInt } from "@/lib/format";
import { FirestoreGate } from "../components/FirestoreGate";
import type { FirestoreData } from "../data/useFirestoreReport";
import { useOnboardingViewModel, type DayRow, type StepRow } from "./useOnboardingViewModel";

const stepColumns: Column<StepRow>[] = [
  {
    key: "step",
    header: "Écran",
    cell: (r) => (
      <span className="cr-step">
        <span>{r.key2 ? <strong>{r.label}</strong> : r.label}</span>
        <small className="cr-mono">{r.id}</small>
      </span>
    ),
  },
  { key: "users", header: "Utilisateurs", align: "right", cell: (r) => <span className="num">{r.users}</span> },
  { key: "prev", header: "Vs écran préc.", align: "right", cell: (r) => <span className="num">{r.fromPrev}</span> },
  {
    key: "share",
    header: <span className="cr-hide-sm">Part des démarrés</span>,
    align: "right",
    cell: (r) => (
      <span className="cr-cellbar cr-hide-sm">
        <span className="cr-cellbar__track">
          <span className="cr-cellbar__fill" style={{ width: `${r.shareValue * 100}%` }} />
        </span>
        <span className="num">{r.share}</span>
      </span>
    ),
  },
];

const dayColumns: Column<DayRow>[] = [
  { key: "day", header: "Jour", cell: (r) => <span className="num">{r.day}</span> },
  { key: "started", header: "Démarrés", align: "right", cell: (r) => <span className="num">{r.started}</span> },
  { key: "completed", header: "Terminés", align: "right", cell: (r) => <span className="num">{r.completed}</span> },
  { key: "rate", header: "Complétion", align: "right", cell: (r) => <span className="num">{r.rate}</span> },
];

export function OnboardingTab({ fs }: { fs: FirestoreData }) {
  const vm = useOnboardingViewModel(fs);
  return (
    <FirestoreGate gate={vm.gate}>
      {vm.kpis && (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} />
          ))}
        </div>
      )}
      <div className="grid grid--main-side">
        <Card title="Chaque écran de l'onboarding" subtitle="Utilisateurs distincts par écran, dans l'ordre de l'app · étapes clés en gras" flush>
          {vm.steps && <DataTable columns={stepColumns} rows={vm.steps} rowKey={(r) => r.key} />}
        </Card>
        <div className="stack">
          <Card title="D'où ils disent venir" subtitle={`Écran « Où nous as-tu connus ? » · ${formatInt(vm.sourcesTotal)} réponses`}>
            {vm.sources && vm.sourcesTotal > 0 ? <BarList items={vm.sources} formatValue={formatInt} /> : <EmptyState title="Aucune réponse sur la période" />}
          </Card>
          <Card title="Par jour" subtitle="Démarrés et terminés (jour de Paris)" flush>
            {vm.days && <DataTable columns={dayColumns} rows={vm.days} rowKey={(r) => r.key} maxRows={60} empty={<EmptyState title="Aucun onboarding démarré" />} />}
          </Card>
        </div>
      </div>
    </FirestoreGate>
  );
}
