import { api } from "@convex/_generated/api";
import { useMemo, useState } from "react";
import { useSolisMutation, useSolisQuery } from "@/lib/convex";
import { SCRIPTS, type Shot, type VideoScript } from "./scripts";

export type ScriptEntry = { script: VideoScript; order: number; builtIn: boolean; edited: boolean; updatedAt: number | null };

export const emptyShot = (): Shot => ({ time: "", plan: "", image: null, who: "", speaker: "lipsync", line: "", sound: "" });

/** Drops empty optional fields so the script matches the Convex validator. */
function clean(s: VideoScript): VideoScript {
  const shots = s.shots.map((sh) => {
    const out: Shot = { time: sh.time, plan: sh.plan, image: sh.image?.trim() ? sh.image.trim() : null, who: sh.who, speaker: sh.speaker, line: sh.line, sound: sh.sound };
    if (sh.imageNote?.trim()) out.imageNote = sh.imageNote;
    if (sh.promo) out.promo = true;
    return out;
  });
  const lines = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
  const out: VideoScript = {
    id: s.id,
    hero: s.hero,
    title: s.title,
    duration: s.duration,
    hooks: lines(s.hooks),
    caption: s.caption,
    shots,
    missing: { fish: lines(s.missing.fish), captures: lines(s.missing.captures), montage: lines(s.missing.montage) },
  };
  if (s.note?.trim()) out.note = s.note;
  return out;
}

/** Scripts tab: the built-in scripts (scripts.ts) overridden by the versions edited in Solis (Convex videoScripts). */
export function useScriptsViewModel(project: string, hero: string) {
  const rows = useSolisQuery(api.videoScripts.list, { project });
  const saveFn = useSolisMutation(api.videoScripts.save);
  const removeFn = useSolisMutation(api.videoScripts.remove);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<VideoScript | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo<ScriptEntry[]>(() => {
    const byId = new Map((rows ?? []).map((r) => [r.scriptId, r]));
    const builtIns = project === "questirl" ? SCRIPTS : [];
    const out: ScriptEntry[] = [];
    builtIns.forEach((s, i) => {
      const r = byId.get(s.id);
      if (r?.deleted) return;
      out.push({ script: (r?.data as VideoScript | null) ?? s, order: r?.order ?? i, builtIn: true, edited: !!r?.data, updatedAt: r?.updatedAt ?? null });
    });
    for (const r of rows ?? []) {
      if (r.deleted || !r.data || builtIns.some((s) => s.id === r.scriptId)) continue;
      out.push({ script: r.data as VideoScript, order: r.order, builtIn: false, edited: true, updatedAt: r.updatedAt });
    }
    return out.sort((a, b) => a.order - b.order);
  }, [rows, project]);

  const visible = entries.filter((e) => !hero || e.script.hero === hero);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const orderOf = (id: string) => entries.find((e) => e.script.id === id)?.order ?? (entries.length ? Math.max(...entries.map((e) => e.order)) + 1 : 0);

  return {
    loading: rows === undefined,
    entries: visible,
    editing,
    edit: (id: string) => {
      setError(null);
      setEditing(id);
    },
    cancel: () => {
      setEditing(null);
      setDraftNew(null);
      setError(null);
    },
    draftNew,
    startNew: () => {
      const id = `s_${Date.now().toString(36)}`;
      setDraftNew({ id, hero: hero || "aldric", title: "Nouveau script", duration: "~20 s", hooks: [], caption: "", shots: [emptyShot()], missing: { fish: [], captures: [], montage: [] } });
      setEditing(id);
      setError(null);
    },
    save: async (s: VideoScript) => {
      const ok = await run(() => saveFn({ project, order: orderOf(s.id), script: clean(s) }));
      if (ok) {
        setEditing(null);
        setDraftNew(null);
      }
    },
    remove: async (e: ScriptEntry) => {
      if (!window.confirm(`Supprimer « ${e.script.title} » ?`)) return;
      await run(() => removeFn({ project, scriptId: e.script.id, mode: "delete", builtIn: e.builtIn }));
      setEditing(null);
    },
    reset: async (e: ScriptEntry) => {
      if (!window.confirm("Revenir à la version d'origine ? Les modifications faites dans Solis seront perdues.")) return;
      await run(() => removeFn({ project, scriptId: e.script.id, mode: "reset", builtIn: e.builtIn }));
      setEditing(null);
    },
    busy,
    error,
  };
}
