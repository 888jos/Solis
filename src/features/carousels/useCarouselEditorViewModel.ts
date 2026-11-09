import { useCallback, useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { useSolisMutation, useSolisQuery } from "@/lib/convex";
import { formatAgo } from "@/lib/format";

// Carousel editor (Canva-like, simpler): texts, font / size / colour, photo of one slide at a time.
// The Mac pushes what can be edited (`editor`, see carousel_factory/solis.py editor_payload); a save is stored in
// Convex (`saveEdits`) and applied on the Mac by `cf sync --edits`, which renders the slides again with the real
// templates and sends them back. Until then the form shows the saved (pending) values.

type Detail = NonNullable<FunctionReturnType<typeof api.carousels.detail>>;

export type EditorField = {
  path: string;
  label: string;
  kind: "text" | "choice";
  value: string;
  options?: string[];
  multiline?: boolean;
  slides: number[];
};
export type SlideStyle = { font?: string; scale?: number; color?: string };
type EditorPayload = {
  fonts: string[];
  scale: [number, number];
  fields: EditorField[];
  slides: { images: string[]; style: SlideStyle | null }[];
  categories: string[];
  edited: boolean;
};
type Draft = { text: Record<string, string>; style: Record<number, SlideStyle>; images: Record<string, string> };
type Photo = { url: string; name: string; category: string };

const EMPTY: Draft = { text: {}, style: {}, images: {} };
const OPTION_LABELS: Record<string, string> = {
  top: "Haut", middle: "Milieu", bottom: "Bas", s: "Petit", m: "Moyen", l: "Grand", white: "Blanc", yellow: "Jaune",
  paper: "Papier", kraft: "Kraft", night: "Nuit", light: "Clair", dark: "Sombre", checklist: "Cases à cocher", bullets: "Puces",
};
export const SWATCHES = ["#ffffff", "#111111", "#ffe14d", "#f5ecd7", "#ff8fab", "#7cc6fe"];

const slotKey = (slide: number, slot: number) => `${slide}.${slot}`;
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function useCarouselEditorViewModel(d: Detail) {
  const editor = (d.editor ?? null) as EditorPayload | null;
  const saveMutation = useSolisMutation(api.carousels.saveEdits);
  const [slide, setSlide] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ slot: number; category: string } | null>(null);
  const [seen, setSeen] = useState<Record<string, Photo>>({});

  useEffect(() => {
    setDraft(EMPTY);
    setSlide(0);
    setPicker(null);
  }, [d.cid]);

  // An edit saved here but not applied on the Mac yet.
  const pending = useMemo(() => {
    const p = d.pendingEdit;
    const out: Draft = { text: {}, style: {}, images: {} };
    if (!p) return out;
    for (const t of p.text) out.text[t.path] = t.value;
    for (const s of p.style) out.style[s.slide] = { font: s.font, scale: s.scale, color: s.color };
    for (const i of p.images) out.images[slotKey(i.slide, i.slot)] = i.imageId;
    return out;
  }, [d.pendingEdit]);

  const bank = useSolisQuery(api.carousels.bank, picker ? { category: picker.category } : "skip");
  useEffect(() => {
    if (!bank?.images.length) return;
    setSeen((prev) => {
      const next = { ...prev };
      for (const i of bank.images) next[i.imageId] = { url: i.url, name: i.name, category: i.category };
      return next;
    });
  }, [bank]);
  const photos: Record<string, Photo> = useMemo(() => ({ ...seen, ...d.photos }), [seen, d.photos]);

  const slideCount = Math.max(d.slides.length, editor?.slides.length ?? 0);
  const current = Math.min(slide, Math.max(0, slideCount - 1));

  const valueOf = useCallback(
    (f: EditorField) => draft.text[f.path] ?? pending.text[f.path] ?? f.value,
    [draft.text, pending.text],
  );
  const styleOf = useCallback(
    (s: number): SlideStyle => draft.style[s] ?? pending.style[s] ?? editor?.slides[s]?.style ?? {},
    [draft.style, pending.style, editor],
  );
  const imageOf = useCallback(
    (s: number, slot: number) => draft.images[slotKey(s, slot)] ?? pending.images[slotKey(s, slot)] ?? editor?.slides[s]?.images[slot] ?? null,
    [draft.images, pending.images, editor],
  );

  const toField = (f: EditorField) => ({
    ...f,
    label: capitalize(f.label),
    current: valueOf(f),
    changed: draft.text[f.path] !== undefined,
    options: (f.options ?? []).map((o) => ({ value: o, label: OPTION_LABELS[o] ?? o })),
  });

  const style = styleOf(current);
  const slots = (editor?.slides[current]?.images ?? []).map((_, slot) => {
    const id = imageOf(current, slot);
    const photo = id ? photos[id] : undefined;
    return { slot, imageId: id, url: photo?.url ?? null, name: photo?.name ?? "", changed: draft.images[slotKey(current, slot)] !== undefined };
  });

  const categories = useMemo(() => {
    const counts = bank?.counts ?? {};
    const allowed = editor?.categories.length ? editor.categories : Object.keys(counts).sort();
    return allowed.map((c) => ({ value: c, label: counts[c] !== undefined ? `${c} (${counts[c]})` : c }));
  }, [editor, bank?.counts]);

  const dirty = Object.keys(draft.text).length + Object.keys(draft.style).length + Object.keys(draft.images).length > 0;

  const setText = (path: string, value: string) => setDraft((p) => ({ ...p, text: { ...p.text, [path]: value } }));
  const setStyle = (patch: SlideStyle) =>
    setDraft((p) => ({ ...p, style: { ...p.style, [current]: { ...styleOf(current), ...patch } } }));
  const resetStyle = () => setDraft((p) => ({ ...p, style: { ...p.style, [current]: {} } }));
  const openPicker = (slot: number) => {
    const id = imageOf(current, slot);
    const cat = (id && photos[id]?.category) || editor?.categories[0] || "";
    setPicker({ slot, category: cat });
  };
  const choosePhoto = (imageId: string) => {
    if (!picker) return;
    setDraft((p) => ({ ...p, images: { ...p.images, [slotKey(current, picker.slot)]: imageId } }));
    setPicker(null);
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveMutation({
        cid: d.cid,
        edits: {
          text: Object.entries(draft.text).map(([path, value]) => ({ path, value })),
          style: Object.entries(draft.style).map(([s, st]) => ({
            slide: Number(s),
            ...(st.font ? { font: st.font } : {}),
            ...(st.scale && st.scale !== 1 ? { scale: st.scale } : {}),
            ...(st.color ? { color: st.color } : {}),
          })),
          images: Object.entries(draft.images).map(([k, imageId]) => {
            const [s, slot] = k.split(".").map(Number);
            return { slide: s, slot, imageId };
          }),
        },
      });
      setDraft(EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const st = d.editStatus;
  const status =
    st?.state === "pending"
      ? { tone: "warning" as const, text: "Enregistré. Le Mac re-rend les slides à sa prochaine synchro, elles se mettront à jour ici toutes seules." }
      : st?.state === "error"
        ? { tone: "critical" as const, text: `Le Mac a refusé la dernière modification : ${st.message ?? "erreur"}` }
        : st?.state === "done"
          ? { tone: "good" as const, text: `Slides re-rendues ${formatAgo(st.at)}.` }
          : null;

  const fields = editor?.fields ?? [];
  return {
    ready: !!editor,
    cid: d.cid,
    title: d.topic || d.cid,
    slides: d.slides.map((src, i) => ({ src, index: i, edited: draft.style[i] !== undefined || Object.keys(draft.images).some((k) => k.startsWith(`${i}.`)) })),
    slide: current,
    setSlide,
    preview: d.slides[current] ?? null,
    slideFields: fields.filter((f) => f.slides.includes(current)).map(toField),
    globalFields: fields.filter((f) => f.slides.length === 0).map(toField),
    setText,
    fonts: editor?.fonts ?? [],
    scaleRange: editor?.scale ?? [0.6, 1.8],
    style: { font: style.font ?? "", scale: style.scale ?? 1, color: style.color ?? "" },
    styleChanged: draft.style[current] !== undefined,
    setStyle,
    resetStyle,
    slots,
    picker: picker
      ? {
          category: picker.category,
          categories,
          setCategory: (c: string) => setPicker({ ...picker, category: c }),
          loading: bank === undefined,
          images: (bank?.images ?? []).map((i) => ({ ...i, current: i.imageId === imageOf(current, picker.slot) })),
          choose: choosePhoto,
          close: () => setPicker(null),
        }
      : null,
    openPicker,
    dirty,
    discard: () => setDraft(EMPTY),
    save,
    saving,
    error,
    status,
  };
}
