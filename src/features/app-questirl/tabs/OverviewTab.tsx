import { Card, DataTable, EmptyState, Skeleton, TimeChart, type Column } from "@/ui";
import { formatInt } from "@/lib/format";
import { KpiGrid } from "../components/KpiGrid";
import type { QuestirlSummary } from "../types";
import { useOverviewViewModel, type DailyTableRow } from "./useOverviewViewModel";

const hide = (node: React.ReactNode) => <span className="qi-hide-sm">{node}</span>;
const n = (v: string) => <span className="num">{v}</span>;

const columns: Column<DailyTableRow>[] = [
  { key: "date", header: "Jour", cell: (r) => n(r.date) },
  { key: "au", header: "Actifs", align: "right", cell: (r) => n(r.activeUsers) },
  { key: "started", header: "Démarrages", align: "right", cell: (r) => n(r.started) },
  { key: "completed", header: "Terminés", align: "right", cell: (r) => n(r.completed) },
  { key: "paywall", header: hide("Paywall"), align: "right", cell: (r) => hide(n(r.paywall)) },
  { key: "purchases", header: "Achats", align: "right", cell: (r) => n(r.purchases) },
  { key: "notifOpens", header: hide("Notifs ouvertes"), align: "right", cell: (r) => hide(n(r.notifOpens)) },
  { key: "notifPurchases", header: hide("Achats après notif"), align: "right", cell: (r) => hide(n(r.notifPurchases)) },
  { key: "notifQuests", header: hide("Quêtes après notif"), align: "right", cell: (r) => hide(n(r.notifQuests)) },
  { key: "quests", header: "Quêtes", align: "right", cell: (r) => n(r.quests) },
];

export function OverviewTab({ data, window }: { data: QuestirlSummary | null; window: { from: string; to: string } }) {
  const vm = useOverviewViewModel(data, window);
  return (
    <>
      <KpiGrid items={vm?.kpis ?? null} />
      <KpiGrid items={vm?.kpis2 ?? null} />

      <div className="qi-health">
        {(vm?.health ?? [0, 1, 2].map((i) => ({ key: String(i), label: "", value: "", foot: "" }))).map((h) => (
          <div className="card qi-health__item" key={h.key}>
            {vm ? (
              <>
                <span className="qi-health__label">{h.label}</span>
                <span className="qi-health__value">{h.value}</span>
                {h.foot && <span className="qi-health__foot">{h.foot}</span>}
              </>
            ) : (
              <Skeleton height={48} />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid--2">
        <Card title="Combien de personnes utilisent l'app chaque jour ?" subtitle="Utilisateurs distincts par jour">
          {!vm ? <Skeleton height={220} /> : vm.hasActivity ? <TimeChart kind="area" x={vm.chartX} series={vm.activeSeries} height={220} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} /> : <EmptyState title="Aucun event sur la période" />}
        </Card>
        <Card title="Démarrages, onboardings terminés et achats" subtitle="Events par jour">
          {!vm ? <Skeleton height={220} /> : vm.hasConversion ? <TimeChart x={vm.chartX} series={vm.conversionSeries} height={220} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} /> : <EmptyState title="Aucun onboarding sur la période" />}
        </Card>
      </div>

      <Card title="Activité quotidienne" subtitle="Achats après notif = achat dans les 2 h suivant l'ouverture d'une notification" flush>
        {vm ? <DataTable columns={columns} rows={vm.dailyRows} rowKey={(r) => r.key} /> : <Skeleton height={200} />}
      </Card>
    </>
  );
}
