import { BarList, Card, EmptyState } from "@/ui";
import { formatInt } from "@/lib/format";
import { FirestoreGate } from "../components/FirestoreGate";
import type { FirestoreData } from "../data/useFirestoreReport";
import { useEventsViewModel } from "./useEventsViewModel";

export function EventsTab({ fs }: { fs: FirestoreData }) {
  const vm = useEventsViewModel(fs);
  return (
    <FirestoreGate gate={vm.gate}>
      <div className="grid grid--2">
        <Card title="Boutons les plus tapés" subtitle={vm.buttonsSubtitle}>
          {vm.buttons && vm.buttons.length ? <BarList items={vm.buttons} formatValue={formatInt} /> : <EmptyState title="Aucun tap tracké" />}
        </Card>
        <Card title="Ce que l'app envoie" subtitle={vm.eventsSubtitle}>
          {vm.events && vm.events.length ? <BarList items={vm.events} formatValue={formatInt} /> : <EmptyState title="Aucun événement" />}
        </Card>
      </div>
    </FirestoreGate>
  );
}
