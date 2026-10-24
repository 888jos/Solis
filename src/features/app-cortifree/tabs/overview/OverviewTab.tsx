import { Card, Segmented } from "@/ui";
import { Async, Bars, ChartCard, KpiRow, SectionTitle, Show } from "../../components/blocks";
import { useOverviewViewModel } from "./useOverviewViewModel";

export default function OverviewTab() {
  const vm = useOverviewViewModel();
  return (
    <>
      <SectionTitle>Acquisition & activité</SectionTitle>
      <KpiRow cell={vm.activity} count={6} />
      <SectionTitle>Monétisation</SectionTitle>
      <KpiRow cell={vm.money} count={6} />

      <div className="grid grid--2">
        <ChartCard title="Combien de personnes utilisent l'app ?" subtitle="Actifs et nouveaux par jour, uniques" cell={vm.usersChart} />
        <ChartCard title="Que font-elles ?" subtitle="Événements clés par jour" cell={vm.keyActivity} />
      </div>

      <div className="grid grid--2">
        <Card
          title="Événements les plus envoyés"
          subtitle={vm.top.state === "ready" && vm.top.data.kind === "data" ? vm.top.data.data.note : undefined}
          action={
            <Segmented
              label="Fenêtre"
              value={vm.topMode}
              onChange={vm.setTopMode}
              options={[
                { value: "week", label: "Semaine" },
                { value: "period", label: "Période" },
              ]}
            />
          }
        >
          <Async cell={vm.top} height={300}>
            {(d) => <Bars vm={d.bars} />}
          </Async>
        </Card>
        <Card title="D'où viennent les actifs, sur quelle version ?" subtitle="Utilisateurs actifs uniques par pays et par version de l'app">
          <Async cell={vm.geo} height={300}>
            {(g) => (
              <div className="cf-split">
                <div>
                  <p className="cf-mini-title">Pays</p>
                  <Show content={g.country}>{(b) => <Bars vm={b} />}</Show>
                </div>
                <div>
                  <p className="cf-mini-title">Version de l'app</p>
                  <Show content={g.version}>{(b) => <Bars vm={b} />}</Show>
                </div>
              </div>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
}
