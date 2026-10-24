import { Card, DataTable, EmptyState, Segmented, Skeleton, type Column } from "@/ui";
import { KpiGrid } from "../components/KpiGrid";
import type { QuestirlSummary } from "../types";
import { useConversionViewModel, type Dimension, type SegmentTableRow } from "./useConversionViewModel";

const hide = (node: React.ReactNode) => <span className="qi-hide-sm">{node}</span>;
const n = (v: string) => <span className="num">{v}</span>;

const columns: Column<SegmentTableRow>[] = [
  { key: "name", header: "Segment", cell: (r) => <span className="qi-code">{r.name}</span> },
  { key: "started", header: "Démarrages", align: "right", cell: (r) => n(r.started) },
  { key: "paywall", header: "Paywall", align: "right", cell: (r) => n(r.paywall) },
  { key: "converted", header: hide("Essai / achat"), align: "right", cell: (r) => hide(n(r.converted)) },
  { key: "completed", header: hide("Terminés"), align: "right", cell: (r) => hide(n(r.completed)) },
  { key: "cvr", header: "Conversion", align: "right", cell: (r) => <strong className="num">{r.cvr}</strong> },
];

export function ConversionTab({ data }: { data: QuestirlSummary | null }) {
  const vm = useConversionViewModel(data);
  return (
    <>
      <KpiGrid items={vm.kpis ?? null} />
      <Card
        title="Quels segments convertissent ?"
        subtitle="Par tentative d'onboarding · conversion = essai ou achat ÷ démarrages"
        flush
      >
        <div className="qi-toolbar">
          <Segmented<Dimension> label="Segment" value={vm.dimension} onChange={vm.setDimension} options={vm.dimensions} />
        </div>
        {vm.rows ? <DataTable columns={columns} rows={vm.rows} rowKey={(r) => r.key} empty={<EmptyState title="Aucune tentative sur la période" />} /> : <Skeleton height={220} />}
      </Card>
    </>
  );
}
