import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useState } from "react";
import { APPS } from "@/lib/apps";
import { useSolisAction, useSolisMutation } from "@/lib/convex";
import { CATEGORIES, CURRENCIES } from "./categories";
import type { ExpenseRow } from "./useExpensesViewModel";

// ViewModel of the add / edit expense dialog. Manual expenses are fully editable; imported, API and
// generated monthly rows only let Jos fix the classification (vendor, category, app, note).
type Fields = { date: string; vendor: string; label: string; amount: string; currency: string; category: string; appSlug: string; recurring: boolean; note: string };

const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Fields => ({ date: today(), vendor: "", label: "", amount: "", currency: "EUR", category: "tools", appSlug: "", recurring: false, note: "" });

function parseAmountInput(s: string) {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function useExpenseFormViewModel() {
  const saveExpense = useSolisAction(api.expenses.saveExpense);
  const deleteExpense = useSolisMutation(api.expenses.deleteExpense);
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<ExpenseRow | null>(null);
  const [fields, setFields] = useState<Fields>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCopies, setDeleteCopies] = useState(false);

  const openNew = useCallback(() => {
    setRow(null);
    setFields(empty());
    setError(null);
    setConfirmDelete(false);
    setOpen(true);
  }, []);

  const openEdit = useCallback((r: ExpenseRow) => {
    if (r.readOnly) return;
    setRow(r);
    setFields({
      date: r.dateIso,
      vendor: r.vendor,
      label: r.label,
      amount: String(r.amountOriginal).replace(".", ","),
      currency: r.currency,
      category: r.category,
      appSlug: r.appSlug ?? "",
      recurring: r.recurring,
      note: r.note ?? "",
    });
    setError(null);
    setConfirmDelete(false);
    setDeleteCopies(false);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const set = useCallback(<K extends keyof Fields>(key: K, value: Fields[K]) => setFields((f) => ({ ...f, [key]: value })), []);

  const full = !row || row.source === "manual";

  const save = useCallback(async () => {
    setError(null);
    const amount = parseAmountInput(fields.amount);
    if (full && !(amount > 0)) return setError("Montant invalide.");
    if (!fields.vendor.trim()) return setError("Indique le fournisseur.");
    setSaving(true);
    try {
      await saveExpense({
        id: row ? (row.id as Id<"expenses">) : undefined,
        date: fields.date,
        vendor: fields.vendor,
        label: fields.label || undefined,
        amount: full ? amount : row!.amountOriginal,
        currency: fields.currency,
        category: fields.category,
        appSlug: fields.appSlug || undefined,
        recurring: full ? fields.recurring : false,
        note: fields.note || undefined,
      });
      setOpen(false);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setSaving(false);
    }
  }, [fields, full, row, saveExpense]);

  const remove = useCallback(async () => {
    if (!row) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    try {
      await deleteExpense({ id: row.id as Id<"expenses">, withCopies: row.recurring ? deleteCopies : undefined });
      setOpen(false);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setSaving(false);
    }
  }, [row, confirmDelete, deleteCopies, deleteExpense]);

  return {
    open,
    title: row ? "Modifier la dépense" : "Ajouter une dépense",
    isEdit: !!row,
    full,
    lockedNote: row && !full ? `${row.sourceLabel} : date et montant viennent de la source, seul le classement est modifiable. Les règles ne toucheront plus cette ligne.` : null,
    fields,
    set,
    categories: CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
    currencies: [...new Set([...CURRENCIES, fields.currency])],
    apps: [{ value: "", label: "Studio (toutes les apps)" }, ...APPS.map((a) => ({ value: a.slug, label: a.name }))],
    canRecur: full,
    isTemplate: !!row?.recurring,
    saving,
    error,
    confirmDelete,
    deleteCopies,
    setDeleteCopies,
    deleteLabel: confirmDelete ? "Confirmer la suppression" : "Supprimer",
    deleteHint: row && row.source !== "manual" && confirmDelete ? "Cette ligne ne reviendra pas lors d'un prochain import." : null,
    openNew,
    openEdit,
    close,
    save,
    remove,
  };
}

function cleanError(err: unknown) {
  const msg = (err as Error)?.message ?? String(err);
  const m = /Uncaught Error: ([^\n]+)/.exec(msg);
  return (m ? m[1] : msg).replace(/\s+at .*$/s, "");
}

export type ExpenseFormVM = ReturnType<typeof useExpenseFormViewModel>;
