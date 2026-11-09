import { ArrowLeft, ImageIcon, RotateCcw, Save, X } from "lucide-react";
import { Badge, Card, EmptyState } from "@/ui";
import { SWATCHES, useCarouselEditorViewModel } from "../useCarouselEditorViewModel";

type EVM = ReturnType<typeof useCarouselEditorViewModel>;

export function CarouselEditorScreen({ detail, onClose }: { detail: Parameters<typeof useCarouselEditorViewModel>[0]; onClose: () => void }) {
  const vm = useCarouselEditorViewModel(detail);
  return <CarouselEditor vm={vm} onClose={onClose} />;
}
type Field = EVM["slideFields"][number];

function FieldInput({ f, onChange }: { f: Field; onChange: (path: string, value: string) => void }) {
  if (f.kind === "choice") {
    return (
      <label className="ce-field">
        <span>{f.label}</span>
        <select className="select" value={f.current} onChange={(e) => onChange(f.path, e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const rows = Math.min(6, Math.max(2, f.current.split("\n").length + 1));
  return (
    <label className={`ce-field${f.changed ? " ce-field--changed" : ""}`}>
      <span>{f.label}</span>
      {f.multiline ? (
        <textarea className="input" rows={rows} value={f.current} onChange={(e) => onChange(f.path, e.target.value)} />
      ) : (
        <input className="input" value={f.current} onChange={(e) => onChange(f.path, e.target.value)} />
      )}
    </label>
  );
}

export function CarouselEditor({ vm, onClose }: { vm: EVM; onClose: () => void }) {
  const head = (
    <div className="cr-detail-head">
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        <ArrowLeft />
        Retour
      </button>
      <div className="cr-detail-head__text">
        <h2>Modifier · {vm.title}</h2>
        <p className="muted">Slide {vm.slide + 1}/{vm.slides.length} · les modifications sont gardées pour les rendus suivants</p>
      </div>
      {vm.dirty && (
        <button type="button" className="btn" onClick={vm.discard} disabled={vm.saving}>
          <RotateCcw />
          Annuler
        </button>
      )}
      <button type="button" className="btn btn--primary" onClick={() => void vm.save()} disabled={!vm.dirty || vm.saving}>
        <Save />
        {vm.saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );

  if (!vm.ready) {
    return (
      <>
        {head}
        <div className="card">
          <EmptyState title="Pas encore modifiable">
            Ce carrousel n'a pas encore reçu ses données d'édition : elles arrivent avec la prochaine synchro du Mac (cf sync).
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      {vm.status && (
        <p className={`ce-status ce-status--${vm.status.tone}`} role="status">
          {vm.status.text}
        </p>
      )}
      {vm.error && <p className="cr-error">{vm.error}</p>}

      <div className="ce-layout">
        <div className="ce-stage">
          {vm.preview ? <img className="ce-preview" src={vm.preview} alt={`Slide ${vm.slide + 1}`} /> : <p className="muted">Pas d'image.</p>}
          <div className="ce-thumbs" role="tablist" aria-label="Slides">
            {vm.slides.map((s) => (
              <button
                key={s.src}
                type="button"
                role="tab"
                aria-selected={s.index === vm.slide}
                className={`ce-thumb${s.index === vm.slide ? " is-active" : ""}`}
                onClick={() => vm.setSlide(s.index)}
              >
                <img src={s.src} alt={`Slide ${s.index + 1}`} loading="lazy" />
                <span className="num">{s.index + 1}</span>
                {s.edited && <i className="ce-dot" aria-label="modifiée" />}
              </button>
            ))}
          </div>
        </div>

        <div className="cr-panel">
          <Card title={`Textes · slide ${vm.slide + 1}`}>
            {vm.slideFields.length ? (
              <div className="stack ce-fields">
                {vm.slideFields.map((f) => (
                  <FieldInput key={f.path} f={f} onChange={vm.setText} />
                ))}
              </div>
            ) : (
              <p className="muted">Aucun texte propre à cette slide (voir « Tout le carrousel » plus bas).</p>
            )}
          </Card>

          <Card
            title="Style du texte"
            subtitle="Pour tous les textes de cette slide"
            action={
              <button type="button" className="btn btn--ghost" onClick={vm.resetStyle}>
                Par défaut
              </button>
            }
          >
            <div className="stack ce-fields">
              <label className="ce-field">
                <span>Police</span>
                <select className="select" value={vm.style.font} onChange={(e) => vm.setStyle({ font: e.target.value || undefined })}>
                  <option value="">Celle du modèle</option>
                  {vm.fonts.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ce-field">
                <span>
                  Taille <strong className="num">{Math.round(vm.style.scale * 100)} %</strong>
                </span>
                <input
                  type="range"
                  min={vm.scaleRange[0]}
                  max={vm.scaleRange[1]}
                  step={0.05}
                  value={vm.style.scale}
                  onChange={(e) => vm.setStyle({ scale: Number(e.target.value) })}
                />
              </label>
              <div className="ce-field">
                <span>Couleur</span>
                <div className="ce-swatches">
                  <button type="button" className={`ce-swatch ce-swatch--auto${!vm.style.color ? " is-active" : ""}`} onClick={() => vm.setStyle({ color: undefined })}>
                    Auto
                  </button>
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`ce-swatch${vm.style.color === c ? " is-active" : ""}`}
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => vm.setStyle({ color: c })}
                    />
                  ))}
                  <input type="color" aria-label="Autre couleur" value={vm.style.color || "#ffffff"} onChange={(e) => vm.setStyle({ color: e.target.value })} />
                </div>
              </div>
              {vm.styleChanged && <p className="muted ce-hint">Style modifié, à enregistrer.</p>}
            </div>
          </Card>

          {vm.slots.length > 0 && (
            <Card title="Photo" subtitle="Remplacer par une photo de la banque">
              <div className="ce-slots">
                {vm.slots.map((s) => (
                  <div key={s.slot} className="ce-slot">
                    {s.url ? <img src={s.url} alt={s.name} /> : <div className="ce-slot__none"><ImageIcon /></div>}
                    <div>
                      <p className="ce-slot__name">{s.name || "Vignette pas encore envoyée"}</p>
                      {s.changed && <Badge status="warning">Nouvelle, à enregistrer</Badge>}
                      <button type="button" className="btn" onClick={() => vm.openPicker(s.slot)}>
                        Remplacer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {vm.globalFields.length > 0 && (
            <Card title="Tout le carrousel">
              <div className="stack ce-fields">
                {vm.globalFields.map((f) => (
                  <FieldInput key={f.path} f={f} onChange={vm.setText} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {vm.picker && (
        <div className="ce-modal" role="dialog" aria-modal="true" aria-label="Choisir une photo" onClick={vm.picker.close}>
          <div className="ce-modal__box card" onClick={(e) => e.stopPropagation()}>
            <div className="card__head">
              <h2 className="card__title">Choisir une photo</h2>
              <button type="button" className="btn btn--ghost" onClick={vm.picker.close} aria-label="Fermer">
                <X />
              </button>
            </div>
            <select className="select" value={vm.picker.category} onChange={(e) => vm.picker?.setCategory(e.target.value)}>
              {vm.picker.categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {vm.picker.loading ? (
              <p className="muted">Chargement…</p>
            ) : vm.picker.images.length ? (
              <div className="ce-grid">
                {vm.picker.images.map((i) => (
                  <button key={i.imageId} type="button" className={`ce-pick${i.current ? " is-active" : ""}`} onClick={() => vm.picker?.choose(i.imageId)} title={i.name}>
                    <img src={i.url} alt={i.name} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">Aucune vignette dans cette catégorie pour l'instant (elles arrivent par lots à chaque synchro).</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
