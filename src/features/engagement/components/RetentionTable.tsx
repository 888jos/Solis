import { EmptyState } from "@/ui";
import type { CohortRow, RetentionCell } from "../useEngagementViewModel";

function Heat({ cell }: { cell: RetentionCell }) {
  const shade = cell.step == null ? "none" : cell.zero ? "zero" : String(cell.step);
  const cls = `eg-heat eg-heat--${shade}${cell.partial && cell.step != null ? " eg-heat--partial" : ""}`;
  return (
    <span className={cls} title={cell.title}>
      {cell.label}
    </span>
  );
}

/** Weekly acquisition cohorts with the share of users active again on day 1, 7 and 30. */
export function RetentionTable({ rows }: { rows: CohortRow[] }) {
  if (!rows.length) return <EmptyState title="Aucune cohorte sur la période" />;
  return (
    <div className="table-wrap">
      <table className="table eg-ret">
        <thead>
          <tr>
            <th>Semaine</th>
            <th className="r">Nouveaux</th>
            <th className="r eg-ret__day">J1</th>
            <th className="r eg-ret__day">J7</th>
            <th className="r eg-ret__day">J30</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="eg-ret__week">{r.week}</td>
              <td className="r">{r.size}</td>
              <td className="eg-ret__cell">
                <Heat cell={r.d1} />
              </td>
              <td className="eg-ret__cell">
                <Heat cell={r.d7} />
              </td>
              <td className="eg-ret__cell">
                <Heat cell={r.d30} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeatLegend() {
  return (
    <div className="eg-legend">
      <span>faible</span>
      <span className="eg-legend__ramp" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} style={{ background: `var(--heat-${i})` }} />
        ))}
      </span>
      <span>élevée</span>
      <span aria-hidden>·</span>
      <span>hachuré : cohorte pas encore complète</span>
    </div>
  );
}
