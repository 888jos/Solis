import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment } from "react";
import { Badge, Card } from "@/ui";
import type { RulesVM } from "../useRulesViewModel";

export function RulesCard({ vm }: { vm: RulesVM }) {
  const d = vm.draft;
  const draftRow = d && (
    <tr className="x-draft">
      <td>
        <input className="input" autoFocus placeholder="openai ou /regex/" value={d.pattern} onChange={(e) => vm.setDraft({ pattern: e.target.value })} />
      </td>
      <td>
        <input className="input" placeholder="Fournisseur" value={d.vendor} onChange={(e) => vm.setDraft({ vendor: e.target.value })} />
      </td>
      <td>
        <select className="select" value={d.category} onChange={(e) => vm.setDraft({ category: e.target.value })}>
          {vm.categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select className="select" value={d.appSlug} onChange={(e) => vm.setDraft({ appSlug: e.target.value })}>
          {vm.apps.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </td>
      <td className="r">
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn--ghost" onClick={vm.cancel}>
            Annuler
          </button>
          <button className="btn btn--primary" disabled={vm.busy} onClick={() => void vm.save()}>
            OK
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <Card
      title="Comment les libellés sont classés"
      subtitle={`${vm.count} · le motif le plus long l'emporte · /…/ pour une expression régulière`}
      action={
        <button className="btn btn--ghost" onClick={vm.toggle} aria-expanded={vm.expanded}>
          {vm.expanded ? <ChevronDown /> : <ChevronRight />}
          {vm.expanded ? "Replier" : "Voir les règles"}
        </button>
      }
      flush={vm.expanded}
    >
      {!vm.expanded ? (
        <div className="row x-wrap">
          <button className="btn" onClick={vm.startNew}>
            <Plus /> Nouvelle règle
          </button>
          <button className="btn" disabled={vm.busy} onClick={() => void vm.apply()}>
            Réappliquer aux dépenses
          </button>
          {vm.message && <span className="muted x-small">{vm.message}</span>}
          {vm.error && <span className="x-error-text x-small">{vm.error}</span>}
        </div>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          <div className="row x-wrap x-rules-bar">
            <input className="input" placeholder="Filtrer les règles" value={vm.filter} onChange={(e) => vm.setFilter(e.target.value)} />
            <button className="btn" onClick={vm.startNew}>
              <Plus /> Nouvelle règle
            </button>
            <button className="btn" disabled={vm.busy} onClick={() => void vm.apply()}>
              Réappliquer aux dépenses
            </button>
            <button className="btn btn--ghost" disabled={vm.busy} onClick={() => void vm.restoreDefaults()}>
              Restaurer les règles par défaut
            </button>
          </div>
          {(vm.message || vm.error) && <div className={`x-rules-msg x-small ${vm.error ? "x-error-text" : "muted"}`}>{vm.error ?? vm.message}</div>}
          <div className="table-wrap x-rules-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Si le libellé contient</th>
                  <th>Fournisseur</th>
                  <th>Catégorie</th>
                  <th>App</th>
                  <th className="r" style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {d && !d.id && draftRow}
                {vm.rules.map((r) =>
                  d?.id === r.id ? (
                    <Fragment key={r.id}>{draftRow}</Fragment>
                  ) : (
                    <tr key={r.id}>
                      <td>
                        <code className="x-code">{r.pattern}</code>
                      </td>
                      <td>{r.excluded ? <span className="muted">—</span> : r.vendor}</td>
                      <td>{r.excluded ? <Badge>Ignorée</Badge> : r.categoryLabel}</td>
                      <td className="secondary">{r.appLabel}</td>
                      <td className="r">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 2 }}>
                          <button className="btn btn--ghost x-icon-btn" aria-label={`Modifier la règle ${r.pattern}`} onClick={() => vm.startEdit(r)}>
                            <Pencil />
                          </button>
                          <button className="btn btn--ghost x-icon-btn" aria-label={`Supprimer la règle ${r.pattern}`} disabled={vm.busy} onClick={() => void vm.remove(r.id)}>
                            <Trash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
