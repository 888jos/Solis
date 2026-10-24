import {
  BreakdownGrid,
  ChartCard,
  KpiRow,
  TableCard,
} from "../../components/blocks";
import { useExercisesViewModel } from "./useExercisesViewModel";

export default function ExercisesTab() {
  const vm = useExercisesViewModel();
  return (
    <>
      <KpiRow cell={vm.kpis} count={3} />
      <div className="grid grid--2">
        <TableCard
          title="Ceux qui pratiquent convertissent-ils plus ?"
          subtitle="Pour chaque issue de l'essai : exercices faits avant (exercises_bucket envoyé avec l'événement), utilisateurs uniques"
          cell={vm.outcomes}
        />
        <TableCard
          title="Conversion selon l'usage"
          subtitle="Propriété utilisateur exercises_bucket (valeur actuelle) · essai démarré → converti"
          cell={vm.segment}
        />
      </div>
      <ChartCard
        title="Exercices terminés par jour"
        subtitle="exercise_completed par catégorie"
        cell={vm.trend}
      />
      <BreakdownGrid cell={vm.breakdowns} columns={2} />
    </>
  );
}
