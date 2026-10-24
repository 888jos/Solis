import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useMemo, useState } from "react";
import { APPS, appName } from "@/lib/apps";
import { useSolisMutation } from "@/lib/convex";
import { formatInt } from "@/lib/format";
import { CATEGORIES, categoryLabel, EXCLUDED_KEY } from "./categories";

// ViewModel of the categorisation rules manager.
type Rule = { id: string; pattern: string; vendor: string; category: string; appSlug: string | null; builtin: boolean };
type Draft = { id: string | null; pattern: string; vendor: string; category: string; appSlug: string };

const blank: Draft = { id: null, pattern: "", vendor: "", category: "tools", appSlug: "" };

export function useRulesViewModel(rules: Rule[]) {
  const saveRule = useSolisMutation(api.expenses.saveRule);
  const deleteRule = useSolisMutation(api.expenses.deleteRule);
  const applyRules = useSolisMutation(api.expenses.applyRules);
  const restore = useSolisMutation(api.expenses.restoreDefaultRules);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rules
      .filter((r) => !q || `${r.pattern} ${r.vendor} ${categoryLabel(r.category)}`.toLowerCase().includes(q))
      .map((r) => ({ ...r, categoryLabel: categoryLabel(r.category), appLabel: r.appSlug ? appName(r.appSlug) : "—", excluded: r.category === EXCLUDED_KEY }));
  }, [rules, filter]);

  const run = useCallback(async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      setMessage(await fn());
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      setError(/Uncaught Error: ([^\n]+)/.exec(msg)?.[1] ?? msg);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    expanded,
    toggle: () => setExpanded((e) => !e),
    count: `${formatInt(rules.length)} règle${rules.length > 1 ? "s" : ""}`,
    filter,
    setFilter,
    rules: shown,
    draft,
    startNew: () => {
      setExpanded(true);
      setDraft({ ...blank });
    },
    startEdit: (r: Rule) => setDraft({ id: r.id, pattern: r.pattern, vendor: r.vendor, category: r.category, appSlug: r.appSlug ?? "" }),
    cancel: () => setDraft(null),
    setDraft: (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)),
    categories: [...CATEGORIES.map((c) => ({ value: c.key, label: c.label })), { value: EXCLUDED_KEY, label: categoryLabel(EXCLUDED_KEY) }],
    apps: [{ value: "", label: "Studio" }, ...APPS.map((a) => ({ value: a.slug, label: a.name }))],
    busy,
    message,
    error,
    save: () =>
      run(async () => {
        if (!draft) return null;
        await saveRule({ id: draft.id ? (draft.id as Id<"expenseRules">) : undefined, pattern: draft.pattern, vendor: draft.vendor, category: draft.category, appSlug: draft.appSlug || undefined });
        setDraft(null);
        return "Règle enregistrée. Réapplique les règles pour mettre à jour les dépenses déjà importées.";
      }),
    remove: (id: string) =>
      run(async () => {
        await deleteRule({ id: id as Id<"expenseRules"> });
        if (draft?.id === id) setDraft(null);
        return "Règle supprimée.";
      }),
    apply: () =>
      run(async () => {
        const r = await applyRules({});
        return `${formatInt(r.scanned)} lignes de relevé relues : ${formatInt(r.changed)} reclassée${r.changed > 1 ? "s" : ""}${r.excluded ? `, ${formatInt(r.excluded)} retirée${r.excluded > 1 ? "s" : ""} (ignorées)` : ""}.`;
      }),
    restoreDefaults: () =>
      run(async () => {
        const n = await restore({});
        return n ? `${formatInt(n)} règle${n > 1 ? "s" : ""} par défaut restaurée${n > 1 ? "s" : ""}.` : "Toutes les règles par défaut sont déjà là.";
      }),
  };
}

export type RulesVM = ReturnType<typeof useRulesViewModel>;
