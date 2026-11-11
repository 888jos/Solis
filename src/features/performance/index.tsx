import { ExternalLink, Heart, MessageCircle, Play, Repeat2, X } from "lucide-react";
import { useEffect } from "react";
import { formatCompact, formatInt } from "@/lib/format";
import { Card, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Segmented, Skeleton, TimeChart } from "@/ui";
import { usePerformanceViewModel, type PerformanceViewModel } from "./usePerformanceViewModel";
import "./performance.css";

function Filters({ f }: { f: ReturnType<typeof usePerformanceViewModel>["filters"] }) {
  return (
    <div className="pf-filters">
      <Segmented label="Projet" value={f.project} options={f.projects} onChange={f.onProject} />
      <select className="select" value={f.platform} onChange={(e) => f.onPlatform(e.target.value)} aria-label="Plateforme">
        {f.platforms.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <select className="select" value={f.account} onChange={(e) => f.onAccount(e.target.value)} aria-label="Compte">
        {f.accounts.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      <Segmented label="Comptage des vues" value={f.mode} options={f.modes} onChange={f.onMode} />
    </div>
  );
}

function Preview({ vm }: { vm: PerformanceViewModel }) {
  const v = vm.preview;
  useEffect(() => {
    if (!v) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && vm.closePreview();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v, vm]);
  if (!v) return null;
  return (
    <div className="pf-modal" role="dialog" aria-modal="true" aria-label={`Vidéo de @${v.account}`} onClick={vm.closePreview}>
      <div className="pf-modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="pf-modal__head">
          <strong>
            @{v.account} · {v.platformName}
          </strong>
          <span className="pf-muted">{v.date}</span>
          <button type="button" className="btn btn--ghost" onClick={vm.closePreview} aria-label="Fermer">
            <X />
          </button>
        </div>
        <div className="pf-modal__player">
          {v.mediaUrl ? (
            <video src={v.mediaUrl} controls autoPlay playsInline poster={v.thumbnailUrl ?? undefined} />
          ) : v.embed ? (
            <iframe src={v.embed} title={`Vidéo de @${v.account}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <EmptyState title="Pas d'aperçu disponible">Ouvre la vidéo sur la plateforme.</EmptyState>
          )}
        </div>
        <div className="pf-modal__stats num">
          <span>{formatInt(v.views)} vues</span>
          <span>{formatInt(v.likes)} likes</span>
          <span>{formatInt(v.comments)} comm.</span>
          <span>{formatInt(v.shares)} partages</span>
          <span>engagement {v.engagementLabel}</span>
        </div>
        {v.caption && <p className="pf-modal__caption">{v.caption}</p>}
        {v.url && (
          <a className="btn" href={v.url} target="_blank" rel="noreferrer">
            <ExternalLink /> Ouvrir sur {v.platformName}
          </a>
        )}
      </div>
    </div>
  );
}

function VideoGrid({ vm }: { vm: PerformanceViewModel }) {
  if (!vm.top.length) return <EmptyState title="Aucune vidéo publiée sur la période" />;
  return (
    <div className="pf-grid">
      {vm.top.map((v, i) => (
        <button key={v.key} type="button" className="pf-video" onClick={v.open} aria-label={`Voir la vidéo de @${v.account}, ${formatInt(v.views)} vues`}>
          <div className="pf-video__thumb">
            {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className={`pf-video__ph pf-video__ph--${v.platform}`}>{v.platformName}</div>}
            <span className="pf-video__rank">#{i + 1}</span>
            <span className="pf-video__views num">
              <Play size={11} /> {v.viewsLabel}
            </span>
          </div>
          <div className="pf-video__meta">
            <span className="pf-video__acc">
              @{v.account} · {v.platformName}
            </span>
            <span className="pf-video__cap">{v.caption ?? "—"}</span>
            <span className="pf-video__eng num">
              <Heart size={11} /> {formatCompact(v.likes)} <MessageCircle size={11} /> {formatCompact(v.comments)} <Repeat2 size={11} /> {formatCompact(v.shares)}
              <span className="pf-muted"> · {v.date}</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Accounts({ vm }: { vm: PerformanceViewModel }) {
  return (
    <div className="pf-table-wrap">
      <table className="table pf-table">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Projet</th>
            <th className="num">Vidéos</th>
            <th className="num">Vues</th>
            <th className="num">Médiane</th>
            <th className="num pf-hide-sm">Meilleure</th>
            <th className="num pf-hide-sm">Comm.</th>
            <th className="num">Engag.</th>
          </tr>
        </thead>
        <tbody>
          {vm.accounts.map((a) => (
            <tr key={a.id}>
              <td>
                <span className="pf-acc">
                  {a.avatarUrl ? <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="pf-acc__dot" />}
                  <span>
                    @{a.username}
                    <small className="pf-muted"> {a.platformName}</small>
                  </span>
                </span>
              </td>
              <td>
                <select className="select pf-proj" value={a.project ?? "none"} onChange={(e) => void a.onProject(e.target.value)} aria-label={`Projet de @${a.username}`}>
                  {vm.projectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="num">{a.posts}</td>
              <td className="num">
                <strong>{a.viewsLabel}</strong>
              </td>
              <td className="num">{a.medianLabel}</td>
              <td className="num pf-hide-sm">{a.bestLabel}</td>
              <td className="num pf-hide-sm">{formatInt(a.comments)}</td>
              <td className="num">{a.engagementLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PerformancePage() {
  const vm = usePerformanceViewModel();

  if (vm.loading) {
    return (
      <div className="f-performance">
        <PageHeader title="Performance" subtitle={vm.periodLabel} />
        <Filters f={vm.filters} />
        <KpiSkeleton count={4} />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!vm.connected) {
    return (
      <div className="f-performance">
        <PageHeader title="Performance" subtitle="Vues, publications et engagement de tous tes comptes" />
        <Card>
          <NotConnected source="Post for Me" missing={vm.lastSync?.status === "skipped" ? "POSTFORME_API_KEY dans les variables Convex" : "une première synchro (page Sources)"} />
        </Card>
      </div>
    );
  }

  return (
    <div className="f-performance">
      <PageHeader title="Performance" subtitle={vm.subtitle} />
      <Filters f={vm.filters} />
      {vm.filters.mode === "gained" && vm.trackingSince && <p className="pf-note">Vues gagnées comptées depuis le {vm.trackingSince} (premier relevé Post for Me). Pour l'historique complet, passe en « Par date de publication ».</p>}
      {vm.unassigned > 0 && <p className="pf-note pf-note--warn">{vm.unassigned} compte(s) à attribuer à un projet : en bas de page.</p>}

      <div className="grid grid--kpi">
        {vm.kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} />
        ))}
      </div>

      <div className="grid grid--main-side">
        <Card title="Combien de vues, sur quelle plateforme ?" subtitle={vm.filters.mode === "gained" ? "Vues gagnées chaque jour, toutes vidéos confondues" : "Vues totales des vidéos, au jour de leur publication"}>
          <TimeChart kind="bar" x={vm.x} series={vm.viewsChart} height={260} formatValue={formatCompact} formatX={vm.formatX} formatXLong={vm.formatXLong} showTotal />
        </Card>
        <Card title="Combien de vidéos publiées ?" subtitle="Par jour de publication">
          <TimeChart kind="bar" x={vm.x} series={vm.postsChart} height={260} legend={false} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} />
        </Card>
      </div>

      <Card title={`Les vues se transforment-elles en ${vm.outcome.label.toLowerCase()} ?`} subtitle="Mêmes jours, une courbe sous l'autre (pas de double axe)">
        <div className="pf-outcome">
          <div className="pf-outcome__stats">
            <div>
              <div className="pf-big num">{vm.outcome.perThousand}</div>
              <div className="pf-muted">{vm.outcome.label.toLowerCase()} pour 1 000 vues</div>
            </div>
            <div>
              <div className="pf-big num">{vm.outcome.total}</div>
              <div className="pf-muted">{vm.outcome.label.toLowerCase()} sur la période</div>
            </div>
            <div className="pf-muted">
              Lien jour par jour : {vm.outcome.sameDay}
              <br />
              Avec un jour de décalage : {vm.outcome.nextDay}
            </div>
          </div>
          <div className="pf-outcome__charts">
            <div className="pf-chart-label">Vues</div>
            <TimeChart kind="bar" x={vm.x} series={vm.outcome.viewsChart} height={130} legend={false} formatValue={formatCompact} formatX={vm.formatX} formatXLong={vm.formatXLong} />
            <div className="pf-chart-label">{vm.outcome.label}</div>
            <TimeChart kind="bar" x={vm.x} series={vm.outcome.chart} height={130} legend={false} formatValue={formatInt} formatX={vm.formatX} formatXLong={vm.formatXLong} />
          </div>
        </div>
      </Card>

      <Card title="Quelles vidéos marchent le mieux ?" subtitle="Publiées sur la période, triées par vues · cliquer pour voir la vidéo">
        <VideoGrid vm={vm} />
      </Card>

      <Card title="Quel compte performe ?" subtitle="Vues et engagement sur la période · choisis le projet de chaque compte" flush>
        <Accounts vm={vm} />
      </Card>

      <p className="pf-muted pf-source">
        Source : Post for Me (comptes connectés), relevé toutes les 3 h{vm.lastSync?.message ? ` · ${vm.lastSync.message}` : ""}. Installs : rapports Sales Apple ; Otto : rapports générés.
      </p>

      <Preview vm={vm} />
    </div>
  );
}
