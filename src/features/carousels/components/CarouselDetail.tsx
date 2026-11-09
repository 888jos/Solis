import { ArrowLeft, Check, Copy, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card } from "@/ui";
import { SHORTCUTS, type ReviewAction, type useCarouselsViewModel } from "../useCarouselsViewModel";

type VM = ReturnType<typeof useCarouselsViewModel>;
type Detail = NonNullable<VM["detail"]>;

const BUTTONS: { action: ReviewAction; label: string; key: string; tone: string; Icon: typeof Check }[] = [
  { action: "ok", label: "Valider", key: "V", tone: "good", Icon: Check },
  { action: "redo", label: "Refaire", key: "R", tone: "warning", Icon: RotateCcw },
  { action: "no", label: "Rejeter", key: "X", tone: "critical", Icon: X },
];

export function CarouselDetail({ detail, review, onClose, onEdit }: { detail: Detail; review: VM["review"]; onClose: () => void; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);

  // V / R / X review shortcuts, ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return;
      const action = SHORTCUTS[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        void review.decide(action);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [review]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detail.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused: the text stays selectable */
    }
  };

  return (
    <>
      <div className="cr-detail-head">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          <ArrowLeft />
          Carrousels
        </button>
        <div className="cr-detail-head__text">
          <h2>{detail.title}</h2>
          <p className="muted">{detail.meta}</p>
        </div>
        <Badge status={detail.status.tone}>{detail.status.label}</Badge>
        <button type="button" className="btn" onClick={onEdit}>
          <Pencil />
          Modifier
        </button>
      </div>

      <div className="cr-detail">
        <div className="cr-strip" tabIndex={0} aria-label="Slides">
          {detail.slides.map((src, i) => (
            <figure key={src} className="cr-slide">
              <a href={src} target="_blank" rel="noreferrer">
                <img src={src} alt={`Slide ${i + 1}`} loading={i > 2 ? "lazy" : undefined} />
              </a>
              <figcaption className="num">
                {i + 1}/{detail.slides.length}
              </figcaption>
            </figure>
          ))}
          {!detail.slides.length && <p className="muted">Les images n'ont pas encore été envoyées depuis le Mac.</p>}
        </div>

        <div className="cr-panel">
          <Card title="Validation" subtitle={detail.pendingSync ? "Décision prise ici : appliquée sur le Mac à la prochaine synchro" : "Même effet que les boutons Telegram"}>
            <div className="cr-actions">
              {BUTTONS.map(({ action, label, key, tone, Icon }) => (
                <button
                  key={action}
                  type="button"
                  className={`btn cr-btn cr-btn--${tone}`}
                  onClick={() => void review.decide(action)}
                  disabled={!!review.busy}
                  aria-keyshortcuts={key}
                >
                  <Icon />
                  {label}
                  <kbd>{key}</kbd>
                </button>
              ))}
            </div>
            <label className="cr-check">
              <input type="checkbox" checked={review.advance} onChange={(e) => review.setAdvance(e.target.checked)} />
              Passer au suivant à valider
            </label>
            {review.error && <p className="cr-error">{review.error}</p>}
            <p className="muted cr-hint">
              {detail.toReview ? `${detail.toReview} autre${detail.toReview > 1 ? "s" : ""} à valider. ` : "Rien d'autre à valider. "}
              {detail.nextHref && <Link to={detail.nextHref}>Suivant →</Link>}
            </p>
            <p className="muted cr-hint">Rien n'est publié d'ici : la publication reste sur le Mac (cf publish).</p>
          </Card>

          {detail.caption && (
            <Card
              title="Légende"
              action={
                <button type="button" className="btn" onClick={copy}>
                  <Copy />
                  {copied ? "Copié" : "Copier"}
                </button>
              }
            >
              <pre className="cr-caption">{detail.caption}</pre>
            </Card>
          )}

          <Card title="Contrôle qualité" action={<Badge status={detail.qa.tone}>{detail.qa.label}</Badge>}>
            {detail.issues.length ? (
              <ul className="cr-issues">
                {detail.issues.map((i) => (
                  <li key={i.key} className={`cr-issue cr-issue--${i.tone}`}>
                    {i.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aucun problème relevé.</p>
            )}
          </Card>

          {detail.plan.length > 0 && (
            <Card title="Plan">
              <dl className="cr-kv">
                {detail.plan.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {detail.scores.length > 0 && (
            <Card title="Notes de Claude" subtitle="Auto-évaluation après le 2e jet, sur 10">
              <ul className="cr-scores">
                {detail.scores.map((s) => (
                  <li key={s.key}>
                    <span>{s.label}</span>
                    <span className="cr-scores__track">
                      <span className="cr-scores__fill" style={{ width: `${s.pct}%` }} />
                    </span>
                    <strong className="num">{s.value}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {detail.hookOptions.length > 0 && (
            <Card title="Hooks proposés">
              <ol className="cr-list">
                {detail.hookOptions.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
