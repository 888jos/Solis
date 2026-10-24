import { BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, NotConnected, SourceNote, type Column } from "@/ui";
import { formatInt } from "@/lib/format";
import { FirestoreGate } from "../components/FirestoreGate";
import type { FirestoreData } from "../data/useFirestoreReport";
import { useNotificationsViewModel, type PushRow, type TypeRow } from "./useNotificationsViewModel";

const typeColumns: Column<TypeRow>[] = [
  { key: "type", header: "Type", cell: (r) => <span className="cr-mono">{r.type}</span> },
  { key: "scheduled", header: "Programmées", align: "right", cell: (r) => <span className="num">{r.scheduled}</span> },
  { key: "opened", header: "Ouvertes", align: "right", cell: (r) => <span className="num">{r.opened}</span> },
  { key: "rate", header: "Ouverture", align: "right", cell: (r) => <strong className="num">{r.openRate}</strong> },
  { key: "fg", header: <span className="cr-hide-sm">1er plan</span>, align: "right", cell: (r) => <span className="num cr-hide-sm">{r.foreground}</span> },
  { key: "done", header: <span className="cr-hide-sm">→ Onboarding</span>, align: "right", cell: (r) => <span className="num cr-hide-sm">{r.toCompleted}</span> },
  { key: "free", header: <span className="cr-hide-sm">→ Réveil</span>, align: "right", cell: (r) => <span className="num cr-hide-sm">{r.toFree}</span> },
  { key: "premium", header: "→ Premium", align: "right", cell: (r) => <span className="num">{r.toPremium}</span> },
  { key: "auth", header: <span className="cr-hide-sm">→ Compte</span>, align: "right", cell: (r) => <span className="num cr-hide-sm">{r.toAuth}</span> },
];

const pushColumns: Column<PushRow>[] = [
  { key: "name", header: "Message", cell: (r) => r.name },
  { key: "sent", header: "Envoyé", cell: (r) => <span className="num">{r.sent}</span> },
  { key: "delivered", header: "Reçus", align: "right", cell: (r) => <span className="num">{r.delivered}</span> },
  { key: "clicked", header: "Clics", align: "right", cell: (r) => <span className="num">{r.clicked}</span> },
  { key: "ctr", header: "Taux", align: "right", cell: (r) => <span className="num">{r.ctr}</span> },
];

export function NotificationsTab({ fs }: { fs: FirestoreData }) {
  const vm = useNotificationsViewModel(fs);
  return (
    <>
      <FirestoreGate gate={vm.gate}>
        {vm.kpis && (
          <div className="grid grid--kpi">
            {vm.kpis.map((k) => (
              <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} />
            ))}
          </div>
        )}
        <div className="grid grid--main-side">
          <Card title="Quelles notifs font revenir" subtitle="Par type · « → » = part des utilisateurs qui ont ouvert puis atteint l'étape" flush>
            {vm.types && <DataTable columns={typeColumns} rows={vm.types} rowKey={(r) => r.key} empty={<EmptyState title="Aucune notification trackée sur la période" />} />}
          </Card>
          <Card title="Campagnes les plus ouvertes" subtitle="Utilisateurs qui ont ouvert, par type · identifiant">
            {vm.campaigns && vm.campaigns.length ? <BarList items={vm.campaigns} formatValue={formatInt} /> : <EmptyState title="Aucune campagne ouverte" />}
          </Card>
        </div>
      </FirestoreGate>

      <h2 className="cr-section-title">Push OneSignal</h2>
      {vm.missingOs ? (
        <Card>
          <NotConnected source="OneSignal (Cocorise)" missing={vm.missingOs}>
            Clé REST de l'app OneSignal CocoRise (Settings &gt; Keys &amp; IDs), à définir avec npx convex env set (dev et --prod).
          </NotConnected>
        </Card>
      ) : vm.push ? (
        <>
          <div className="grid grid--kpi">
            {vm.push.kpis.map((k) => (
              <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} />
            ))}
          </div>
          <Card title="Messages push envoyés" subtitle="50 derniers messages OneSignal" flush>
            <DataTable columns={pushColumns} rows={vm.push.rows} rowKey={(r) => r.key} empty={<EmptyState title="Aucun message push envoyé depuis OneSignal" />} />
          </Card>
          <SourceNote source="OneSignal REST API (lecture seule)" updatedAt={vm.pushFetchedAt} />
        </>
      ) : vm.pushError ? (
        <Card>
          <EmptyState title="OneSignal n'a pas répondu">{vm.pushError}</EmptyState>
        </Card>
      ) : (
        <KpiSkeleton count={4} />
      )}
    </>
  );
}
