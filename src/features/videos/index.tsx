import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Megaphone, X } from "lucide-react";
import { useEffect } from "react";
import { Badge, Card, EmptyState, PageHeader, Segmented, Skeleton, SourceNote } from "@/ui";
import { useVideosViewModel, type MediaItem, type TabKey } from "./useVideosViewModel";
import type { Speaker, VideoScript } from "./scripts";
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

const SPEAKER: Record<Speaker, { label: string; status: "good" | "neutral" }> = {
  lipsync: { label: "Lip sync", status: "good" },
  voiceover: { label: "Voix off", status: "neutral" },
  none: { label: "Muet", status: "neutral" },
};

function ScriptCard({ script, vm }: { script: VideoScript; vm: ReturnType<typeof useVideosViewModel> }) {
  const missing = [
    ...script.missing.fish.map((m) => `Fish : ${m}`),
    ...script.missing.captures.map((m) => `Capture app : ${m}`),
    ...script.missing.montage.filter((m) => m !== "Rien d'autre").map((m) => `Montage : ${m}`),
  ];
  return (
    <Card title={script.title} subtitle={`${script.duration} · ${script.shots.length} plans · voix = sous-titres, aucun texte ajouté`}>
      <div className="table-wrap vd-script">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Image</th>
              <th>Plan</th>
              <th>Qui parle</th>
              <th>Réplique (= sous-titre)</th>
              <th>Son</th>
            </tr>
          </thead>
          <tbody>
            {script.shots.map((shot, i) => {
              const media = shot.image ? vm.mediaByKey?.get(shot.image) : undefined;
              const sp = SPEAKER[shot.speaker];
              return (
                <tr key={i} className={shot.promo ? "vd-script__promo" : undefined}>
                  <td className="num">
                    <strong>{i + 1}</strong>
                    <div className="muted">{shot.time}</div>
                  </td>
                  <td className="vd-script__img">
                    {media ? (
                      <button type="button" className="vd-script__thumb" onClick={() => vm.openItem(media.key)} title={media.title}>
                        <img src={media.thumb ?? media.url ?? ""} alt={media.title} loading="lazy" />
                      </button>
                    ) : (
                      <span className="vd-script__thumb vd-script__thumb--todo">
                        <ImageOff size={16} aria-hidden />
                        {shot.image ? "Pas synchronisée" : "À faire"}
                      </span>
                    )}
                    {shot.image && <div className="muted vd-script__path">{shot.image.split("/").pop()}</div>}
                    {shot.imageNote && <div className="muted vd-script__path">{shot.imageNote}</div>}
                  </td>
                  <td>
                    {shot.promo && (
                      <span className="vd-script__tag">
                        <Megaphone size={12} aria-hidden /> Promo app
                      </span>
                    )}
                    {shot.plan}
                  </td>
                  <td>
                    <div>{shot.who}</div>
                    <Badge status={sp.status} icon={false}>
                      {sp.label}
                    </Badge>
                  </td>
                  <td className="vd-script__line">{shot.line ? `“${shot.line}”` : <span className="muted">—</span>}</td>
                  <td className="muted">{shot.sound}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="vd-script__foot">
        <div>
          <div className="muted">Autres hooks (1re réplique)</div>
          <ul>
            {script.hooks.map((h) => (
              <li key={h}>“{h}”</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="muted">Légende du post</div>
          <p>{script.caption}</p>
        </div>
        <div>
          <div className="muted">Reste à faire</div>
          {missing.length ? (
            <ul>
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p>Tout existe déjà.</p>
          )}
        </div>
      </div>
      {script.note && <p className="muted vd-script__note">{script.note}</p>}
    </Card>
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
  if (vm.tab === "scripts")
    body = vm.scripts.length ? (
      <div className="stack">
        {vm.scripts.map((sc) => (
          <ScriptCard key={sc.id} script={sc} vm={vm} />
        ))}
      </div>
    ) : (
      <Card>
        <EmptyState title="Aucun script pour ce projet" />
      </Card>
    );
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
