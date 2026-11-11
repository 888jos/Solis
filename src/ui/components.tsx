import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Database, Info, Minus, PlugZap, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { APPS, appColor, appIcon, appName, type AppSlug } from "@/lib/apps";
import { formatAgo, formatPct } from "@/lib/format";

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

/* ---------- Card ---------- */
export function Card({ title, subtitle, action, children, flush, className, footer }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string; footer?: ReactNode }) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      {(title || action) && (
        <div className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "card__body--flush" : "card__body"}>{children}</div>
      {footer && <div className="card__footer">{footer}</div>}
    </section>
  );
}

/* ---------- KPI tile ---------- */
export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="delta delta--flat">—</span>;
  const flat = Math.abs(value) < 0.005;
  const good = invert ? value < 0 : value > 0;
  const cls = flat ? "delta--flat" : good ? "delta--up" : "delta--down";
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${cls}`} aria-label={`${value > 0 ? "hausse" : "baisse"} de ${formatPct(Math.abs(value))}`}>
      <Icon size={13} strokeWidth={2.4} />
      {formatPct(Math.abs(value), Math.abs(value) < 0.1 ? 1 : 0)}
    </span>
  );
}

/** `to`: the whole tile (curve included) opens that page, usually the chart explorer on this metric. */
export function Kpi({ label, value, delta, invertDelta, foot, spark, hint, big, to }: { label: ReactNode; value: ReactNode; delta?: number | null; invertDelta?: boolean; foot?: ReactNode; spark?: ReactNode; hint?: string; big?: boolean; to?: To }) {
  const className = `card kpi${big ? " kpi--big" : ""}${spark ? " kpi--spark" : ""}${to ? " kpi--link" : ""}`;
  const body = (
    <>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value num">{value}</div>
      <div className="kpi__foot">
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
        {foot && <span>{foot}</span>}
      </div>
      {spark && <div className="kpi__spark">{spark}</div>}
    </>
  );
  return to ? (
    <Link to={to} className={className} title={hint ? `${hint} · cliquer pour explorer` : "Cliquer pour explorer"}>
      {body}
    </Link>
  ) : (
    <div className={className} title={hint}>
      {body}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid--kpi">
      {Array.from({ length: count }, (_, i) => (
        <div className="card kpi" key={i}>
          <div className="skeleton" style={{ height: 12, width: "50%" }} />
          <div className="skeleton" style={{ height: 26, width: "70%" }} />
          <div className="skeleton" style={{ height: 10, width: "35%" }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- App label ---------- */
/** App Store icon of an app, with its series color as a fallback when there is no icon. */
export function AppIcon({ slug, size = 16 }: { slug: string; size?: number }) {
  const src = appIcon(slug);
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.24) };
  return src ? <img className="app-icon" src={src} alt="" style={style} /> : <span className="app-icon" style={{ ...style, background: appColor(slug) }} aria-hidden />;
}

export function AppLabel({ slug, name }: { slug: string; name?: string }) {
  const app = APPS.find((a) => a.slug === slug);
  return (
    <span className="app-chip">
      <AppIcon slug={slug} size={15} />
      {name ?? app?.name ?? appName(slug)}
    </span>
  );
}

/** App filter: one App Store icon per app (top right of every page). Clicking the active one shows all apps again. */
export function AppPicker({ value, onChange }: { value: AppSlug | "otto" | null; onChange: (v: AppSlug | "otto" | null) => void }) {
  return (
    <div className="app-pills" role="group" aria-label="App">
      <button type="button" className="app-pills__all" aria-pressed={value == null} onClick={() => onChange(null)}>
        Toutes
      </button>
      {APPS.map((a) => (
        <button key={a.slug} type="button" title={a.name} aria-label={a.name} aria-pressed={value === a.slug} data-dim={value != null && value !== a.slug} onClick={() => onChange(value === a.slug ? null : a.slug)}>
          <AppIcon slug={a.slug} size={26} />
        </button>
      ))}
      <button type="button" title="Otto (ottoknows.it)" aria-label="Otto" aria-pressed={value === "otto"} data-dim={value != null && value !== "otto"} onClick={() => onChange(value === "otto" ? null : "otto")}>
        <AppIcon slug="otto" size={26} />
      </button>
    </div>
  );
}

/* ---------- Badges ---------- */
export type Status = "good" | "warning" | "critical" | "neutral";

export function Badge({ status = "neutral", children, icon = true }: { status?: Status; children: ReactNode; icon?: boolean }) {
  const Icon = status === "good" ? CheckCircle2 : status === "warning" ? AlertTriangle : status === "critical" ? XCircle : Info;
  return (
    <span className={`badge${status !== "neutral" ? ` badge--${status}` : ""}`}>
      {icon && <Icon />}
      {children}
    </span>
  );
}

/* ---------- Empty / error states ---------- */
export function EmptyState({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Database />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Shown when a source is not connected yet: says exactly what is missing. */
export function NotConnected({ source, missing, children }: { source: string; missing: string; children?: ReactNode }) {
  return (
    <EmptyState title={`${source} n'est pas encore branché`} icon={<PlugZap />}>
      Il manque : {missing}. {children}
    </EmptyState>
  );
}

export function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="skeleton" style={{ height, width: "100%" }} />;
}

/* ---------- Source footnote ---------- */
export function SourceNote({ source, updatedAt }: { source: string; updatedAt?: number | null }) {
  return (
    <div className="source-note">
      <Database />
      <span>
        {source}
        {updatedAt !== undefined && <> · mis à jour {formatAgo(updatedAt)}</>}
      </span>
    </div>
  );
}

/* ---------- Table ---------- */
export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  width?: number | string;
};

export function DataTable<Row>({ columns, rows, rowKey, empty, maxRows }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; empty?: ReactNode; maxRows?: number }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Aucune donnée sur la période" />}</>;
  const shown = maxRows ? rows.slice(0, maxRows) : rows;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "r" : undefined} style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? "r" : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
