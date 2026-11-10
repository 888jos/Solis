import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, EmptyState, Skeleton } from "@/ui";
import { useModelsViewModel, type CarouselModel } from "../useModelsViewModel";

type Open = { model: CarouselModel & { ratio: string }; index: number } | null;

export function ModelsView() {
  const vm = useModelsViewModel();
  const [open, setOpen] = useState<Open>(null);

  if (vm.loading) return <Skeleton height={360} />;
  if (vm.unavailable)
    return (
      <div className="card">
        <EmptyState title="Modèles introuvables">
          Aucune copie publiée : lance <code>node scripts/export-models.mjs</code> puis redéploie.
        </EmptyState>
      </div>
    );

  return (
    <>
      <div className="cr-filters">
        <input
          className="input"
          type="search"
          placeholder="Chercher un modèle ou un compte"
          value={vm.query}
          onChange={(e) => vm.setQuery(e.target.value)}
          aria-label="Chercher un modèle"
          style={{ maxWidth: 320 }}
        />
        <span className="muted">
          {vm.total} modèles recopiés de tes favoris TikTok · clique sur une slide pour voir tout le carrousel
        </span>
      </div>

      {vm.models.length === 0 ? (
        <div className="card">
          <EmptyState title="Aucun modèle">Aucun modèle ne correspond à la recherche.</EmptyState>
        </div>
      ) : (
        <div className="cm-list">
          {vm.models.map((m) => (
            <article key={m.id} className="card cm-card" id={m.id}>
              <header className="cm-head">
                <div>
                  <h3 className="cm-title">{m.name}</h3>
                  <p className="cm-meta">
                    <code>{m.id}</code> · d'après {m.reference} · format {m.aspect}
                  </p>
                </div>
                <div className="cm-badges">
                  <Badge status={m.sameCount ? "good" : "warning"} icon={false}>
                    {m.original.length} slides → {m.copy.length}
                  </Badge>
                  <Badge status={m.qaBadge.tone} icon={false}>
                    {m.qaBadge.label}
                  </Badge>
                </div>
              </header>
              {m.structure && <p className="cm-structure">{m.structure}</p>}
              <div className="cm-pair">
                <Strip label={`Original ${m.reference}`} images={m.original} onOpen={(i) => setOpen({ model: m, index: i })} />
                <Strip label="Copie CortiFree" images={m.copy} ratio={m.ratio} roles={m.roles} onOpen={(i) => setOpen({ model: m, index: i })} />
              </div>
            </article>
          ))}
        </div>
      )}
      {open && <Flow model={open.model} index={open.index} onClose={() => setOpen(null)} />}
      <p className="muted">{vm.root.startsWith("/") ? `Lu en direct dans ${vm.root}.` : "Copie publiée avec le site (scripts/export-models.mjs)."}</p>
    </>
  );
}

function Strip({ label, images, ratio, roles, onOpen }: { label: string; images: string[]; ratio?: string; roles?: string[]; onOpen: (i: number) => void }) {
  return (
    <section className="cm-strip">
      <p className="cm-strip__label">{label}</p>
      {images.length ? (
        <div className="cm-strip__row">
          {images.map((src, i) => (
            <button type="button" key={src} onClick={() => onOpen(i)} className={`cm-thumb${ratio ? "" : " cm-thumb--natural"}`} style={ratio ? { aspectRatio: ratio } : undefined}>
              <img src={src} alt={`Slide ${i + 1}`} loading="lazy" />
              <span className="cm-thumb__n num">
                {i + 1}
                {roles?.[i] ? ` · ${roles[i]}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Pas d'image.</p>
      )}
    </section>
  );
}

/** Full-screen flow: the whole original carousel on top, the whole CortiFree copy below. */
function Flow({ model, index, onClose }: { model: CarouselModel & { ratio: string }; index: number; onClose: () => void }) {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    for (const row of [top.current, bottom.current]) {
      const el = row?.children[index] as HTMLElement | undefined;
      el?.scrollIntoView({ inline: "center", block: "nearest" });
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, onClose]);

  const row = (label: string, images: string[], ref: React.RefObject<HTMLDivElement | null>, roles?: string[]) => (
    <section className="cm-flow__section">
      <p className="cm-flow__label">
        {label} · {images.length} slides
      </p>
      <div className="cm-flow__row" ref={ref}>
        {images.map((src, i) => (
          <figure key={src} className={`cm-flow__slide${i === index ? " is-current" : ""}`}>
            <img src={src} alt={`Slide ${i + 1}`} />
            <figcaption className="num">
              {i + 1}
              {roles?.[i] ? ` · ${roles[i]}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );

  return (
    <div className="cm-flow" role="dialog" aria-modal="true" aria-label={model.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <header className="cm-flow__head">
        <div>
          <strong>{model.name}</strong>
          <span className="muted"> · d'après {model.reference}</span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Fermer">
          <X />
        </button>
      </header>
      {row(`Original ${model.reference}`, model.original, top)}
      {row("Copie CortiFree", model.copy, bottom, model.roles)}
    </div>
  );
}
