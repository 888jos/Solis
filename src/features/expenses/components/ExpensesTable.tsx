import { Repeat, Search } from "lucide-react";
import { AppLabel, Badge, Card, EmptyState, Skeleton } from "@/ui";
import type { ExpenseRow, ExpensesVM } from "../useExpensesViewModel";

export function ExpensesTable({ table, onEdit }: { table: ExpensesVM["table"]; onEdit: (row: ExpenseRow) => void }) {
  return (
    <Card
      title="Détail des dépenses"
      subtitle={table.totalLabel}
      flush
      action={
        <div className="row x-wrap x-table-filters">
          <div className="x-search">
            <Search />
            <input className="input" type="search" placeholder="Rechercher" value={table.search} onChange={(e) => table.setSearch(e.target.value)} aria-label="Rechercher une dépense" />
          </div>
          <select className="select" value={table.category} onChange={(e) => table.setCategory(e.target.value)} aria-label="Catégorie">
            {table.categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {table.loading ? (
        <div style={{ padding: "0 20px 20px" }}>
          <Skeleton height={240} />
        </div>
      ) : !table.rows.length ? (
        <EmptyState title={table.filtered ? "Aucune dépense ne correspond" : "Aucune dépense sur la période"}>
          {table.filtered ? "Change la recherche ou la catégorie." : "Change de période, importe un relevé ou ajoute une dépense."}
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table x-table">
              <thead>
                <tr>
                  <th style={{ width: 76 }}>Date</th>
                  <th>Fournisseur</th>
                  <th className="x-hide-sm">Catégorie</th>
                  <th className="x-hide-sm">App</th>
                  <th className="r">Montant</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`${r.readOnly ? "" : "x-clickable"}${r.superseded ? " x-superseded" : ""}`}
                    onClick={() => onEdit(r)}
                    tabIndex={r.readOnly ? undefined : 0}
                    onKeyDown={(e) => e.key === "Enter" && onEdit(r)}
                    title={r.readOnly ? "Géré dans Créateurs UGC" : "Modifier"}
                  >
                    <td className="num secondary">{r.date}</td>
                    <td className="x-vendor-cell">
                      <div className="x-vendor">
                        {r.vendor}
                        {(r.recurring || r.isCopy) && <Repeat className="x-inline-icon" aria-label="Mensuel" />}
                      </div>
                      <div className="muted x-small x-ellipsis" title={r.label}>
                        <span className="x-show-sm">{r.categoryLabel} · </span>
                        {r.subline}
                      </div>
                    </td>
                    <td className="x-hide-sm">
                      <span className="app-chip">
                        <span className="x-swatch" style={{ background: r.categoryColor }} />
                        {r.categoryLabel}
                      </span>
                    </td>
                    <td className="x-hide-sm">{r.appSlug ? <AppLabel slug={r.appSlug} /> : <span className="muted">Studio</span>}</td>
                    <td className="r">
                      {r.superseded && <Badge>Remplacé par l'API</Badge>}
                      <div className={r.superseded ? "x-strike" : undefined}>{r.amount}</div>
                      {r.original && <div className="muted x-small">{r.original}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.canLoadMore && (
            <div className="x-more">
              <button className="btn" onClick={table.loadMore}>
                Afficher plus
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
