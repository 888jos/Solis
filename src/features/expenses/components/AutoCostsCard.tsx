import { RefreshCw, Repeat } from "lucide-react";
import { Badge, Card } from "@/ui";
import type { ExpensesVM } from "../useExpensesViewModel";

/** AI admin cost APIs + monthly recurring costs: everything that lands without an import. */
export function AutoCostsCard({ vm }: { vm: ExpensesVM }) {
  return (
    <Card
      title="Qu'est-ce qui arrive sans import ?"
      subtitle="Coûts API IA et dépenses mensuelles"
      action={
        vm.anyAiConfigured ? (
          <button className="btn" disabled={vm.syncing} onClick={() => void vm.syncAi()}>
            <RefreshCw /> {vm.syncing ? "Synchro…" : "Synchroniser"}
          </button>
        ) : undefined
      }
    >
      <div className="stack" style={{ gap: 0 }}>
        {vm.aiSources.map((s) => (
          <div className="x-source" key={s.key}>
            <div className="x-batch__main">
              <span>{s.vendor}</span>
              <span className="muted x-small">{s.configured ? s.statusText : `Pas branché : ajoute ${s.env} (clé admin) dans les variables Convex`}</span>
            </div>
            {!s.configured ? (
              <Badge>Non connecté</Badge>
            ) : s.status === "ok" ? (
              <Badge status="good">Connecté</Badge>
            ) : s.status === "error" ? (
              <Badge status="critical">Erreur</Badge>
            ) : (
              <Badge status="warning">En attente</Badge>
            )}
          </div>
        ))}
        <div className="x-section-label" style={{ marginTop: 14 }}>
          Dépenses mensuelles
        </div>
        {vm.recurring.length ? (
          vm.recurring.map((r) => (
            <div className="x-source" key={r.id}>
              <span className="row" style={{ gap: 8 }}>
                <Repeat className="x-inline-icon" />
                {r.text}
              </span>
            </div>
          ))
        ) : (
          <div className="muted x-small" style={{ padding: "6px 0" }}>
            Aucune. Coche « Mensuel » en ajoutant une dépense pour qu'elle revienne chaque mois.
          </div>
        )}
      </div>
    </Card>
  );
}
