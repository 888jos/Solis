import { Landmark, RefreshCw, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, Kpi, KpiSkeleton, PageHeader, Skeleton } from "@/ui";
import { useSourcesViewModel, type SourceItem } from "./useSourcesViewModel";
import "./sources.css";

function SourceRow({ item, onRun }: { item: SourceItem; onRun: () => void }) {
  return (
    <li className="src-row">
      <div className="src-row__main">
        <div className="src-row__name">{item.name}</div>
        <div className="src-row__feeds">{item.feeds}</div>
      </div>
      <div className="src-row__status">
        <Badge status={item.badge.status}>{item.badge.label}</Badge>
      </div>
      <div className="src-row__fresh" title={item.lastOkTitle}>
        <span className="src-row__k">Dernier succès</span>
        <span className="num">{item.lastOk}</span>
        {item.rows && <span className="muted num"> · {item.rows}</span>}
      </div>
      <div className="src-row__cadence">
        <span className="src-row__k">Cadence</span>
        {item.cadence}
      </div>
      <div className="src-row__action">
        {item.job && (
          <button type="button" className="btn" onClick={onRun} disabled={item.busy || !item.canRun} aria-label={`${item.actionLabel} : ${item.name}`} title={item.actionLabel}>
            {item.job === "brief" ? <Send /> : <RefreshCw className={item.busy ? "src-spin" : undefined} />}
            <span className="src-btn-label">{item.busy ? (item.job === "brief" ? "Envoi…" : "Synchro…") : item.actionLabel}</span>
          </button>
        )}
      </div>
      {(item.problem || item.history) && (
        <div className={`src-row__msg${item.problem ? ` src-row__msg--${item.problemTone}` : ""}`} title={item.problem ?? item.history ?? undefined}>
          {item.problem ?? item.history}
        </div>
      )}
    </li>
  );
}

function SourceHead({ fresh = "Dernier succès" }: { fresh?: string }) {
  return (
    <li className="src-row src-row--head" aria-hidden="true">
      <div className="src-row__main">Source</div>
      <div className="src-row__status">Statut</div>
      <div className="src-row__fresh">{fresh}</div>
      <div className="src-row__cadence">Cadence</div>
      <div className="src-row__action" />
    </li>
  );
}

export default function SourcesPage() {
  const vm = useSourcesViewModel();
  const v = vm.view;

  const header = (
    <PageHeader
      title="Sources"
      subtitle="Chaque synchro, son dernier succès et ses erreurs"
      actions={
        <button type="button" className="btn btn--primary" onClick={vm.runAll} disabled={!v || v.allBusy}>
          <RefreshCw className={v?.allBusy ? "src-spin" : undefined} />
          Tout synchroniser
        </button>
      }
    />
  );

  if (vm.loading || !v) {
    return (
      <div className="stack f-sources">
        {header}
        <KpiSkeleton count={4} />
        <Skeleton height={420} />
      </div>
    );
  }

  return (
    <div className="stack f-sources">
      {header}
      {(vm.error || vm.notice) && <div className={`src-flash${vm.error ? " src-flash--error" : ""}`}>{vm.error ?? vm.notice}</div>}

      <div className="grid grid--kpi">
        <Kpi label="Sources à jour" value={v.kpis.ok} />
        <Kpi label="À regarder" value={v.kpis.failing} foot="erreur, retard ou interrompue" />
        <Kpi label="Pas configurées" value={v.kpis.notConfigured} foot="clé manquante" />
        <Kpi label="Dernière synchro" value={v.kpis.lastRun} />
      </div>

      <Card title="Quelles sources sont à jour ?" subtitle="Statut de la dernière synchro de chaque source (table syncRuns)" flush>
        <ul className="src-list">
          <SourceHead />
          {v.items.map((item) => (
            <SourceRow key={item.key} item={item} onRun={() => item.job && vm.run(item.job)} />
          ))}
        </ul>
      </Card>

      <Card title="Relevés bancaires importés ?" subtitle="Import manuel du CSV de la banque, pas de synchro automatique" flush>
        <ul className="src-list">
          <SourceHead fresh="Dernier import" />
          <li className="src-row">
            <div className="src-row__main">
              <div className="src-row__name">
                <Landmark size={14} className="src-row__icon" />
                Banque · CSV
              </div>
              <div className="src-row__feeds">Dépenses, Rentabilité</div>
            </div>
            <div className="src-row__status">
              <Badge status={v.bank.badge.status}>{v.bank.badge.label}</Badge>
            </div>
            <div className="src-row__fresh">
              <span className="src-row__k">Dernier import</span>
              <span className="num">{v.bank.lastImport}</span>
              {v.bank.imports > 0 && <span className="muted num"> · {v.bank.imports} fichier{v.bank.imports > 1 ? "s" : ""}</span>}
            </div>
            <div className="src-row__cadence">
              <span className="src-row__k">Cadence</span>à la main
            </div>
            <div className="src-row__action">
              <Link className="btn" to="/depenses">
                Importer
              </Link>
            </div>
            <div className="src-row__msg">{v.bank.detail}</div>
          </li>
        </ul>
      </Card>
    </div>
  );
}
