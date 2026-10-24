import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ExpenseFormVM } from "../useExpenseFormViewModel";

export function ExpenseDialog({ vm }: { vm: ExpenseFormVM }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (vm.open && !d.open) d.showModal();
    if (!vm.open && d.open) d.close();
  }, [vm.open]);

  const f = vm.fields;
  return (
    <dialog ref={ref} className="x-dialog" onClose={vm.close} onCancel={vm.close} aria-labelledby="x-dialog-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void vm.save();
        }}
      >
        <div className="x-dialog__head">
          <h2 id="x-dialog-title">{vm.title}</h2>
          <button type="button" className="btn btn--ghost" onClick={vm.close} aria-label="Fermer">
            <X />
          </button>
        </div>
        <div className="x-dialog__body">
          {vm.lockedNote && <div className="x-alert">{vm.lockedNote}</div>}
          <div className="x-form-grid">
            <label className="x-field">
              <span>Date</span>
              <input className="input" type="date" required value={f.date} disabled={!vm.full} onChange={(e) => vm.set("date", e.target.value)} />
            </label>
            <label className="x-field">
              <span>Fournisseur</span>
              <input className="input" required placeholder="Ex. Superwall" value={f.vendor} onChange={(e) => vm.set("vendor", e.target.value)} />
            </label>
            <label className="x-field">
              <span>Montant</span>
              <input className="input num" inputMode="decimal" required={vm.full} placeholder="0,00" value={f.amount} disabled={!vm.full} onChange={(e) => vm.set("amount", e.target.value)} />
            </label>
            <label className="x-field">
              <span>Devise</span>
              <select className="select" value={f.currency} disabled={!vm.full} onChange={(e) => vm.set("currency", e.target.value)}>
                {vm.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="x-field">
              <span>Catégorie</span>
              <select className="select" value={f.category} onChange={(e) => vm.set("category", e.target.value)}>
                {vm.categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="x-field">
              <span>App</span>
              <select className="select" value={f.appSlug} onChange={(e) => vm.set("appSlug", e.target.value)}>
                {vm.apps.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="x-field x-field--wide">
              <span>Note</span>
              <input className="input" placeholder="Facultatif" value={f.note} onChange={(e) => vm.set("note", e.target.value)} />
            </label>
          </div>
          {vm.canRecur && (
            <label className="x-check">
              <input type="checkbox" checked={f.recurring} onChange={(e) => vm.set("recurring", e.target.checked)} />
              Mensuel : répéter chaque mois à la même date
            </label>
          )}
          {f.currency !== "EUR" && vm.full && <div className="muted x-small">Converti en euros au taux du jour de la dépense.</div>}
          {vm.error && <div className="x-alert x-alert--error">{vm.error}</div>}
        </div>
        <div className="x-dialog__foot">
          {vm.isEdit && (
            <div className="x-dialog__danger">
              <button type="button" className={`btn${vm.confirmDelete ? " x-btn-danger" : " btn--ghost"}`} disabled={vm.saving} onClick={() => void vm.remove()}>
                {vm.deleteLabel}
              </button>
              {vm.confirmDelete && vm.isTemplate && (
                <label className="x-check x-small">
                  <input type="checkbox" checked={vm.deleteCopies} onChange={(e) => vm.setDeleteCopies(e.target.checked)} /> et les mois déjà générés
                </label>
              )}
              {vm.deleteHint && <span className="muted x-small">{vm.deleteHint}</span>}
            </div>
          )}
          <div className="row" style={{ marginLeft: "auto" }}>
            <button type="button" className="btn" onClick={vm.close}>
              Annuler
            </button>
            <button type="submit" className="btn btn--primary" disabled={vm.saving}>
              {vm.saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
