import { FileUp, Plus } from "lucide-react";
import { useRef } from "react";
import { formatEur } from "@/lib/format";
import { BarList, Card, EmptyState, Kpi, KpiSkeleton, PageHeader, Skeleton, SourceNote, TimeChart } from "@/ui";
import { AutoCostsCard } from "./components/AutoCostsCard";
import { ExpenseDialog } from "./components/ExpenseDialog";
import { ExpensesTable } from "./components/ExpensesTable";
import { ImportCard } from "./components/ImportCard";
import { RulesCard } from "./components/RulesCard";
import "./expenses.css";
import { useExpenseFormViewModel } from "./useExpenseFormViewModel";
import { useExpensesViewModel } from "./useExpensesViewModel";
import { useImportViewModel } from "./useImportViewModel";
import { useRulesViewModel } from "./useRulesViewModel";

export default function ExpensesPage() {
  const vm = useExpensesViewModel();
  const imp = useImportViewModel();
  const form = useExpenseFormViewModel();
  const rules = useRulesViewModel(vm.rules);
  const fileInput = useRef<HTMLInputElement>(null);
  const openPicker = () => fileInput.current?.click();

  const header = (
    <PageHeader
      title="Dépenses"
      subtitle={vm.subtitle ?? undefined}
      actions={
        <>
          <button className="btn" onClick={openPicker}>
            <FileUp /> Importer un relevé
          </button>
          <button className="btn btn--primary" onClick={form.openNew}>
            <Plus /> Ajouter une dépense
          </button>
        </>
      }
    />
  );

  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept=".csv,.txt,text/csv"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void imp.onFile(file);
        e.target.value = "";
      }}
    />
  );

  if (vm.loading) {
    return (
      <div className="f-expenses stack" style={{ gap: 20 }}>
        {header}
        <KpiSkeleton />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!vm.hasData) {
    return (
      <div className="f-expenses stack" style={{ gap: 20 }}>
        {header}
        {picker}
        <ImportCard vm={imp} batches={vm.batches} openPicker={openPicker} hero />
        <div className="grid grid--2">
          <RulesCard vm={rules} />
          <AutoCostsCard vm={vm} />
        </div>
        <ExpenseDialog vm={form} />
      </div>
    );
  }

  return (
    <div className="f-expenses stack" style={{ gap: 20 }}>
      {header}
      {picker}

      {vm.coverageWarning && <div className="x-alert x-alert--warning">{vm.coverageWarning}</div>}

      {vm.kpis && (
        <div className="grid grid--kpi">
          {vm.kpis.map((k) => (
            <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} invertDelta foot={k.foot} hint={k.hint} />
          ))}
        </div>
      )}

      {(imp.preview || imp.result || imp.error) && <ImportCard vm={imp} batches={vm.batches} openPicker={openPicker} />}

      <div className="grid grid--main-side">
        <Card title="Comment évoluent les dépenses ?" subtitle={vm.chart?.subtitle ?? vm.periodLabel}>
          {vm.chart ? (
            <TimeChart kind="bar" x={vm.chart.x} series={vm.chart.series} formatValue={vm.chart.formatValue} formatX={vm.chart.formatX} formatXLong={vm.chart.formatXLong} showTotal height={260} />
          ) : (
            <EmptyState title="Aucune dépense sur la période" />
          )}
        </Card>
        <Card title="Quelles catégories pèsent le plus ?" subtitle={vm.periodLabel}>
          {vm.categories.length ? <BarList items={vm.categories} formatValue={(n) => formatEur(n)} /> : <EmptyState title="Rien sur la période" />}
        </Card>
      </div>

      <div className="grid grid--2">
        <Card title="Quels fournisseurs coûtent le plus ?" subtitle={vm.periodLabel} footer={vm.vendorsMore ? <span className="muted x-small">{vm.vendorsMore}</span> : undefined}>
          {vm.vendors.length ? <BarList items={vm.vendors} formatValue={(n) => formatEur(n)} /> : <EmptyState title="Rien sur la période" />}
        </Card>
        {imp.preview || imp.result || imp.error ? <AutoCostsCard vm={vm} /> : <ImportCard vm={imp} batches={vm.batches} openPicker={openPicker} />}
      </div>

      <ExpensesTable table={vm.table} onEdit={form.openEdit} />

      <div className="grid grid--2">
        <RulesCard vm={rules} />
        {!(imp.preview || imp.result || imp.error) && <AutoCostsCard vm={vm} />}
      </div>

      <div className="stack" style={{ gap: 4 }}>
        {vm.supersededNote && <SourceNote source={vm.supersededNote} />}
        <SourceNote source="Relevés bancaires importés, saisies manuelles, paiements UGC (Airtable) et API de coûts OpenAI / Anthropic. Montants en euros au taux du jour de l'opération." />
      </div>

      <ExpenseDialog vm={form} />
    </div>
  );
}
