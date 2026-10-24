import { api } from "@convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { appName } from "@/lib/apps";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { useAppFilter, usePeriod } from "@/lib/filters";
import { change, formatAgo, formatDay, formatDayLong, formatEur, formatInt, formatMonth, formatMonthLong, formatPct } from "@/lib/format";
import type { BarListItem, Series } from "@/ui";
import { CATEGORIES, categoryColor, categoryLabel, GROUPS, SOURCE_LABELS } from "./categories";

// ViewModel of the Dépenses page: KPIs, charts, detail table, AI sources. Import, rules and the
// expense form have their own hooks (useImportViewModel, useRulesViewModel, useExpenseFormViewModel).
export type ExpenseRow = {
  id: string;
  dateIso: string;
  date: string;
  vendor: string;
  label: string;
  subline: string;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  appSlug: string | null;
  source: string;
  sourceLabel: string;
  amount: string;
  original: string | null;
  amountOriginal: number;
  currency: string;
  note: string | null;
  recurring: boolean;
  isCopy: boolean;
  superseded: boolean;
  readOnly: boolean;
};

const fmtOriginal = (n: number, currency: string) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useExpensesViewModel() {
  const period = usePeriod();
  const app = useAppFilter();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const debouncedSearch = useDebounced(search, 250);
  const syncAi = useSolisAction(api.expenses.syncAiCosts);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => setLimit(100), [period.key, app, category, debouncedSearch]);

  const meta = useSolisQuery(api.expenses.meta, {});
  const summary = useSolisQuery(api.expenses.summary, {
    from: period.from,
    to: period.to,
    prevFrom: period.prevFrom,
    prevTo: period.prevTo,
    bucket: period.bucket,
    app: app ?? undefined,
  });
  const list = useSolisQuery(api.expenses.list, {
    from: period.from,
    to: period.to,
    app: app ?? undefined,
    category: category || undefined,
    search: debouncedSearch || undefined,
    limit,
  });

  const kpis = useMemo(() => {
    if (!summary) return null;
    const delta = change(summary.total, summary.prevTotal);
    const diff = summary.prevTotal == null ? null : summary.total - summary.prevTotal;
    const burnMonths = summary.burn?.months ?? [];
    return [
      {
        key: "total",
        label: "Dépenses de la période",
        value: formatEur(summary.total),
        delta: summary.prevTotal == null ? undefined : delta,
        foot: summary.prevTotal == null ? `${formatInt(summary.count)} opération${summary.count > 1 ? "s" : ""}` : "vs période préc.",
        hint: `${period.label} · ${formatInt(summary.count)} opération${summary.count > 1 ? "s" : ""}`,
      },
      {
        key: "prev",
        label: "Période précédente",
        value: summary.prevTotal == null ? "—" : formatEur(summary.prevTotal),
        foot:
          summary.prevTotal == null
            ? summary.firstDay
              ? `Données à partir du ${formatDay(summary.firstDay)}`
              : "Aucune donnée"
            : diff === 0
              ? "Identique"
              : `${diff! > 0 ? "+" : "−"}${formatEur(Math.abs(diff!))} cette période`,
        hint: `Du ${formatDayLong(period.prevFrom)} au ${formatDayLong(period.prevTo)}`,
      },
      {
        key: "burn",
        label: "Burn mensuel moyen",
        value: summary.burn ? formatEur(summary.burn.avg) : "—",
        foot: burnMonths.length
          ? burnMonths.length === 1
            ? `${formatMonthLong(burnMonths[0].month)} seul`
            : `${formatMonth(burnMonths[0].month)} → ${formatMonth(burnMonths[burnMonths.length - 1].month)}`
          : "Pas encore de mois complet",
        hint: burnMonths.map((m) => `${formatMonthLong(m.month)} : ${formatEur(m.total)}`).join("\n") || "Moyenne des 3 derniers mois complets couverts par les données",
      },
      {
        key: "top",
        label: "Plus gros poste",
        value: summary.top?.vendor ?? "—",
        foot: summary.top ? `${formatEur(summary.top.total)} · ${formatPct(summary.top.share, 0)} du total` : "Aucune dépense",
        hint: summary.top ? `${summary.top.count} opération(s)` : undefined,
      },
    ];
  }, [summary, period]);

  const chart = useMemo(() => {
    if (!summary || !summary.series.length) return null;
    const b = period.bucket;
    const series: Series[] = summary.series.map((s) => ({ key: s.group, label: GROUPS[s.group].label, color: GROUPS[s.group].color, values: s.values }));
    return {
      x: summary.x,
      series,
      formatX: b === "month" ? formatMonth : formatDay,
      formatXLong: b === "month" ? formatMonthLong : b === "week" ? (d: string) => `Semaine du ${formatDay(d)}` : formatDayLong,
      // Whole euros on round values (axis ticks), cents otherwise (tooltip).
      formatValue: (n: number) => formatEur(n, { decimals: Math.abs(n) < 100 && !Number.isInteger(n) }),
      subtitle: `Par ${b === "day" ? "jour" : b === "week" ? "semaine" : "mois"}, par catégorie`,
    };
  }, [summary, period.bucket]);

  const categories: BarListItem[] = useMemo(
    () => (summary?.categories ?? []).map((c) => ({ key: c.category, label: categoryLabel(c.category), value: c.total, color: categoryColor(c.category) })),
    [summary],
  );
  const vendors: BarListItem[] = useMemo(
    () => (summary?.vendors ?? []).map((v) => ({ key: v.vendor, label: v.vendor, value: v.total, color: categoryColor(v.category), hint: `${v.count} opération(s) · ${categoryLabel(v.category)}` })),
    [summary],
  );

  const rows: ExpenseRow[] = useMemo(
    () =>
      (list?.rows ?? []).map((r) => ({
        id: r.id,
        dateIso: r.date,
        date: formatDay(r.date),
        vendor: r.vendor,
        label: r.label,
        subline: [SOURCE_LABELS[r.source] ?? r.source, r.note, r.label !== r.vendor ? r.label : null].filter(Boolean).join(" · "),
        category: r.category,
        categoryLabel: categoryLabel(r.category),
        categoryColor: categoryColor(r.category),
        appSlug: r.appSlug,
        source: r.source,
        sourceLabel: SOURCE_LABELS[r.source] ?? r.source,
        amount: formatEur(r.amountEur, { decimals: true }),
        original: r.currency !== "EUR" ? fmtOriginal(r.amountOriginal, r.currency) : null,
        amountOriginal: r.amountOriginal,
        currency: r.currency,
        note: r.note,
        recurring: r.recurring,
        isCopy: !!r.recurringFromId,
        superseded: r.superseded,
        readOnly: r.readOnly,
      })),
    [list],
  );

  const aiSources = (meta?.aiSources ?? []).map((s) => ({
    key: s.source,
    vendor: s.vendor,
    env: s.env,
    configured: s.configured,
    status: s.lastRun?.status ?? null,
    statusText: !s.configured
      ? `Il manque ${s.env}`
      : s.lastRun
        ? s.lastRun.status === "ok"
          ? `Synchronisé ${formatAgo(s.lastOkAt)}`
          : s.lastRun.status === "error"
            ? `Erreur ${formatAgo(s.lastRun.at)} : ${s.lastRun.message ?? ""}`
            : (s.lastRun.message ?? "Ignoré")
        : "Jamais synchronisé",
  }));

  const coverage = meta?.bank ? `Relevés importés du ${formatDay(meta.bank.from)} ${meta.bank.from.slice(0, 4)} au ${formatDay(meta.bank.to)} ${meta.bank.to.slice(0, 4)}` : null;

  return {
    loading: !meta || !summary,
    hasData: meta?.hasData ?? false,
    periodLabel: period.label,
    subtitle: [coverage, meta?.hasUgc ? "paiements UGC inclus" : null, app ? `${appName(app)} uniquement (hors dépenses studio)` : null].filter(Boolean).join(" · ") || null,
    // Bank exports stop at a date: after it, "0 €" means "not imported yet", not "no spending".
    coverageWarning:
      meta?.bank && meta.bank.to < period.to
        ? `Relevé importé jusqu'au ${formatDay(meta.bank.to)} ${meta.bank.to.slice(0, 4)} : les dépenses bancaires suivantes n'y sont pas encore.`
        : null,
    kpis,
    chart,
    categories,
    vendors,
    vendorsMore: summary && summary.vendorCount > summary.vendors.length ? `+ ${summary.vendorCount - summary.vendors.length} autres fournisseurs` : null,
    supersededNote: summary?.supersededCount
      ? `${formatInt(summary.supersededCount)} ligne(s) de relevé remplacée(s) par les coûts API (comptées une seule fois).`
      : null,
    table: {
      rows,
      loading: !list,
      matched: list?.matched ?? 0,
      totalLabel: list ? `${formatInt(list.matched)} opération${list.matched > 1 ? "s" : ""} · ${formatEur(list.totalEur)}` : "",
      canLoadMore: !!list && list.matched > rows.length,
      loadMore: () => setLimit((l) => l + 200),
      category,
      setCategory,
      search,
      setSearch,
      categoryOptions: [{ value: "", label: "Toutes les catégories" }, ...CATEGORIES.map((c) => ({ value: c.key, label: c.label }))],
      filtered: !!category || !!debouncedSearch,
    },
    aiSources,
    anyAiConfigured: aiSources.some((s) => s.configured),
    syncing,
    syncAi: async () => {
      setSyncing(true);
      try {
        await syncAi({});
      } finally {
        setSyncing(false);
      }
    },
    recurring: (meta?.recurring ?? []).map((r) => ({ id: r.id, text: `${r.vendor} · ${formatEur(r.amountEur)} le ${r.day} du mois` })),
    batches: (meta?.batches ?? []).map((b) => ({
      id: b.id,
      fileName: b.fileName,
      when: formatAgo(b.importedAt),
      detail: `${formatInt(b.rowsImported)} importée${b.rowsImported > 1 ? "s" : ""} · ${formatEur(b.totalEur)}${b.rowsSkipped ? ` · ${formatInt(b.rowsSkipped)} ignorée${b.rowsSkipped > 1 ? "s" : ""}` : ""}`,
      range: b.dateFrom && b.dateTo ? `${formatDay(b.dateFrom)} → ${formatDay(b.dateTo)}` : "",
      running: b.status === "running",
    })),
    rules: meta?.rules ?? [],
  };
}

export type ExpensesVM = ReturnType<typeof useExpensesViewModel>;
