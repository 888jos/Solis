import {
  BreakdownGrid,
  ChartCard,
  KpiRow,
  TableCard,
} from "../../components/blocks";
import { useCheckinViewModel } from "./useCheckinViewModel";

export default function CheckinTab() {
  const vm = useCheckinViewModel();
  return (
    <>
      <KpiRow cell={vm.kpis} count={5} />
      <div className="grid grid--main-side">
        <ChartCard
          title="Combien voient et terminent le check-in ?"
          subtitle="Utilisateurs uniques par jour qui le voient, le terminent ou le passent"
          cell={vm.trend}
        />
        <TableCard
          title="Comment vont-ils ?"
          subtitle="Moyennes des réponses sur les check-ins terminés"
          cell={vm.averages}
        />
      </div>
      <BreakdownGrid cell={vm.breakdowns} />
    </>
  );
}
