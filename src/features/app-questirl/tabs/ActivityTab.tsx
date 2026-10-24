import { BarList, Card, DataTable, EmptyState, Skeleton, type Column } from "@/ui";
import { formatInt } from "@/lib/format";
import { KpiGrid } from "../components/KpiGrid";
import type { QuestirlSummary } from "../types";
import { useActivityViewModel, type RecentRow } from "./useActivityViewModel";

const hide = (node: React.ReactNode) => <span className="qi-hide-sm">{node}</span>;

const columns: Column<RecentRow>[] = [
  { key: "time", header: "Quand", cell: (r) => <span className="num">{r.time}</span>, width: 120 },
  { key: "user", header: hide("Utilisateur"), cell: (r) => hide(<span className="qi-code">{r.user}</span>) },
  { key: "event", header: "Event", cell: (r) => (
    <span>
      <span className="qi-code">{r.event}</span>
      {r.page && <span className="qi-cell-sub">{r.page}</span>}
    </span>
  ) },
  { key: "props", header: hide("Propriétés"), cell: (r) => hide(<span className="qi-props" title={r.props}>{r.props}</span>) },
];

export function ActivityTab({ data }: { data: QuestirlSummary | null }) {
  const vm = useActivityViewModel(data);
  return (
    <>
      <KpiGrid items={vm?.kpis ?? null} />
      <div className="grid grid--2">
        <Card title="Quels écrans sont vus ?" subtitle="Propriété page, screen ou step_id, tous events">
          {!vm ? <Skeleton height={200} /> : vm.pages.length ? <BarList items={vm.pages} formatValue={formatInt} limit={20} /> : <EmptyState title="Aucune page vue" />}
        </Card>
        <Card title="Quels events sont envoyés ?" subtitle="Nombre d'events par nom">
          {!vm ? <Skeleton height={200} /> : vm.events.length ? <BarList items={vm.events} formatValue={formatInt} limit={20} /> : <EmptyState title="Aucun event" />}
        </Card>
      </div>
      <Card title="Derniers events" subtitle="80 derniers events de la période, propriétés propres à l'app (sans les $ PostHog)" flush>
        {vm ? <DataTable columns={columns} rows={vm.recent} rowKey={(r) => r.key} empty={<EmptyState title="Aucun event sur la période" />} /> : <Skeleton height={240} />}
      </Card>
    </>
  );
}
