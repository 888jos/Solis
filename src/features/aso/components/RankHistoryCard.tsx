import { Card, EmptyState, Skeleton, TimeChart } from "@/ui";
import type { AsoViewModel } from "../useAsoViewModel";

export function RankHistoryCard({ chart }: { chart: AsoViewModel["chart"] }) {
  if (!chart) {
    return (
      <Card title="Comment évolue le rang ?">
        <EmptyState title="Aucun mot-clé sélectionné" />
      </Card>
    );
  }
  if (chart.loading) {
    return (
      <Card title="Comment évolue le rang ?">
        <Skeleton height={240} />
      </Card>
    );
  }
  const title = (
    <>
      Comment évolue « {chart.title} » ? <span className="muted">· {chart.country}</span>
    </>
  );
  if (chart.empty) {
    return (
      <Card title={title}>
        <EmptyState title="Pas encore mesuré sur la période">La prochaine mesure quotidienne ajoutera un point.</EmptyState>
      </Card>
    );
  }
  return (
    <Card title={title} subtitle={chart.topCompetitor ? `1er résultat aujourd'hui : ${chart.topCompetitor}` : "Plus haut = mieux classé"}>
      <div className="stack">
        <div className="aso-facts">
          {chart.facts.map((f) => (
            <div key={f.label}>
              <span className="muted">{f.label}</span>
              <strong className="num">{f.value}</strong>
            </div>
          ))}
        </div>
        {chart.drawable ? (
          <TimeChart x={chart.x} series={chart.series} invertY legend={false} height={220} formatValue={chart.formatValue} formatX={chart.formatX} formatXLong={chart.formatXLong} />
        ) : (
          <EmptyState title="Pas encore de courbe">{chart.notDrawable}</EmptyState>
        )}
      </div>
    </Card>
  );
}
