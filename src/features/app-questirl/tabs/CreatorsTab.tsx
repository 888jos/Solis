import { Card, DataTable, EmptyState, Skeleton, type Column } from "@/ui";
import { KpiGrid } from "../components/KpiGrid";
import type { QuestirlSummary } from "../types";
import { useCreatorsViewModel, type CreatorRow } from "./useCreatorsViewModel";

const hide = (node: React.ReactNode) => <span className="qi-hide-sm">{node}</span>;
const n = (v: string) => <span className="num">{v}</span>;

const columns: Column<CreatorRow>[] = [
  {
    key: "code",
    header: "Code",
    cell: (r) => (
      <span>
        <span className="qi-code">{r.code}</span>
        {r.raw && <span className="qi-cell-sub">saisi : {r.raw}</span>}
      </span>
    ),
  },
  { key: "submitted", header: "Saisi", align: "right", cell: (r) => n(r.submitted) },
  { key: "completed", header: hide("Terminés"), align: "right", cell: (r) => hide(n(r.completed)) },
  { key: "paywall", header: hide("Paywall"), align: "right", cell: (r) => hide(n(r.paywall)) },
  { key: "buyers", header: "Acheteurs", align: "right", cell: (r) => (r.buyersValue > 0 ? <strong className="num">{r.buyers}</strong> : n(r.buyers)) },
  { key: "purchases", header: hide("Achats"), align: "right", cell: (r) => hide(n(r.purchases)) },
  { key: "revenue", header: hide("Valeur"), align: "right", cell: (r) => hide(n(r.revenue)) },
  { key: "cvr", header: "Conv.", align: "right", cell: (r) => n(r.cvr) },
  { key: "latest", header: hide("Dernier event"), align: "right", cell: (r) => hide(n(r.latest)) },
];

export function CreatorsTab({ data }: { data: QuestirlSummary | null }) {
  const vm = useCreatorsViewModel(data);
  return (
    <>
      <KpiGrid items={vm?.kpis ?? null} />
      <Card title="Quels codes créateurs ramènent des acheteurs ?" subtitle="Conversion = acheteurs ÷ personnes ayant saisi le code · 50 codes max" flush>
        {vm ? <DataTable columns={columns} rows={vm.table} rowKey={(r) => r.key} empty={<EmptyState title="Aucun code créateur saisi sur la période" />} /> : <Skeleton height={220} />}
      </Card>
    </>
  );
}
