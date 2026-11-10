import { CheckCircle2, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Delta, EmptyState, KpiSkeleton, PageHeader, Skeleton } from "@/ui";
import { useTodayViewModel, type TodayViewModel } from "./useTodayViewModel";
import "./today.css";

function Dot({ color }: { color: string }) {
  return <span className="app-dot" style={{ background: color }} />;
}

function Actions({ vm }: { vm: TodayViewModel }) {
  if (!vm.actions.length) return <EmptyState title="Rien à faire d'urgent" icon={<CheckCircle2 />} />;
  return (
    <ul className="td-list">
      {vm.actions.map((a) => (
        <li key={a.key}>
          <Link to={a.href} className="td-action">
            <Badge status={a.badge.status} icon={a.badge.status !== "neutral"}>
              {a.badge.label}
            </Badge>
            <span className="td-action__text">
              <span className="td-action__title">{a.title}</span>
              {a.detail && <span className="td-muted">{a.detail}</span>}
            </span>
            <ChevronRight size={15} className="td-chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Pulse({ vm }: { vm: TodayViewModel }) {
  return (
    <div className="td-pulse">
      {vm.pulse.map((p) => (
        <div key={p.key} className="td-pulse__item">
          <div className="td-pulse__head">
            <Dot color={p.color} />
            {p.name} · {p.label}
          </div>
          <div className="td-pulse__value num">{p.value}</div>
          <div className="td-pulse__foot">
            <Delta value={p.delta} />
            <span>{p.foot}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalForm({ vm }: { vm: TodayViewModel }) {
  const [project, setProject] = useState("studio");
  const metrics = vm.metricsFor(project);
  const [metric, setMetric] = useState(metrics[0]?.key ?? "net");
  const [target, setTarget] = useState("");
  const unit = metrics.find((m) => m.key === metric)?.unit;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(target.replace(",", "."));
    if (!Number.isFinite(n)) return;
    if (await vm.onSetGoal(project, metric, n)) setTarget("");
  };
  return (
    <form className="td-form" onSubmit={submit}>
      <select
        className="select"
        value={project}
        aria-label="Projet"
        onChange={(e) => {
          setProject(e.target.value);
          setMetric(vm.metricsFor(e.target.value)[0]?.key ?? "net");
        }}
      >
        {vm.projects.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <select className="select" value={metric} aria-label="Indicateur" onChange={(e) => setMetric(e.target.value)}>
        {metrics.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
      <input className="input td-form__num" inputMode="decimal" placeholder={unit === "pct" ? "Cible en %" : unit === "eur" ? "Cible en €" : "Cible"} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Cible" />
      <button type="submit" className="btn btn--primary" disabled={!target.trim()}>
        <Plus /> Fixer
      </button>
    </form>
  );
}

function Goals({ vm }: { vm: TodayViewModel }) {
  return (
    <>
      {vm.goals.length ? (
        <ul className="td-list">
          {vm.goals.map((g) => (
            <li key={g.id} className="td-goal">
              <div className="td-goal__head">
                <span className="td-goal__name">
                  <Dot color={g.color} />
                  {g.name} · {g.metric}
                </span>
                <Badge status={g.status} icon={false}>
                  {g.statusLabel}
                </Badge>
              </div>
              <div className="td-bar" role="img" aria-label={`Projection ${g.projection} pour une cible de ${g.target}`}>
                <span className={`td-bar__fill td-bar__fill--${g.status}`} style={{ width: `${Math.min(100, (g.pct ?? 0) * 100)}%` }} />
              </div>
              <div className="td-goal__foot">
                <span className="num">
                  {g.value} aujourd'hui · projection {g.projection} · cible {g.target}
                </span>
                <span className="td-muted">{g.foot}</span>
                <button type="button" className="btn btn--ghost td-icon" aria-label="Supprimer l'objectif" onClick={() => vm.onRemoveGoal(g.id)}>
                  <Trash2 />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="td-empty">Aucun objectif pour {vm.monthLabel}. Fixe 2 ou 3 cibles : elles alimentent les actions du jour.</p>
      )}
      <GoalForm vm={vm} />
    </>
  );
}

function ExperimentForm({ vm }: { vm: TodayViewModel }) {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState("otto");
  const metrics = vm.metricsFor(project);
  const [metric, setMetric] = useState(metrics[0]?.key ?? "net");
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [startDay, setStart] = useState(vm.todayIso);
  const [endDay, setEnd] = useState(vm.todayIso);
  if (!open)
    return (
      <button type="button" className="btn td-add" onClick={() => setOpen(true)}>
        <Plus /> Nouvelle expérience
      </button>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await vm.onAddExperiment({ project, metric, title, hypothesis, startDay, endDay })) {
      setTitle("");
      setHypothesis("");
      setOpen(false);
    }
  };
  return (
    <form className="td-form td-form--stack" onSubmit={submit}>
      <input className="input" placeholder="Titre (ex. Offre à 7,90 €)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre" />
      <input className="input" placeholder="Hypothèse : si je fais X, alors Y monte parce que Z" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} aria-label="Hypothèse" />
      <div className="td-form">
        <select
          className="select"
          value={project}
          aria-label="Projet"
          onChange={(e) => {
            setProject(e.target.value);
            setMetric(vm.metricsFor(e.target.value)[0]?.key ?? "net");
          }}
        >
          {vm.projects.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="select" value={metric} aria-label="Indicateur mesuré" onChange={(e) => setMetric(e.target.value)}>
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <input className="input" type="date" value={startDay} onChange={(e) => setStart(e.target.value)} aria-label="Début" />
        <input className="input" type="date" value={endDay} onChange={(e) => setEnd(e.target.value)} aria-label="Fin prévue" />
      </div>
      <div className="td-form">
        <button type="submit" className="btn btn--primary" disabled={!title.trim()}>
          Lancer
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Experiments({ vm }: { vm: TodayViewModel }) {
  return (
    <>
      {vm.experiments.length ? (
        <ul className="td-list">
          {vm.experiments.map((x) => (
            <li key={x.id} className="td-exp">
              <div className="td-goal__head">
                <span className="td-goal__name">
                  <Dot color={x.color} />
                  {x.title}
                </span>
                {x.running ? (
                  <Badge status={x.overdue ? "warning" : "neutral"} icon={false}>
                    {x.overdue ? "À trancher" : "En cours"}
                  </Badge>
                ) : (
                  <Badge status="good" icon={false}>
                    {x.decision}
                  </Badge>
                )}
              </div>
              {x.hypothesis && <p className="td-muted td-exp__hyp">{x.hypothesis}</p>}
              <div className="td-exp__result">
                <span className="td-muted">
                  {x.name} · {x.metric} · {x.period}
                </span>
                <span className="num">
                  avant {x.before} → pendant {x.after} <Delta value={x.delta} />
                </span>
                <span className="td-muted">{x.measured}</span>
              </div>
              {x.note && <p className="td-exp__hyp">Décision : {x.note}</p>}
              <div className="td-form">
                {x.running && (
                  <>
                    <button type="button" className="btn" onClick={() => vm.onDecide(x.id, "keep")}>
                      Garder
                    </button>
                    <button type="button" className="btn" onClick={() => vm.onDecide(x.id, "drop")}>
                      Abandonner
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => vm.onDecide(x.id, "inconclusive")}>
                      Pas concluant
                    </button>
                  </>
                )}
                <button type="button" className="btn btn--ghost td-icon" aria-label="Supprimer l'expérience" onClick={() => vm.onRemoveExperiment(x.id)}>
                  <Trash2 />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="td-empty">Aucune expérience. Chaque changement (prix, paywall, hooks, horaires) mérite une ligne : le résultat se calcule tout seul.</p>
      )}
      <ExperimentForm vm={vm} />
    </>
  );
}

function Timeline({ vm }: { vm: TodayViewModel }) {
  const [day, setDay] = useState(vm.todayIso);
  const [project, setProject] = useState("studio");
  const [kind, setKind] = useState<"price" | "campaign" | "content" | "product" | "other">("campaign");
  const [label, setLabel] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await vm.onAddAnnotation({ day, project, kind, label })) setLabel("");
  };
  return (
    <>
      <form className="td-form" onSubmit={submit}>
        <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
        <select className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projet">
          {vm.projects.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Type">
          {vm.kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input className="input td-form__grow" placeholder="Ce qui s'est passé (ex. lancement Meta Ads 50 €/j)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Événement" />
        <button type="submit" className="btn btn--primary" disabled={!label.trim()}>
          <Plus /> Noter
        </button>
      </form>
      {vm.timeline.length ? (
        <ul className="td-list td-timeline">
          {vm.timeline.map((t) => (
            <li key={t.key}>
              <span className="td-muted num">{t.day}</span>
              <span className="td-goal__name">
                <Dot color={t.color} />
                {t.name}
              </span>
              <span className="td-muted">{t.kind}</span>
              <span>{t.label}</span>
              {t.id && (
                <button type="button" className="btn btn--ghost td-icon" aria-label="Supprimer" onClick={() => vm.onRemoveAnnotation(t.id!)}>
                  <Trash2 />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="td-empty">Rien sur les 60 derniers jours.</p>
      )}
    </>
  );
}

export default function TodayPage() {
  const vm = useTodayViewModel();
  if (vm.loading) {
    return (
      <div className="f-today">
        <PageHeader title="Aujourd'hui" />
        <KpiSkeleton count={4} />
        <Skeleton height={260} />
      </div>
    );
  }
  return (
    <div className="f-today">
      <PageHeader title="Aujourd'hui" subtitle={vm.subtitle} />
      {vm.error && (
        <div className="td-error" role="alert">
          {vm.error}
          <button type="button" className="btn btn--ghost" onClick={vm.clearError}>
            OK
          </button>
        </div>
      )}
      <div className="grid grid--main-side">
        <Card title="Que dois-je faire aujourd'hui ?" subtitle="Calculé depuis les sources, les objectifs et les expériences" flush>
          <Actions vm={vm} />
        </Card>
        <Card title="Comment s'est passé le dernier jour ?" subtitle="Comparé au même jour la semaine d'avant">
          <Pulse vm={vm} />
        </Card>
      </div>
      <Card
        title="Que retenir de la semaine ?"
        subtitle={vm.review ? `${vm.review.title} · écrite par Claude chaque lundi, à partir des chiffres` : "Écrite par Claude chaque lundi, à partir des chiffres de la semaine"}
        action={
          <button type="button" className="btn" onClick={vm.onWriteReview} disabled={vm.reviewBusy}>
            {vm.reviewBusy ? "Rédaction…" : "Écrire maintenant"}
          </button>
        }
      >
        {vm.review ? <p className="td-review">{vm.review.text}</p> : <p className="td-empty">Pas encore de revue. La première arrive lundi prochain (ou maintenant, avec le bouton).</p>}
      </Card>
      <div id="objectifs">
        <Card title={`Suis-je dans les clous pour ${vm.monthLabel} ?`} subtitle="Valeur du mois, projection en fin de mois au rythme actuel, cible">
          <Goals vm={vm} />
        </Card>
      </div>
      <div id="experiences">
        <Card title="Qu'est-ce que je teste, et ça marche ?" subtitle="Même nombre de jours avant et pendant, calculé sur les données réelles">
          <Experiments vm={vm} />
        </Card>
      </div>
      <Card title="Que s'est-il passé ?" subtitle="Tes annotations et les sorties de version, 60 derniers jours">
        <Timeline vm={vm} />
      </Card>
    </div>
  );
}
