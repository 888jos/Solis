import { BarList, Card, DataTable, EmptyState, Skeleton, TimeChart, type BarListItem, type Column } from "@/ui";
import { formatInt } from "@/lib/format";
import { KpiGrid } from "../components/KpiGrid";
import type { QuestirlSummary } from "../types";
import { useNotificationsViewModel, type CategoryRow } from "./useNotificationsViewModel";

const hide = (node: React.ReactNode) => <span className="qi-hide-sm">{node}</span>;
const n = (v: string) => <span className="num">{v}</span>;

const columns: Column<CategoryRow>[] = [
  { key: "name", header: "Catégorie", cell: (r) => <span className="qi-code">{r.name}</span> },
  { key: "scheduled", header: "Programmées", align: "right", cell: (r) => n(r.scheduled) },
  { key: "opened", header: "Ouvertes", align: "right", cell: (r) => n(r.opened) },
  { key: "rate", header: "Taux", align: "right", cell: (r) => <strong className="num">{r.openRate}</strong> },
  { key: "fg", header: hide("App ouverte"), align: "right", cell: (r) => hide(n(r.foreground)) },
  { key: "cancelled", header: hide("Annulées"), align: "right", cell: (r) => hide(n(r.cancelled)) },
  { key: "failures", header: hide("Échecs"), align: "right", cell: (r) => hide(n(r.failures)) },
  { key: "users", header: hide("Personnes"), align: "right", cell: (r) => hide(n(r.usersOpened)) },
  { key: "latest", header: hide("Dernière ouverture"), align: "right", cell: (r) => hide(n(r.latest)) },
];

function Bars({ items, empty }: { items: BarListItem[]; empty: string }) {
  return items.length ? <BarList items={items} formatValue={formatInt} limit={20} /> : <EmptyState title={empty} />;
}

export function NotificationsTab({ data, window }: { data: QuestirlSummary | null; window: { from: string; to: string } }) {
  const vm = useNotificationsViewModel(data, window);
  return (
    <>
      <KpiGrid items={vm?.kpis ?? null} />
      <KpiGrid items={vm?.kpis2 ?? null} />

      <div className="grid grid--2">
        <Card title="Combien de notifications partent, et combien sont ouvertes ?" subtitle="Events par jour, avant déduplication (une notif reprogrammée compte plusieurs fois)">
          {!vm ? <Skeleton height={220} /> : vm.hasVolume ? <TimeChart kind="bar-grouped" x={vm.x} series={vm.volumeSeries} height={220} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} /> : <EmptyState title="Aucune notification sur la période" />}
        </Card>
        <Card title="Que font les gens après avoir ouvert une notif ?" subtitle="Achats et quêtes validées dans les 2 h suivant l'ouverture, par jour">
          {!vm ? <Skeleton height={220} /> : vm.hasAssist ? <TimeChart kind="bar-grouped" x={vm.x} series={vm.assistSeries} height={220} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} /> : <EmptyState title="Aucune conversion après ouverture sur la période" />}
        </Card>
      </div>

      <Card title="Par catégorie" subtitle="Taux = ouvertes ÷ programmées" flush>
        {vm ? <DataTable columns={columns} rows={vm.categories} rowKey={(r) => r.key} empty={<EmptyState title="Aucune notification trackée" />} /> : <Skeleton height={180} />}
      </Card>

      <div className="grid grid--2">
        <Card title="Cycle de vie" subtitle="Tous les events de notification">
          {vm ? <Bars items={vm.lifecycle} empty="Aucune donnée" /> : <Skeleton height={120} />}
        </Card>
        <Card title="Variantes de texte" subtitle="Programmées + ouvertes, par copy_variant">
          {vm ? <Bars items={vm.copyVariants} empty="Aucune variante trackée" /> : <Skeleton height={120} />}
        </Card>
        <Card title="Relances d'onboarding ouvertes, par écran" subtitle="onboarding_rescue · écran où la personne s'était arrêtée">
          {vm ? <Bars items={vm.rescueByStep} empty="Aucune relance ouverte" /> : <Skeleton height={120} />}
        </Card>
        <Card title="Notifs de rétention ouvertes, par jour de programme" subtitle="Abonnés · program_day">
          {vm ? <Bars items={vm.retentionByDay} empty="Aucune notif de rétention ouverte" /> : <Skeleton height={120} />}
        </Card>
      </div>
    </>
  );
}
