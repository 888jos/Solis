// Pure ASO rules: App Store limits, character counts and metadata warnings. No React, no Convex.

export const LIMITS = { name: 30, subtitle: 30, keywords: 100, promo: 170 } as const;
export type FieldKey = keyof typeof LIMITS;

export type Severity = "critical" | "warning" | "neutral";
export type Issue = { severity: Severity; label: string };

export type LocaleMeta = {
  name?: string;
  subtitle?: string;
  keywords?: string;
  promotionalText?: string;
};

/** App Store Connect counts characters (code points), not bytes. */
export function charCount(text: string | undefined): number {
  return text ? [...text].length : 0;
}

/** Connecting words that are not worth flagging as duplicates. */
const STOPWORDS = new Set(["and", "the", "for", "your", "you", "with", "och", "und", "mit", "der", "die", "das", "les", "des", "ton", "ta", "tes", "pour", "avec", "del", "los", "las", "con", "para", "tu", "og", "per", "il", "di", "med", "til", "for"]);

/** Words as the App Store index sees them: lowercase, split on anything that is not a letter or digit. */
export function words(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export function keywordEntries(keywords: string | undefined): string[] {
  if (!keywords) return [];
  return keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Words that waste space: present in the keywords field and already in name/subtitle (Apple indexes them
 * there), repeated inside the keywords field, or shared by name and subtitle.
 */
export function duplicatedWords(meta: LocaleMeta): { inTitle: string[]; repeated: string[]; nameSubtitle: string[] } {
  const nameWords = new Set(words(meta.name));
  const subtitleWords = new Set(words(meta.subtitle));
  const titleWords = new Set([...nameWords, ...subtitleWords]);
  const kw = keywordEntries(meta.keywords).flatMap((entry) => words(entry));
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const w of kw) {
    if (seen.has(w)) repeated.add(w);
    seen.add(w);
  }
  return {
    inTitle: [...seen].filter((w) => titleWords.has(w)),
    repeated: [...repeated],
    nameSubtitle: [...subtitleWords].filter((w) => nameWords.has(w)),
  };
}

/** Spaces after commas count against the 100 characters for nothing. */
export function wastedSpaces(keywords: string | undefined): number {
  return keywords ? (keywords.match(/,\s+|\s+,/g) ?? []).reduce((n, m) => n + m.replace(",", "").length, 0) : 0;
}

export function localeIssues(meta: LocaleMeta): Issue[] {
  const out: Issue[] = [];
  const counts = {
    name: charCount(meta.name),
    subtitle: charCount(meta.subtitle),
    keywords: charCount(meta.keywords),
    promo: charCount(meta.promotionalText),
  };
  (Object.keys(LIMITS) as FieldKey[]).forEach((key) => {
    if (counts[key] > LIMITS[key]) out.push({ severity: "critical", label: `${FIELD_LABELS[key]} trop long (${counts[key]}/${LIMITS[key]})` });
  });
  if (!counts.name) out.push({ severity: "critical", label: "Nom vide" });
  if (!counts.subtitle) out.push({ severity: "warning", label: "Sous-titre vide" });
  if (!counts.keywords) out.push({ severity: "critical", label: "Champ mots-clés vide" });
  else if (LIMITS.keywords - counts.keywords >= 5) out.push({ severity: "warning", label: `${LIMITS.keywords - counts.keywords} caractères de mots-clés inutilisés` });
  const spaces = wastedSpaces(meta.keywords);
  if (spaces > 0) out.push({ severity: "warning", label: `${spaces} espace${spaces > 1 ? "s" : ""} autour des virgules` });
  const dup = duplicatedWords(meta);
  if (dup.inTitle.length) out.push({ severity: "warning", label: `Déjà dans le nom/sous-titre : ${dup.inTitle.join(", ")}` });
  if (dup.repeated.length) out.push({ severity: "warning", label: `Répété dans les mots-clés : ${dup.repeated.join(", ")}` });
  if (dup.nameSubtitle.length) out.push({ severity: "warning", label: `Dans le nom et le sous-titre : ${dup.nameSubtitle.join(", ")}` });
  if (!counts.promo) out.push({ severity: "neutral", label: "Texte promo vide" });
  return out;
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Nom",
  subtitle: "Sous-titre",
  keywords: "Mots-clés",
  promo: "Texte promo",
};

/** Rank change over 7 days, positive = better (moved up). */
export type RankMove =
  | { kind: "up" | "down" | "same"; delta: number }
  | { kind: "entered" | "left" | "none" | "new" };

export function rankMove(rank: number | null, measured: boolean, prevRank: number | null, prevMeasured: boolean): RankMove {
  if (!measured) return { kind: "none" };
  if (!prevMeasured) return { kind: "new" };
  if (rank == null && prevRank == null) return { kind: "none" };
  if (prevRank == null) return { kind: "entered" };
  if (rank == null) return { kind: "left" };
  const delta = prevRank - rank;
  return { kind: delta > 0 ? "up" : delta < 0 ? "down" : "same", delta: Math.abs(delta) };
}

export type RankBucket = "top10" | "top50" | "top200" | "absent";
export function rankBucket(rank: number | null): RankBucket {
  if (rank == null) return "absent";
  if (rank <= 10) return "top10";
  if (rank <= 50) return "top50";
  return "top200";
}
