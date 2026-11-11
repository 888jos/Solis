import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useEffect } from "react";
import { Badge, Card, EmptyState, PageHeader, Segmented, Skeleton, SourceNote } from "@/ui";
import { useVideosViewModel, type MediaItem, type TabKey } from "./useVideosViewModel";
import { ScriptsView } from "./ScriptsView";
import "./videos.css";

type Item = MediaItem & { heroes: string[]; size: string; dims: string };

function Tile({ item, onOpen, ratio }: { item: Item; onOpen: (key: string) => void; ratio?: "wide" }) {
  return (
    <button type="button" className={`vd-tile${item.chosen ? " vd-tile--chosen" : ""}${ratio ? " vd-tile--wide" : ""}`} onClick={() => onOpen(item.key)}>
      <span className="vd-tile__img">{item.thumb || item.url ? <img src={item.thumb ?? item.url ?? ""} alt="" loading="lazy" /> : null}</span>
      <span className="vd-tile__label">
        <span className="vd-tile__title">{item.title}</span>
        {item.chosen && (
          <Badge status="good" icon={false}>
            Retenue
          </Badge>
        )}
      </span>
    </button>
  );
}

function Viewer({ vm }: { vm: ReturnType<typeof useVideosViewModel> }) {
  const item = vm.open;
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") vm.close();
      if (e.key === "ArrowRight") vm.next();
      if (e.key === "ArrowLeft") vm.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, vm]);
  if (!item) return null;
  return (
    <div className="vd-viewer" role="dialog" aria-modal="true" aria-label={item.title} onClick={vm.close}>
      <div className="vd-viewer__frame" onClick={(e) => e.stopPropagation()}>
        <div className="vd-viewer__bar">
          <strong>{item.title}</strong>
          <span className="muted num">
            {vm.openPosition} · {item.dims} · {item.size}
          </span>
          <span className="topbar__spacer" />
          {item.url && (
            <a className="btn btn--ghost" href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> Ouvrir
            </a>
          )}
          <button type="button" className="btn btn--ghost" onClick={vm.close} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="vd-viewer__media">
          <button type="button" className="btn vd-viewer__nav vd-viewer__nav--prev" onClick={vm.prev} aria-label="Précédente">
            <ChevronLeft size={18} />
          </button>
          {item.kind === "video" ? <video src={item.url ?? undefined} controls autoPlay playsInline /> : <img src={item.url ?? undefined} alt={item.title} />}
          <button type="button" className="btn vd-viewer__nav vd-viewer__nav--next" onClick={vm.next} aria-label="Suivante">
            <ChevronRight size={18} />
          </button>
        </div>
        <p className="vd-viewer__meta muted">
          {item.key} · {item.source === "kling" ? "Kling" : "Fish Audio (Nano Banana)"}
        </p>
      </div>
    </div>
  );
}

export default function VideosPage() {
  const vm = useVideosViewModel();
  const d = vm.data;

  const subtitle = d
    ? `${vm.projectLabel} · ${d.counts.images} images, ${d.counts.storyboards} storyboards, ${d.counts.videos} clips`
    : "Images et clips générés pour faire les vidéos";

  let body;
  if (vm.tab === "scripts") body = <ScriptsView project={vm.project} hero={vm.hero} media={{ byKey: vm.mediaByKey, open: vm.openItem }} />;
  else if (vm.loading) body = <Skeleton height={420} />;
  else if (!d || d.empty)
    body = (
      <Card>
        <EmptyState title="Rien de synchronisé pour ce projet">
          Sur le Mac : <code>python3 scripts/solis_projects_sync.py media</code> dans ~/app/carousel-factory.
        </EmptyState>
      </Card>
    );
  else if (vm.tab === "storyboards")
    body = d.storyboards.length ? (
      <div className="stack vd-boards">
        {d.storyboards.map((s) => (
          <Card key={s.id} title={s.title} subtitle={`${s.frames.length} plans${s.kept ? ` · ${s.kept} retenus` : ""}`}>
            <div className="vd-strip">
              {s.frames.map((f) => (
                <Tile key={f.key} item={f} onOpen={vm.openItem} ratio="wide" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    ) : (
      <Card>
        <EmptyState title="Aucun storyboard avec ces filtres" />
      </Card>
    );
  else if (vm.tab === "bank")
    body = (
      <>
        <div className="vd-cats" role="tablist" aria-label="Catégorie">
          {d.categories.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={c.key === vm.category} className="vd-cat" onClick={() => vm.setCategory(c.key)} title={c.hint}>
              {c.label} <span className="num muted">{c.count}</span>
            </button>
          ))}
        </div>
        {d.bank.length ? (
          <div className="vd-grid">
            {d.bank.map((it) => (
              <Tile key={it.key} item={it} onOpen={vm.openItem} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="Aucune image avec ces filtres" />
          </Card>
        )}
      </>
    );
  else
    body = d.clips.length ? (
      <div className="vd-clips">
        {d.clips.map((c) => (
          <Card key={c.key} title={c.title} subtitle={`${c.source === "kling" ? "Kling" : c.source} · ${c.size}`}>
            <video className="vd-clip" src={c.url ?? undefined} controls preload="metadata" playsInline />
          </Card>
        ))}
      </div>
    ) : (
      <Card>
        <EmptyState title="Aucun clip pour l'instant" />
      </Card>
    );

  return (
    <div className="stack f-videos">
      <PageHeader title="Vidéos" subtitle={subtitle} />
      <div className="vd-filters">
        {vm.projects.length > 1 && <Segmented<string> label="Projet" value={vm.project} onChange={vm.setProject} options={vm.projects} />}
        <Segmented<TabKey> label="Rubrique" value={vm.tab} onChange={vm.setTab} options={vm.tabs} />
        <select className="select" value={vm.hero} onChange={(e) => vm.setHero(e.target.value)} aria-label="Héros">
          {vm.heroOptions.map((h) => (
            <option key={h.value} value={h.value}>
              {h.value ? h.label : "Tous les héros"}
            </option>
          ))}
        </select>
        {vm.tab === "storyboards" && (
          <label className="vd-check">
            <input type="checkbox" checked={vm.chosenOnly} onChange={(e) => vm.setChosenOnly(e.target.checked)} /> Prises retenues seulement
          </label>
        )}
      </div>
      {body}
      <SourceNote source="Mac · ~/app/carousel-factory/content/heroes (Fish Audio, Kling)" updatedAt={vm.syncedAt} />
      <Viewer vm={vm} />
    </div>
  );
}
