import { Card } from "@/ui";
import {
  Async,
  BreakdownGrid,
  Chart,
  ChartCard,
  KpiRow,
  SectionTitle,
  SimpleTable,
  Tags,
} from "../../components/blocks";
import { useEngagementViewModel } from "./useEngagementViewModel";

export default function EngagementTab() {
  const vm = useEngagementViewModel();
  return (
    <>
      <KpiRow cell={vm.kpis} count={9} />

      <Async cell={vm.retention} height={280}>
        {(r) => (
          <div className="grid grid--2">
            <Card
              title="Les nouveaux reviennent-ils ?"
              subtitle="Nouveaux utilisateurs de la période revenus (tout événement actif) au jour N"
            >
              <Chart vm={r.chart} />
            </Card>
            <Card
              title="Rétention par cohorte"
              subtitle="% de la cohorte du jour revenue au jour N (14 premiers jours)"
              flush
            >
              <div className="table-wrap">
                <table className="table cf-cohort">
                  <thead>
                    <tr>
                      <th>Cohorte</th>
                      <th className="r">Taille</th>
                      {r.heads.map((h) => (
                        <th key={h} className="r">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.cohorts.map((c) => (
                      <tr key={c.key}>
                        <td>{c.label}</td>
                        <td className="r num">{c.size}</td>
                        {c.cells.map((cell, i) => (
                          <td key={i}>
                            {cell && (
                              <span
                                className="cf-heat"
                                style={{
                                  background: `color-mix(in srgb, var(--series-1) ${cell.strength}%, transparent)`,
                                }}
                              >
                                {cell.text}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </Async>

      <div className="grid grid--2">
        <ChartCard
          title="Usage quotidien"
          subtitle="Événements d'engagement par jour"
          cell={vm.usage}
          height={280}
        />
        <ChartCard
          title="Combien de sessions par personne ?"
          subtitle="session_start : total / utilisateurs uniques, par jour"
          cell={vm.spu}
          height={280}
        />
      </div>

      <SectionTitle>Milo & contenus</SectionTitle>
      <BreakdownGrid cell={vm.breakdowns} />

      <Card
        title="Quels contenus plaisent ?"
        subtitle="Note de fin de séance 0 (pas ouf) à 5 (très bien), session_rated par contenu"
        flush
      >
        <Async cell={vm.ratings} height={200}>
          {(r) => (
            <div className="stack" style={{ gap: 10 }}>
              <div style={{ padding: "var(--space-3) var(--space-5) 0" }}>
                <Tags items={r.types} />
              </div>
              <SimpleTable vm={r.table} />
            </div>
          )}
        </Async>
      </Card>
    </>
  );
}
