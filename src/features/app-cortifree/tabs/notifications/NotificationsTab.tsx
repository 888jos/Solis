import { Card } from "@/ui";
import {
  Async,
  Bars,
  BreakdownGrid,
  ChartCard,
  KpiRow,
  TableCard,
} from "../../components/blocks";
import { useNotificationsViewModel } from "./useNotificationsViewModel";

export default function NotificationsTab() {
  const vm = useNotificationsViewModel();
  const permissionSub =
    vm.permission.state === "ready" && vm.permission.data.kind === "data"
      ? vm.permission.data.data.subtitle
      : "Utilisateurs actifs par propriété notification_permission";
  return (
    <>
      <KpiRow cell={vm.kpis} count={5} />
      <div className="grid grid--main-side">
        <ChartCard
          title="Les notifications arrivent-elles et sont-elles ouvertes ?"
          subtitle="Programmées, délivrées et ouvertes par jour"
          cell={vm.trend}
        />
        <Card title="Qui accepte les notifications ?" subtitle={permissionSub}>
          <Async cell={vm.permission} height={180}>
            {(b) => <Bars vm={b} />}
          </Async>
        </Card>
      </div>
      <TableCard
        title="Quel type de notification est ouvert ?"
        subtitle="notification_type · taux d'ouverture = ouvertes / délivrées (anciens événements notification_received / notification_clicked inclus)"
        cell={vm.byType}
      />
      <BreakdownGrid cell={vm.breakdowns} />
    </>
  );
}
