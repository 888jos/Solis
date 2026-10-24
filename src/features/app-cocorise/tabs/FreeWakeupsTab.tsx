import { Badge, Card, DataTable, EmptyState, Kpi, type Column } from "@/ui";
import { FirestoreGate } from "../components/FirestoreGate";
import { Funnel } from "../components/Funnel";
import type { FirestoreData } from "../data/useFirestoreReport";
import { useFreeWakeupsViewModel, type FreeUserRow } from "./useFreeWakeupsViewModel";

const columns: Column<FreeUserRow>[] = [
  { key: "user", header: "Utilisateur", cell: (r) => <span className="cr-mono" title={r.key}>{r.user}</span> },
  { key: "limit", header: "Quota", align: "right", cell: (r) => <span className="num">{r.limit}</span> },
  { key: "done", header: "Faits", align: "right", cell: (r) => <span className="num">{r.done}</span> },
  { key: "left", header: "Restants", align: "right", cell: (r) => <span className="num">{r.left}</span> },
  { key: "premium", header: "Premium", cell: (r) => (r.premium ? <Badge status="good">Oui</Badge> : <span className="muted">Non</span>) },
  { key: "reco", header: <span className="cr-hide-sm">Reconnecté</span>, cell: (r) => <span className="cr-hide-sm">{r.reconnected ? "Oui" : <span className="muted">Non</span>}</span> },
  { key: "provider", header: <span className="cr-hide-sm">Compte</span>, cell: (r) => <span className="cr-hide-sm">{r.provider}</span> },
  { key: "seen", header: <span className="cr-hide-sm">Vu</span>, align: "right", cell: (r) => <span className="cr-hide-sm muted" title={r.lastSeenTitle}>{r.lastSeen}</span> },
];

export function FreeWakeupsTab({ fs }: { fs: FirestoreData }) {
  const vm = useFreeWakeupsViewModel(fs);
  return (
    <FirestoreGate gate={vm.gate}>
      {vm.kpis && (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} />
          ))}
        </div>
      )}
      <Card title="Du soft paywall au premium" subtitle="Parcours des réveils gratuits, utilisateurs distincts">
        {vm.funnel && <Funnel steps={vm.funnel} />}
      </Card>
      <Card title="Réveils gratuits par utilisateur" subtitle={vm.usersNote ?? undefined} flush>
        {vm.users && <DataTable columns={columns} rows={vm.users} rowKey={(r) => r.key} empty={<EmptyState title="Aucun utilisateur dans le flow réveils gratuits sur la période" />} />}
      </Card>
    </FirestoreGate>
  );
}
