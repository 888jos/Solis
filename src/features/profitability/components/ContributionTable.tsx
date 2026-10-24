import { AppLabel } from "@/ui";
import type { ContributionRow } from "../useProfitabilityViewModel";

/** Net by app minus the expenses attributed to it; studio-wide costs on their own line, never allocated. */
export function ContributionTable({ rows }: { rows: ContributionRow[] }) {
  return (
    <div className="table-wrap">
      <table className="table pf-contrib">
        <thead>
          <tr>
            <th>App</th>
            <th className="r">Net</th>
            <th className="r">Dépenses</th>
            <th className="r">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.kind !== "app" ? `pf-contrib__${r.kind}` : undefined}>
              <td>{r.slug ? <AppLabel slug={r.slug} /> : <span className={r.kind === "total" ? "pf-strong" : "secondary"}>{r.label}</span>}</td>
              <td className="r num">{r.net}</td>
              <td className="r num pf-muted">{r.expenses}</td>
              <td className="r num pf-strong">{r.contribution}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
