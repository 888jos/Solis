import { BarList, Card, EmptyState, Skeleton, type BarListItem } from "@/ui";
import { formatInt } from "@/lib/format";
import { KpiGrid } from "../components/KpiGrid";
import type { QuestirlSummary } from "../types";
import { useAnswersViewModel } from "./useAnswersViewModel";

function Bars({ items, empty, limit = 20 }: { items: BarListItem[] | undefined; empty: string; limit?: number }) {
  if (!items) return <Skeleton height={160} />;
  return items.length ? <BarList items={items} formatValue={formatInt} limit={limit} /> : <EmptyState title={empty} />;
}

export function AnswersTab({ data }: { data: QuestirlSummary | null }) {
  const vm = useAnswersViewModel(data);
  return (
    <>
      <KpiGrid items={vm?.kpis ?? null} />
      <div className="grid grid--2">
        <Card title="D'où viennent les gens ?" subtitle="Réponse à la question heard_from">
          <Bars items={vm?.sources} empty="Aucune réponse sur la période" />
        </Card>
        <Card title="Quels héros ressortent ?" subtitle="dominant_hero ou archetype, tous events">
          <Bars items={vm?.heroes} empty="Aucun héros calculé sur la période" />
        </Card>
      </div>
      <div className="grid grid--main-side">
        <Card title="Réponses les plus choisies" subtitle="question · réponse, 60 premières">
          <Bars items={vm?.answers} empty="Aucune réponse sur la période" limit={60} />
        </Card>
        <Card title="Questions les plus répondues" subtitle="question_id">
          <Bars items={vm?.questions} empty="Aucune question répondue" limit={40} />
        </Card>
      </div>
    </>
  );
}
