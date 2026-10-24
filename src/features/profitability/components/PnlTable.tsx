import type { PnlCell, PnlColumn, PnlRow } from "../useProfitabilityViewModel";

function Cell({ cell, col }: { cell: PnlCell | undefined; col: PnlColumn }) {
  const cls = ["r", "num", cell?.muted ? "pf-muted" : "", cell?.strong ? "pf-strong" : "", col.hideSm ? "pf-hide-sm" : "", col.key === "net" || col.key === "margin" ? "pf-sep" : ""].filter(Boolean).join(" ");
  return (
    <td className={cls} title={cell?.title}>
      {cell?.text ?? "—"}
    </td>
  );
}

/** Monthly P&L: one row per month (newest first), revenue → expenses → result, with a total row. */
export function PnlTable({ columns, rows, total }: { columns: PnlColumn[]; rows: PnlRow[]; total: PnlRow | null }) {
  return (
    <div className="table-wrap pf-pnl">
      <table className="table">
        <thead>
          <tr>
            <th className="pf-sticky">Mois</th>
            {columns.map((c) => (
              <th key={c.key} className={["r", c.hideSm ? "pf-hide-sm" : "", c.key === "net" || c.key === "margin" ? "pf-sep" : ""].filter(Boolean).join(" ")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="pf-sticky">
                <span className="pf-month">
                  {row.label}
                  {row.note && <small>{row.note}</small>}
                </span>
              </td>
              {columns.map((c) => (
                <Cell key={c.key} cell={row.cells[c.key]} col={c} />
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr>
              <td className="pf-sticky">{total.label}</td>
              {columns.map((c) => (
                <Cell key={c.key} cell={total.cells[c.key]} col={c} />
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
