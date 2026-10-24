import { FileUp, RotateCcw, Undo2, X } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Badge, Card } from "@/ui";
import type { ImportVM } from "../useImportViewModel";

type Batch = { id: string; fileName: string; when: string; detail: string; range: string; running: boolean };

const BANKS = "Qonto, Shine, BNP Paribas, Société Générale, Crédit Agricole, Boursorama, Revolut, ou tout CSV avec une date, un libellé et un montant.";

export function ImportCard({ vm, batches, openPicker, hero }: { vm: ImportVM; batches: Batch[]; openPicker: () => void; hero?: boolean }) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void vm.onFile(file);
  };
  const p = vm.preview;

  return (
    <Card
      title={hero ? "Commence par importer ton relevé bancaire" : "Importer un relevé"}
      subtitle={hero ? "Export CSV de ta banque : seuls les débits deviennent des dépenses, les doublons sont ignorés." : "CSV de ta banque, les doublons sont ignorés"}
      action={p || vm.result || vm.error ? <button className="btn btn--ghost" onClick={vm.reset} aria-label="Fermer"><X /></button> : undefined}
    >
      <div className="stack x-import">
        {!p && !vm.result && (
          <div
            className={`x-drop${over ? " is-over" : ""}${hero ? " x-drop--hero" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
          >
            <FileUp />
            <strong>{vm.phase === "reading" ? "Lecture du fichier…" : "Dépose ton fichier CSV ici"}</strong>
            <span>ou clique pour le choisir</span>
            <small>{BANKS}</small>
          </div>
        )}

        {vm.error && <div className="x-alert x-alert--error">{vm.error}</div>}

        {p && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="x-preview-head">
              <div>
                <strong>{p.fileName}</strong>
                <div className="muted x-small">
                  {p.format} · {p.details} · {p.range}
                </div>
              </div>
            </div>
            <div className="x-stats">
              {p.stats.map((s) => (
                <div key={s.label}>
                  <span className="muted x-small">{s.label}</span>
                  <strong className="num">{s.value}</strong>
                </div>
              ))}
            </div>
            <div className="x-total">
              <span className="secondary">À importer</span>
              <strong className="num">{p.totals}</strong>
            </div>
            {p.foreignNote && <div className="muted x-small">{p.foreignNote}</div>}
            <div className="x-cols">
              {p.columns.map((c) => (
                <span key={`${c.role}-${c.header}`} className="x-col">
                  <span className="muted">{c.role}</span> {c.header}
                </span>
              ))}
            </div>
            {(p.ignored.length > 0 || p.warnings.length > 0) && (
              <ul className="x-notes">
                {p.ignored.map((t) => (
                  <li key={t}>{t}</li>
                ))}
                {p.warnings.map((t) => (
                  <li key={t} className="x-warn">
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {p.canInvert && (
              <label className="x-check">
                <input type="checkbox" checked={p.invertSign} onChange={vm.toggleInvert} /> Les dépenses sont en montants positifs dans ce fichier
              </label>
            )}
            {p.sample.length > 0 && (
              <div className="table-wrap x-sample">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Libellé</th>
                      <th>Classé comme</th>
                      <th className="r">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.sample.map((s) => (
                      <tr key={s.key}>
                        <td className="num x-nowrap">{s.date}</td>
                        <td className="x-ellipsis" title={s.label}>
                          {s.label}
                        </td>
                        <td className="x-nowrap">
                          {s.vendor} <span className="muted">· {s.category}</span>
                          {!s.matched && <span className="muted"> (sans règle)</span>}
                        </td>
                        <td className="r x-nowrap">{s.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {p.unmatched > 0 && <div className="muted x-small">{p.unmatched} ligne(s) sans règle iront dans « Autre » : ajoute une règle pour les classer.</div>}
            {p.progress ? (
              <div className="x-progress" aria-label="Import en cours">
                <span style={{ width: `${Math.round(p.progress.pct * 100)}%` }} />
              </div>
            ) : (
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={vm.reset}>
                  Annuler
                </button>
                <button className="btn btn--primary" disabled={!p.canImport} onClick={() => void vm.confirm()}>
                  {p.importLabel}
                </button>
              </div>
            )}
          </div>
        )}

        {vm.result && (
          <div className="x-alert x-alert--good">
            <div>
              <strong>{vm.result.text}</strong>
              {vm.result.detail && <div className="x-small">{vm.result.detail}</div>}
            </div>
            <button className="btn" disabled={vm.undoing === vm.result.batchId} onClick={() => void vm.undo(vm.result!.batchId)}>
              <Undo2 /> Annuler cet import
            </button>
          </div>
        )}

        {batches.length > 0 && !p && (
          <div className="x-batches">
            <div className="x-section-label">Derniers imports</div>
            {batches.slice(0, 5).map((b, i) => (
              <div className="x-batch" key={b.id}>
                <div className="x-batch__main">
                  <span className="x-ellipsis">{b.fileName}</span>
                  <span className="muted x-small">
                    {b.when} · {b.range} · {b.detail}
                  </span>
                </div>
                {b.running ? (
                  <Badge status="warning">En cours</Badge>
                ) : (
                  <button className="btn btn--ghost" title="Supprimer toutes les dépenses de cet import" disabled={vm.undoing === b.id} onClick={() => void vm.undo(b.id)}>
                    <RotateCcw /> {i === 0 ? "Annuler" : "Retirer"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
