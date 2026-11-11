import { ArrowDown, ArrowUp, ImageOff, Megaphone, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Card, EmptyState, Skeleton } from "@/ui";
import type { Shot, Speaker, VideoScript } from "./scripts";
import { emptyShot, useScriptsViewModel, type ScriptEntry } from "./useScriptsViewModel";
import { HEROES, type MediaItem } from "./useVideosViewModel";

const SPEAKER: Record<Speaker, { label: string; status: "good" | "neutral" }> = {
  lipsync: { label: "Lip sync", status: "good" },
  voiceover: { label: "Voix off", status: "neutral" },
  none: { label: "Muet", status: "neutral" },
};

type Media = { byKey: Map<string, MediaItem> | null; open: (key: string) => void };
type Vm = ReturnType<typeof useScriptsViewModel>;

function Thumb({ shot, media }: { shot: Shot; media: Media }) {
  const item = shot.image ? media.byKey?.get(shot.image) : undefined;
  return item ? (
    <button type="button" className="vd-script__thumb" onClick={() => media.open(item.key)} title={item.title}>
      <img src={item.thumb ?? item.url ?? ""} alt={item.title} loading="lazy" />
    </button>
  ) : (
    <span className="vd-script__thumb vd-script__thumb--todo">
      <ImageOff size={16} aria-hidden />
      {shot.image ? "Pas synchronisée" : "À faire"}
    </span>
  );
}

function ScriptRead({ entry, media, vm }: { entry: ScriptEntry; media: Media; vm: Vm }) {
  const script = entry.script;
  const missing = [
    ...script.missing.fish.map((m) => `Fish : ${m}`),
    ...script.missing.captures.map((m) => `Capture app : ${m}`),
    ...script.missing.montage.filter((m) => m !== "Rien d'autre").map((m) => `Montage : ${m}`),
  ];
  return (
    <Card
      title={script.title}
      subtitle={`${script.duration} · ${script.shots.length} plans · voix = sous-titres, aucun texte ajouté${entry.edited ? " · modifié dans Solis" : ""}`}
      action={
        <button type="button" className="btn btn--ghost" onClick={() => vm.edit(script.id)} disabled={!!vm.editing}>
          <Pencil size={14} aria-hidden /> Modifier
        </button>
      }
    >
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
              const sp = SPEAKER[shot.speaker];
              return (
                <tr key={i} className={shot.promo ? "vd-script__promo" : undefined}>
                  <td className="num">
                    <strong>{i + 1}</strong>
                    <div className="muted">{shot.time}</div>
                  </td>
                  <td className="vd-script__img">
                    <Thumb shot={shot} media={media} />
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

const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n");

function ScriptEdit({ entry, initial, media, vm }: { entry: ScriptEntry | null; initial: VideoScript; media: Media; vm: Vm }) {
  const [d, setD] = useState<VideoScript>(() => structuredClone(initial));
  const set = (patch: Partial<VideoScript>) => setD((s) => ({ ...s, ...patch }));
  const setShot = (i: number, patch: Partial<Shot>) => setD((s) => ({ ...s, shots: s.shots.map((sh, j) => (j === i ? { ...sh, ...patch } : sh)) }));
  const moveShot = (i: number, delta: number) =>
    setD((s) => {
      const shots = [...s.shots];
      const j = i + delta;
      if (j < 0 || j >= shots.length) return s;
      [shots[i], shots[j]] = [shots[j], shots[i]];
      return { ...s, shots };
    });
  const insertShot = (i: number) => setD((s) => ({ ...s, shots: [...s.shots.slice(0, i + 1), emptyShot(), ...s.shots.slice(i + 1)] }));
  const removeShot = (i: number) => setD((s) => ({ ...s, shots: s.shots.filter((_, j) => j !== i) }));
  const imageKeys = media.byKey ? [...media.byKey.values()].filter((m) => m.kind === "image").map((m) => m.key) : [];
  const listId = `vd-keys-${d.id}`;

  return (
    <Card title={entry ? `Modifier : ${initial.title}` : "Nouveau script"} subtitle="Rien n'est enregistré tant que tu n'as pas cliqué sur Enregistrer">
      <datalist id={listId}>
        {imageKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div className="vd-edit__meta">
        <label>
          Titre
          <input className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          Héros
          <select className="select" value={d.hero} onChange={(e) => set({ hero: e.target.value })}>
            {HEROES.map((h) => (
              <option key={h} value={h}>
                {h.charAt(0).toUpperCase() + h.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Durée
          <input className="input" value={d.duration} onChange={(e) => set({ duration: e.target.value })} />
        </label>
      </div>

      <div className="vd-edit__shots">
        {d.shots.map((sh, i) => (
          <div key={i} className={`vd-edit__shot${sh.promo ? " vd-edit__shot--promo" : ""}`}>
            <div className="vd-edit__shothead">
              <strong>Plan {i + 1}</strong>
              <input className="input vd-edit__time" placeholder="0-3 s" value={sh.time} onChange={(e) => setShot(i, { time: e.target.value })} aria-label="Durée du plan" />
              <label className="vd-check">
                <input type="checkbox" checked={!!sh.promo} onChange={(e) => setShot(i, { promo: e.target.checked })} /> Promo app
              </label>
              <span className="topbar__spacer" />
              <button type="button" className="btn btn--ghost" onClick={() => moveShot(i, -1)} disabled={i === 0} aria-label="Monter">
                <ArrowUp size={14} />
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => moveShot(i, 1)} disabled={i === d.shots.length - 1} aria-label="Descendre">
                <ArrowDown size={14} />
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => insertShot(i)} title="Ajouter un plan après">
                <Plus size={14} />
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => removeShot(i)} aria-label="Supprimer le plan">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="vd-edit__grid">
              <div className="vd-edit__imgcol">
                <Thumb shot={sh} media={media} />
                <input className="input" list={listId} placeholder="Image (chemin) ou vide = à faire" value={sh.image ?? ""} onChange={(e) => setShot(i, { image: e.target.value || null })} />
                <textarea className="input" rows={2} placeholder="Note sur l'image" value={sh.imageNote ?? ""} onChange={(e) => setShot(i, { imageNote: e.target.value })} />
              </div>
              <label>
                Plan
                <textarea className="input" rows={4} value={sh.plan} onChange={(e) => setShot(i, { plan: e.target.value })} />
              </label>
              <label>
                Réplique (= sous-titre)
                <textarea className="input" rows={4} value={sh.line} onChange={(e) => setShot(i, { line: e.target.value })} />
              </label>
              <div className="vd-edit__who">
                <label>
                  Qui parle
                  <input className="input" value={sh.who} onChange={(e) => setShot(i, { who: e.target.value })} />
                </label>
                <select className="select" value={sh.speaker} onChange={(e) => setShot(i, { speaker: e.target.value as Speaker })} aria-label="Type de voix">
                  {(Object.keys(SPEAKER) as Speaker[]).map((k) => (
                    <option key={k} value={k}>
                      {SPEAKER[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <label>
                Son
                <textarea className="input" rows={2} value={sh.sound} onChange={(e) => setShot(i, { sound: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => insertShot(d.shots.length - 1)}>
          <Plus size={14} aria-hidden /> Ajouter un plan
        </button>
      </div>

      <div className="vd-edit__meta vd-edit__meta--wide">
        <label>
          Autres hooks (un par ligne)
          <textarea className="input" rows={3} value={toLines(d.hooks)} onChange={(e) => set({ hooks: fromLines(e.target.value) })} />
        </label>
        <label>
          Légende du post
          <textarea className="input" rows={3} value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
        </label>
        <label>
          À générer sur Fish (un par ligne)
          <textarea className="input" rows={3} value={toLines(d.missing.fish)} onChange={(e) => set({ missing: { ...d.missing, fish: fromLines(e.target.value) } })} />
        </label>
        <label>
          Captures de l'app à faire (une par ligne)
          <textarea className="input" rows={3} value={toLines(d.missing.captures)} onChange={(e) => set({ missing: { ...d.missing, captures: fromLines(e.target.value) } })} />
        </label>
        <label>
          Montage (un par ligne)
          <textarea className="input" rows={3} value={toLines(d.missing.montage)} onChange={(e) => set({ missing: { ...d.missing, montage: fromLines(e.target.value) } })} />
        </label>
        <label>
          Note
          <textarea className="input" rows={3} value={d.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>

      {vm.error && <p className="vd-edit__error">{vm.error}</p>}
      <div className="vd-edit__actions">
        <button type="button" className="btn btn--primary" onClick={() => vm.save(d)} disabled={vm.busy}>
          {vm.busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={vm.cancel} disabled={vm.busy}>
          Annuler
        </button>
        <span className="topbar__spacer" />
        {entry?.builtIn && entry.edited && (
          <button type="button" className="btn btn--ghost" onClick={() => vm.reset(entry)} disabled={vm.busy}>
            <RotateCcw size={14} aria-hidden /> Version d'origine
          </button>
        )}
        {entry && (
          <button type="button" className="btn btn--ghost" onClick={() => vm.remove(entry)} disabled={vm.busy}>
            <Trash2 size={14} aria-hidden /> Supprimer le script
          </button>
        )}
      </div>
    </Card>
  );
}

export function ScriptsView({ project, hero, media }: { project: string; hero: string; media: Media }) {
  const vm = useScriptsViewModel(project, hero);
  if (vm.loading) return <Skeleton height={420} />;
  return (
    <div className="stack">
      <div className="vd-edit__top">
        <button type="button" className="btn" onClick={vm.startNew} disabled={!!vm.editing}>
          <Plus size={14} aria-hidden /> Nouveau script
        </button>
      </div>
      {vm.draftNew && vm.editing === vm.draftNew.id && <ScriptEdit entry={null} initial={vm.draftNew} media={media} vm={vm} />}
      {vm.entries.map((e) =>
        vm.editing === e.script.id ? (
          <ScriptEdit key={e.script.id} entry={e} initial={e.script} media={media} vm={vm} />
        ) : (
          <ScriptRead key={e.script.id} entry={e} media={media} vm={vm} />
        ),
      )}
      {!vm.entries.length && !vm.draftNew && (
        <Card>
          <EmptyState title="Aucun script" />
        </Card>
      )}
    </div>
  );
}
