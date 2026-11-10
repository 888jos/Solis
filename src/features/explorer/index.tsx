import { Download } from "lucide-react";
import { Card, Delta, EmptyState, PageHeader, Segmented, Skeleton, TimeChart } from "@/ui";
import { useExplorerViewModel } from "./useExplorerViewModel";
import "./explorer.css";

export default function ExplorerPage() {
  const vm = useExplorerViewModel();

  return (
    <div className="f-explorer">
      <PageHeader title="Graphiques" subtitle={vm.subtitle} />
      <div className="ex-layout">
        <aside className="ex-metrics" aria-label="Indicateurs">
          <select className="select ex-metrics__select" value={vm.groups.flatMap((g) => g.items).find((i) => i.active)?.key ?? ""} onChange={(e) => vm.onMetric(e.target.value)} aria-label="Indicateur">
            {vm.groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {vm.groups.map((g) => (
            <div key={g.group} className="ex-metrics__group">
              <div className="nav-section__label">{g.group}</div>
              {g.items.map((i) => (
                <button key={i.key} type="button" className={`ex-metric${i.active ? " ex-metric--active" : ""}`} onClick={() => vm.onMetric(i.key)} title={i.description} aria-pressed={i.active}>
                  {i.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <div className="ex-main">
          <Card>
            <div className="ex-head">
              <div>
                <h2 className="ex-title">{vm.title}</h2>
                <p className="ex-desc">{vm.description}</p>
              </div>
              {!vm.loading && (
                <div className="ex-summary">
                  <div className="ex-summary__value num">{vm.value}</div>
                  <div className="ex-summary__foot">
                    <Delta value={vm.delta} />
                    <span>
                      {vm.unitLabel} · {vm.previousLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="ex-toolbar">
              <Segmented label="Résolution" value={vm.resolution} onChange={vm.onResolution} options={vm.resolutions} />
              <label className="ex-field">
                <span>Découper par</span>
                <select className="select" value={vm.segment} onChange={(e) => vm.onSegment(e.target.value)}>
                  {vm.segments.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <Segmented label="Type de graphique" value={vm.type} onChange={vm.onType} options={vm.types} />
              <button type="button" className={`btn${vm.compare ? " btn--on" : ""}`} aria-pressed={vm.compare} onClick={vm.onCompare}>
                Période préc.
              </button>
              {vm.canCumulate && (
                <button type="button" className={`btn${vm.cumulative ? " btn--on" : ""}`} aria-pressed={vm.cumulative} onClick={vm.onCumulative}>
                  Cumulé
                </button>
              )}
              {!vm.loading && (
                <button type="button" className="btn btn--ghost ex-export" onClick={vm.onExport}>
                  <Download /> CSV
                </button>
              )}
            </div>

            {vm.loading ? (
              <Skeleton height={360} />
            ) : vm.hasData ? (
              <TimeChart
                kind={vm.type}
                x={vm.chart.x}
                series={vm.chart.series}
                overlay={vm.chart.overlay}
                height={360}
                formatValue={vm.chart.formatValue}
                formatX={vm.chart.formatX}
                formatXLong={vm.chart.formatXLong}
                showTotal={vm.chart.showTotal}
              />
            ) : (
              <EmptyState title="Pas de données pour cet indicateur sur la période">La source n'est peut-être pas encore branchée : voir la page Sources.</EmptyState>
            )}
          </Card>

          {!vm.loading && vm.hasData && (
            <Card title="Détail" flush>
              <div className="ex-table-wrap">
                <table className="table ex-table">
                  <thead>
                    <tr>
                      <th>Période</th>
                      {vm.table.columns.map((c) => (
                        <th key={c} className="num">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vm.table.rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        {r.cells.map((c, i) => (
                          <td key={i} className="num">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
