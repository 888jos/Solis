import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSolisQuery } from "@/lib/convex";
import { SCRIPTS } from "./scripts";

type Library = FunctionReturnType<typeof api.media.library>;
export type MediaItem = Library["items"][number];

export const PROJECTS: Record<string, string> = { questirl: "Quest IRL", otto: "Otto", cortifree: "CortiFree" };

export const TABS = [
  { value: "scripts", label: "Scripts" },
  { value: "storyboards", label: "Storyboards" },
  { value: "bank", label: "Banque d'images" },
  { value: "clips", label: "Clips" },
] as const;
export type TabKey = (typeof TABS)[number]["value"];

// Bank categories, in the order the page shows them (key = mediaAssets.category).
const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "heroes", label: "Héros", hint: "Fiches personnage L1 / L6 et line-ups" },
  { key: "faces", label: "Visages", hint: "Planches d'expressions" },
  { key: "props", label: "Objets", hint: "Téléphone et accessoires" },
  { key: "homes", label: "Maisons", hint: "Foyers médiévaux, vides" },
  { key: "life", label: "Vie médiévale", hint: "5 lieux de vie par héros" },
  { key: "sets", label: "Décors modernes", hint: "Pièces vides 4:3" },
  { key: "scenes", label: "Scènes", hint: "Héros dans son décor" },
  { key: "cta", label: "CTA / POV / Close", hint: "Fins de vidéo, avec l'app ou fond vert" },
  { key: "sheets", label: "Planches", hint: "Planches contact" },
  { key: "drafts", label: "Versions précédentes", hint: "Essais avant le style v4" },
];

// Storyboards (key = mediaAssets.group). Script names from the overnight Fish Audio run (fish_out/NIGHT_PLAN.txt).
const STORYBOARDS: Record<string, string> = {
  aldric_3am: "Aldric — 3 h du matin",
  merion_47_tabs: "Merion — 47 onglets",
  kael_scanning: "Kael — Scanning",
  torvin_quest_log: "Torvin — Quest log",
  no_plates: "Aldric + Torvin — Sans disques",
  sylas_curtains: "Sylas — Rideaux",
  lorian_mom: "Lorian — Maman en vu",
};

export const HEROES = ["aldric", "merion", "kael", "torvin", "lorian", "sylas"] as const;
const HERO_CODES: Record<string, string> = { AL: "aldric", ME: "merion", KA: "kael", TO: "torvin", LO: "lorian", SY: "sylas" };

function heroesOf(item: MediaItem): string[] {
  const k = item.key.toLowerCase();
  const found: string[] = HEROES.filter((h) => k.includes(h));
  const code = item.key.split("/").pop()?.match(/^([A-Z]{2})-\d/)?.[1];
  if (code && HERO_CODES[code]) found.push(HERO_CODES[code]);
  if (item.group === "no_plates") found.push("aldric", "torvin");
  return [...new Set(found)];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.round(n / 1000)} ko`;
}

/** Page-level ViewModel for Croissance > Vidéos: the images and clips used to make the videos. */
export function useVideosViewModel() {
  const [params, setParams] = useSearchParams();
  const project = params.get("projet") || "questirl";
  const tabParam = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.value === tabParam) ? (tabParam as TabKey) : "scripts";
  const category = params.get("cat") || "heroes";
  const hero = params.get("heros") || "";
  const [chosenOnly, setChosenOnly] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const setParam = (name: string, value: string, fallback: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!value || value === fallback) p.delete(name);
      else p.set(name, value);
      return p;
    });

  const lib = useSolisQuery(api.media.library, { project });

  const derived = useMemo(() => {
    if (!lib) return null;
    const all = [...lib.items].sort((a, b) => a.category.localeCompare(b.category) || a.group.localeCompare(b.group) || a.order - b.order || a.title.localeCompare(b.title));
    const withHeroes = all.map((it) => ({ ...it, heroes: heroesOf(it), size: formatBytes(it.bytes), dims: `${it.width}×${it.height}` }));
    const matchHero = (it: (typeof withHeroes)[number]) => !hero || it.heroes.includes(hero);

    const storyboards = Object.entries(STORYBOARDS)
      .map(([id, title]) => {
        const frames = withHeroes.filter((it) => it.category === "storyboard" && it.group === id).filter((it) => !chosenOnly || it.chosen);
        return { id, title, frames, kept: frames.filter((f) => f.chosen).length };
      })
      .filter((s) => s.frames.length && (!hero || s.frames.some(matchHero)));

    const bankItems = withHeroes.filter((it) => it.kind === "image" && it.category !== "storyboard");
    const categories = CATEGORIES.map((c) => ({ ...c, count: bankItems.filter((it) => it.category === c.key && matchHero(it)).length })).filter(
      (c) => bankItems.some((it) => it.category === c.key),
    );
    const activeCat = categories.some((c) => c.key === category) ? category : (categories[0]?.key ?? "");
    const bank = bankItems.filter((it) => it.category === activeCat && matchHero(it));
    const clips = withHeroes.filter((it) => it.kind === "video" && matchHero(it));

    const counts = {
      images: all.filter((it) => it.kind === "image").length,
      videos: all.filter((it) => it.kind === "video").length,
      storyboards: storyboards.length,
      kept: all.filter((it) => it.chosen).length,
    };
    const byKey = new Map(withHeroes.map((it) => [it.key, it]));
    return { storyboards, categories, activeCat, bank, clips, counts, byKey, empty: all.length === 0 };
  }, [lib, hero, category, chosenOnly]);

  const open = openKey && derived ? (derived.byKey.get(openKey) ?? null) : null;
  // Arrows in the viewer walk the list the image was opened from.
  const openList =
    open && derived ? (open.category === "storyboard" ? (derived.storyboards.find((s) => s.id === open.group)?.frames ?? []) : open.kind === "video" ? derived.clips : derived.bank) : [];
  const openIndex = open ? openList.findIndex((it) => it.key === open.key) : -1;
  const step = (delta: number) => {
    if (openIndex < 0 || !openList.length) return;
    setOpenKey(openList[(openIndex + delta + openList.length) % openList.length].key);
  };

  return {
    loading: lib === undefined,
    project,
    projectLabel: PROJECTS[project] ?? project,
    projects: (lib?.projects.length ? lib.projects : ["questirl"]).map((p) => ({ value: p, label: PROJECTS[p] ?? p })),
    setProject: (p: string) => setParam("projet", p, "questirl"),
    tab,
    tabs: [...TABS],
    setTab: (t: TabKey) => setParam("tab", t, "scripts"),
    scripts: project === "questirl" ? SCRIPTS.filter((s) => !hero || s.hero === hero) : [],
    mediaByKey: derived?.byKey ?? null,
    heroOptions: [{ value: "", label: "Tous" }, ...HEROES.map((h) => ({ value: h, label: cap(h) }))],
    hero,
    setHero: (h: string) => setParam("heros", h, ""),
    category: derived?.activeCat ?? category,
    setCategory: (c: string) => setParam("cat", c, "heroes"),
    chosenOnly,
    setChosenOnly,
    data: derived,
    syncedAt: lib?.syncedAt ?? null,
    open,
    openPosition: openIndex >= 0 ? `${openIndex + 1} / ${openList.length}` : "",
    openItem: setOpenKey,
    close: () => setOpenKey(null),
    next: () => step(1),
    prev: () => step(-1),
    heroName: cap,
  };
}
