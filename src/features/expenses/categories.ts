// Labels and colors of expense categories. Colors follow the category (fixed slot), never its rank.
export const CATEGORIES: { key: string; label: string }[] = [
  { key: "ugc", label: "UGC" },
  { key: "ai", label: "IA" },
  { key: "infra", label: "Infra & domaines" },
  { key: "tools", label: "Outils & SaaS" },
  { key: "ads", label: "Publicité" },
  { key: "apple", label: "Apple" },
  { key: "freelance", label: "Freelances" },
  { key: "fees", label: "Frais bancaires" },
  { key: "other", label: "Autre" },
];

export const EXCLUDED_KEY = "excluded";

/** Chart groups (server: CHART_GROUPS). Apps use series 1-3, so categories take 4-8 + neutral. */
export const GROUPS: Record<string, { label: string; color: string }> = {
  ugc: { label: "UGC", color: "var(--series-4)" },
  ai: { label: "IA", color: "var(--series-5)" },
  infra: { label: "Infra & domaines", color: "var(--series-6)" },
  tools: { label: "Outils & SaaS", color: "var(--series-7)" },
  ads: { label: "Publicité", color: "var(--series-8)" },
  rest: { label: "Autres", color: "var(--series-other)" },
};

export function categoryLabel(key: string): string {
  if (key === EXCLUDED_KEY) return "Ignorer (pas une dépense)";
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function categoryColor(key: string): string {
  return (GROUPS[key] ?? GROUPS.rest).color;
}

export const SOURCE_LABELS: Record<string, string> = {
  bank_csv: "Relevé",
  manual: "Manuel",
  recurring: "Mensuel",
  openai_api: "API OpenAI",
  anthropic_api: "API Anthropic",
  ugc_airtable: "UGC",
};

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];
