import { useEffect, useMemo, useState } from "react";

// "Modèles" view: the replica models of Jos's favourite carousels, read in place from Carousel Factory on the Mac
// by the dev server (vite.config.ts, /__cf-models). Not available on the deployed site.

export type CarouselModel = {
  id: string;
  name: string;
  reference: string;
  structure: string;
  aspect: string;
  hook: string;
  roles: string[];
  original: string[];
  copy: string[];
  qa: { status: string; fails?: string[]; warns?: number } | null;
};

type Index = { root: string; models: CarouselModel[]; favourites: number };

const QA_LABEL: Record<string, { label: string; tone: "good" | "warning" | "critical" | "neutral" }> = {
  pass: { label: "QA ok", tone: "good" },
  warn: { label: "QA ok (avertissements)", tone: "good" },
  fail: { label: "QA en échec", tone: "critical" },
  error: { label: "Rendu en erreur", tone: "critical" },
};

export function useModelsViewModel() {
  const [data, setData] = useState<Index | null | "unavailable">(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    // On the Mac the dev server reads Carousel Factory in place; the deployed site serves the copy made by
    // scripts/export-models.mjs (public/cf-models).
    const load = (url: string) =>
      fetch(url).then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? (r.json() as Promise<Index>) : null));
    (import.meta.env.DEV ? load("/__cf-models/index.json") : Promise.resolve(null))
      .then((j) => j ?? load("/cf-models/index.json"))
      .then((j) => alive && setData(j ?? "unavailable"))
      .catch(() => alive && setData("unavailable"));
    return () => {
      alive = false;
    };
  }, []);

  const models = useMemo(() => {
    if (!data || data === "unavailable") return [];
    const q = query.trim().toLowerCase();
    return data.models
      .filter((m) => !q || `${m.name} ${m.reference} ${m.id} ${m.hook}`.toLowerCase().includes(q))
      .map((m) => ({
        ...m,
        qaBadge: m.qa ? (QA_LABEL[m.qa.status] ?? { label: m.qa.status, tone: "neutral" as const }) : { label: "Pas encore rendu", tone: "warning" as const },
        sameCount: m.original.length === m.copy.length,
        ratio: aspectRatio(m.aspect),
      }));
  }, [data, query]);

  return {
    loading: data === null,
    unavailable: data === "unavailable",
    root: data && data !== "unavailable" ? data.root : "",
    total: data && data !== "unavailable" ? data.models.length : 0,
    favourites: data && data !== "unavailable" ? data.favourites : 0,
    models,
    query,
    setQuery,
  };
}

function aspectRatio(aspect: string): string {
  const [w, h] = aspect.split(":").map(Number);
  return w && h ? `${w} / ${h}` : "9 / 16";
}
