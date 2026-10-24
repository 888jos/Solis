import { Card, Delta, EmptyState, Segmented } from "@/ui";
import {
  Async,
  Chart,
  Select,
  SimpleTable,
  Tags,
} from "../../components/blocks";
import { useExplorerViewModel } from "./useExplorerViewModel";

export default function ExplorerTab() {
  const vm = useExplorerViewModel();
  return (
    <div className="cf-explorer">
      <Card
        title="Tous les événements"
        subtitle="Volume Amplitude de la semaine en cours"
      >
        <input
          className="input"
          type="search"
          style={{ width: "100%" }}
          placeholder={
            vm.list.state === "ready"
              ? `Rechercher parmi ${vm.list.data.count} événements…`
              : "Rechercher…"
          }
          value={vm.search}
          onChange={(e) => vm.setSearch(e.target.value)}
          aria-label="Rechercher un événement"
        />
        <div className="cf-evlist">
          {vm.list.state === "ready" ? (
            vm.list.data.groups.length ? (
              vm.list.data.groups.map((g) => (
                <div key={g.name}>
                  <div className="cf-evgroup">{g.name}</div>
                  {g.items.map((e) => (
                    <button
                      type="button"
                      key={e.name}
                      className="cf-evitem"
                      aria-current={e.active}
                      title={e.name}
                      onClick={() => vm.select(e.name)}
                    >
                      <span>{e.name}</span>
                      <span>{e.count}</span>
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <EmptyState title="Aucun événement ne correspond" />
            )
          ) : vm.list.state === "error" ? (
            <EmptyState title="Catalogue indisponible">
              {vm.list.message}
            </EmptyState>
          ) : (
            <p className="cf-note" style={{ padding: 8 }}>
              Chargement du catalogue…
            </p>
          )}
        </div>
      </Card>

      <div className="stack" style={{ gap: "var(--space-4)", minWidth: 0 }}>
        {!vm.event ? (
          <Card>
            <EmptyState title="Choisis un événement">
              Graphique quotidien, utilisateurs uniques et répartition par
              n'importe quelle propriété.
            </EmptyState>
          </Card>
        ) : (
          <>
            <Card
              title={vm.event}
              subtitle="Total et utilisateurs uniques par jour"
            >
              <Async cell={vm.detail} height={260}>
                {(d) => (
                  <div className="stack" style={{ gap: 10 }}>
                    <div
                      className="row"
                      style={{
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span className="cf-bignum">{d.total}</span>
                      <Delta value={d.delta} />
                      <Tags items={d.tags} />
                    </div>
                    <Chart vm={d.chart} />
                  </div>
                )}
              </Async>
            </Card>
            <Card
              title="Répartition par propriété"
              subtitle="Propriétés d'événement et propriétés utilisateur"
            >
              <div className="stack" style={{ gap: 14 }}>
                <div className="cf-controls">
                  {vm.propOptions.length > 0 && (
                    <Select
                      label="Propriété"
                      value={vm.propValue}
                      options={vm.propOptions}
                      onChange={vm.setProp}
                    />
                  )}
                  <Segmented
                    label="Mesure"
                    value={vm.metric}
                    onChange={vm.setMetric}
                    options={[
                      { value: "totals", label: "Total" },
                      { value: "uniques", label: "Utilisateurs" },
                    ]}
                  />
                </div>
                <Async cell={vm.breakdown} height={260}>
                  {(b) => (
                    <div className="stack" style={{ gap: 12 }}>
                      <Chart vm={b.chart} />
                      <SimpleTable vm={b.table} />
                    </div>
                  )}
                </Async>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
