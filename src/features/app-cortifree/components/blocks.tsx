import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, Skeleton, Sparkline, TimeChart, type Column } from "@/ui";
import type { Cell } from "../data/useWidgets";
import type { BarsVM, CardVM, ChartVM, Content, FunnelVM, KpiVM, TableVM, Waiting } from "../data/vm";

// View pieces of the CortiFree page: render only, everything arrives formatted from the ViewModels.

export function WaitingState({ w }: { w: Waiting }) {
  return (
    <EmptyState title={w.title}>
      {w.events?.length ? (
        <>
          En attente de{" "}
          {w.events.map((e, i) => (
            <span key={e}>
              {i > 0 && " ou "}
              <code className="cf-code">{e}</code>
            </span>
          ))}{" "}
          dans Amplitude.{" "}
        </>
      ) : null}
      {w.note}
    </EmptyState>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <EmptyState
      title="Impossible de charger cette carte"
      icon={<AlertTriangle />}
      action={
        <button type="button" className="btn" onClick={retry}>
          Réessayer
        </button>
      }
    >
      {message}
    </EmptyState>
  );
}

/** Loading / error / waiting / data switch for one card body. */
export function Async<T>({ cell, height = 220, children }: { cell: CardVM<T> | Cell<Content<T>>; height?: number; children: (data: T) => ReactNode }) {
  if (cell.state === "loading") return <Skeleton height={height} />;
  if (cell.state === "error") return <ErrorState message={cell.message} retry={cell.retry} />;
  if (cell.data.kind === "waiting") return <WaitingState w={cell.data.waiting} />;
  return <>{children(cell.data.data)}</>;
}

/** Data or "waiting for…" inside an already loaded card. */
export function Show<T>({ content, children }: { content: Content<T>; children: (data: T) => ReactNode }) {
  return content.kind === "waiting" ? <WaitingState w={content.waiting} /> : <>{children(content.data)}</>;
}

export function Pending({ items, label = "En attente de données :" }: { items?: string[]; label?: string }) {
  if (!items?.length) return null;
  return (
    <p className="cf-pending">
      <span>{label}</span> {items.join(" · ")}
    </p>
  );
}

export function Tags({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="cf-tags">
      {items.map((t) => (
        <span className="cf-tag num" key={t}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="cf-section">{children}</h3>;
}

/* ---------- KPIs ---------- */

export function KpiRow({ cell, count = 4 }: { cell: Cell<KpiVM[]>; count?: number }) {
  if (cell.state === "loading") return <KpiSkeleton count={count} />;
  if (cell.state === "error") return <Card><ErrorState message={cell.message} retry={cell.retry} /></Card>;
  return (
    <div className="grid grid--kpi">
      {cell.data.map((k) => (
        <Kpi
          key={k.key}
          label={k.label}
          value={<span className={k.waiting ? "muted" : undefined}>{k.value}</span>}
          delta={k.waiting ? undefined : k.delta}
          invertDelta={k.invert}
          foot={k.foot}
          hint={k.hint}
          spark={k.spark && k.spark.length > 1 ? <Sparkline values={k.spark} color={k.color} /> : undefined}
        />
      ))}
    </div>
  );
}

/* ---------- Charts / bars / tables ---------- */

export function Chart({ vm, height = 240 }: { vm: ChartVM; height?: number }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Tags items={vm.tags} />
      <TimeChart x={vm.x} series={vm.series} kind={vm.kind ?? "line"} height={height} formatValue={vm.formatValue} formatX={vm.formatX} formatXLong={vm.formatXLong} showTotal={vm.showTotal} />
      <Pending items={vm.waiting} />
    </div>
  );
}

export function ChartCard({ title, subtitle, cell, height = 240, action }: { title: string; subtitle?: string; cell: CardVM<ChartVM>; height?: number; action?: ReactNode }) {
  return (
    <Card title={title} subtitle={subtitle} action={action}>
      <Async cell={cell} height={height}>
        {(vm) => <Chart vm={vm} height={height} />}
      </Async>
    </Card>
  );
}

export function Bars({ vm, limit }: { vm: BarsVM; limit?: number }) {
  return <BarList items={vm.items} formatValue={vm.formatValue} limit={limit} />;
}

export function BarsCard({ title, subtitle, cell, limit }: { title: string; subtitle?: string; cell: CardVM<BarsVM>; limit?: number }) {
  const sub = cell.state === "ready" && cell.data.kind === "data" ? (cell.data.data.subtitle ?? subtitle) : subtitle;
  return (
    <Card title={title} subtitle={sub}>
      <Async cell={cell} height={160}>
        {(vm) => <Bars vm={vm} limit={limit} />}
      </Async>
    </Card>
  );
}

export function SimpleTable({ vm, maxRows }: { vm: TableVM; maxRows?: number }) {
  const columns: Column<Record<string, string>>[] = vm.columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    cell: (r) => <span className={`${c.align === "right" ? "num" : ""}${c.muted ? " muted" : ""}`}>{r[c.key] ?? "—"}</span>,
  }));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <DataTable columns={columns} rows={vm.rows} rowKey={(r) => JSON.stringify(r)} maxRows={maxRows} />
      {vm.note && <p className="cf-note">{vm.note}</p>}
    </div>
  );
}

export function TableCard({ title, subtitle, cell, action }: { title: string; subtitle?: string; cell: CardVM<TableVM>; action?: ReactNode }) {
  return (
    <Card title={title} subtitle={subtitle} action={action} flush>
      <Async cell={cell} height={160}>
        {(vm) => <SimpleTable vm={vm} />}
      </Async>
    </Card>
  );
}

/* ---------- Funnel: horizontal step bars, conversion between steps ---------- */

export function Funnel({ vm, renderDetail }: { vm: FunnelVM; renderDetail?: (key: string) => ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const n = vm.steps.length;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Tags items={vm.tags} />
      <ol className="cf-funnel">
        {vm.steps.map((s, i) => {
          // Ordinal blue ramp: first step darkest.
          const strength = n > 1 ? 100 - Math.round((i / (n - 1)) * 55) : 100;
          const expandable = !!renderDetail;
          const isOpen = open === s.key;
          const head = (
            <>
              <span className="cf-funnel__idx num">{i + 1}</span>
              <span className="cf-funnel__label" title={s.hint}>
                {expandable && <ChevronRight className={`cf-chev${isOpen ? " cf-chev--open" : ""}`} size={14} />}
                <span className={s.muted ? "muted" : undefined}>{s.label}</span>
                {s.worst && <span className="cf-worst">plus gros abandon</span>}
              </span>
              <span className="cf-funnel__track">
                <span className="cf-funnel__bar" style={{ width: `${Math.max(0.8, s.share * 100)}%`, background: `color-mix(in srgb, var(--series-1) ${strength}%, var(--surface))` }} />
              </span>
              <span className="cf-funnel__count num">{s.count}</span>
              <span className="cf-funnel__pct num">{s.ofFirst}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.conversion != null && (
                <div className="cf-funnel__conv num" aria-label={`conversion depuis l'étape précédente ${s.conversion}`}>
                  ↓ {s.conversion}
                </div>
              )}
              {expandable ? (
                <button type="button" className="cf-funnel__row cf-funnel__row--btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.key)}>
                  {head}
                </button>
              ) : (
                <div className="cf-funnel__row">{head}</div>
              )}
              {isOpen && renderDetail && <div className="cf-funnel__detail">{renderDetail(s.key)}</div>}
            </li>
          );
        })}
      </ol>
      {vm.note && <p className="cf-note">{vm.note}</p>}
      <Pending items={vm.waiting} label="Étapes ignorées (pas encore de données) :" />
    </div>
  );
}

export function FunnelCard({ title, subtitle, cell, action }: { title: string; subtitle?: string; cell: CardVM<FunnelVM>; action?: ReactNode }) {
  return (
    <Card title={title} subtitle={subtitle} action={action}>
      <Async cell={cell} height={200}>
        {(vm) => <Funnel vm={vm} />}
      </Async>
    </Card>
  );
}

/* ---------- Select ---------- */

export function Select({ value, options, onChange, label }: { value: string; options: { value: string; label: string; group?: string }[]; onChange: (v: string) => void; label: string }) {
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <select className="select cf-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) =>
        g ? (
          <optgroup key={g} label={g}>
            {options.filter((o) => o.group === g).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          options.filter((o) => !o.group).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}
