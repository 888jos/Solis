import { api } from "@convex/_generated/api";
import type { recent as recentBriefsQuery } from "@convex/brief";
import { VAT_RATES } from "@convex/lib/vat";
import type { envPresence as envPresenceQuery } from "@convex/sources";
import type { RegisteredQuery } from "convex/server";
import { useMemo, useState } from "react";
import { APPS } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { formatAgo, formatDayLong, formatPct } from "@/lib/format";
import { clearToken } from "@/lib/session";
import { getThemePref, setThemePref, type ThemePref } from "./theme";

type QueryResult<Q> = Q extends RegisteredQuery<any, any, infer R> ? Awaited<R> : never;
type EnvPresence = QueryResult<typeof envPresenceQuery>;
type Briefs = QueryResult<typeof recentBriefsQuery>;

const CONVEX_ENV_URL = "https://dashboard.convex.dev/t/driftstudio/solis-cb1d5/giddy-bullfrog-898/settings/environment-variables";

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

export const MONEY_DEFINITIONS = [
  { term: "Brut (TTC)", text: "Ce que les clients ont payé, TVA ou sales tax comprise : prix client Apple × unités." },
  { term: "HT", text: "Le brut sans la TVA du pays (table ci-dessous). Aux États-Unis et au Canada, le prix Apple est déjà hors taxe." },
  { term: "Net", text: "Les proceeds Apple : après TVA et commission Small Business de 15 %. C'est ce qui arrive sur le compte." },
  { term: "Dépenses", text: "Tout ce qui sort : relevés bancaires, saisies manuelles, coûts API, paiements créateurs UGC." },
  { term: "Marge", text: "Net − Dépenses." },
  { term: "Conversion en euros", text: "Chaque montant est converti au taux du jour de la vente ; le montant d'origine est conservé." },
];

type Need = { key: string; title: string; unlocks: string; where: string; link?: { href: string; label: string }; done: boolean };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function useSettingsViewModel() {
  const env = useSolisQuery(api.sources.envPresence, {}) as EnvPresence | undefined;
  const briefs = useSolisQuery(api.brief.recent, {}) as Briefs | undefined;
  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  const changeTheme = (pref: ThemePref) => {
    setThemePref(pref);
    setTheme(pref);
  };

  const forgetDevice = () => {
    clearToken();
    window.location.assign("/");
  };

  const apps = APPS.map((a) => ({
    slug: a.slug,
    name: a.name,
    storeName: a.storeName,
    appStoreId: a.appStoreId,
    bundleId: a.bundleId,
    sku: a.sku,
    storeUrl: `https://apps.apple.com/app/id${a.appStoreId}`,
  }));

  const vat = useMemo(() => {
    const byRate = new Map<number, string[]>();
    for (const [cc, rate] of Object.entries(VAT_RATES)) byRate.set(rate, [...(byRate.get(rate) ?? []), cc]);
    const groups = [...byRate.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rate, countries]) => ({ key: String(rate), rate: formatPct(rate, 2), count: countries.length, countries: countries.sort().join(" ") }));
    const total = Object.keys(VAT_RATES).length;
    const zero = byRate.get(0)?.length ?? 0;
    const pick = ["FR", "DE", "GB", "ES", "IT", "JP", "US"].map((cc) => ({ cc, rate: formatPct(VAT_RATES[cc] ?? 0, 1) }));
    return { groups, total, zero, pick };
  }, []);

  const envView = useMemo(() => {
    if (!env) return null;
    const present = new Set(env.groups.flatMap((g) => g.vars.filter((x) => x.present).map((x) => x.name)));
    const has = (...names: string[]) => names.every((n) => present.has(n));
    const needs: Need[] = [
      {
        key: "bank",
        title: "Export CSV du compte bancaire",
        unlocks: "Dépenses, Rentabilité",
        where: "Exporte les opérations depuis ta banque, puis Dépenses → Importer.",
        link: { href: "/depenses", label: "Ouvrir Dépenses" },
        done: env.hasBankImport,
      },
      {
        key: "openai",
        title: "OPENAI_ADMIN_KEY",
        unlocks: "Coûts OpenAI au jour près dans Dépenses",
        where: "platform.openai.com → Settings → Organization → Admin keys (lecture des coûts), puis variable Convex.",
        link: { href: CONVEX_ENV_URL, label: "Variables Convex" },
        done: has("OPENAI_ADMIN_KEY"),
      },
      {
        key: "anthropic",
        title: "ANTHROPIC_ADMIN_KEY",
        unlocks: "Coûts Anthropic au jour près dans Dépenses",
        where: "console.anthropic.com → Settings → Admin keys, puis variable Convex.",
        link: { href: CONVEX_ENV_URL, label: "Variables Convex" },
        done: has("ANTHROPIC_ADMIN_KEY"),
      },
      {
        key: "airtable",
        title: "AIRTABLE_TOKEN",
        unlocks: "Créateurs UGC à jour toutes les 6 h",
        where: "airtable.com/create/tokens : scope data.records:read sur la base appDXNkfK2prnjyud, puis variable Convex.",
        link: { href: CONVEX_ENV_URL, label: "Variables Convex" },
        done: has("AIRTABLE_TOKEN"),
      },
      {
        key: "rc-cocorise",
        title: "RevenueCat Cocorise",
        unlocks: "MRR et essais RevenueCat de Cocorise",
        where: "RevenueCat → projet Cocorise → API keys : clé secrète v2 en lecture seule + Project ID, en REVENUECAT_COCORISE_SECRET_KEY / _PROJECT_ID. La synchro ne lit encore que CortiFree.",
        link: { href: CONVEX_ENV_URL, label: "Variables Convex" },
        done: has("REVENUECAT_COCORISE_SECRET_KEY", "REVENUECAT_COCORISE_PROJECT_ID"),
      },
      {
        key: "rc-questirl",
        title: "RevenueCat Quest IRL",
        unlocks: "MRR et essais RevenueCat de Quest IRL",
        where: "RevenueCat → projet Quest IRL → API keys : clé secrète v2 en lecture seule + Project ID, en REVENUECAT_QUESTIRL_SECRET_KEY / _PROJECT_ID. La synchro ne lit encore que CortiFree.",
        link: { href: CONVEX_ENV_URL, label: "Variables Convex" },
        done: has("REVENUECAT_QUESTIRL_SECRET_KEY", "REVENUECAT_QUESTIRL_PROJECT_ID"),
      },
      {
        key: "telegram",
        title: "Bot Telegram",
        unlocks: "Brief du matin et récap du lundi",
        where: "TELEGRAM_BOT_TOKEN (BotFather) et TELEGRAM_CHAT_ID, en variables Convex.",
        link: { href: CONVEX_ENV_URL, label: "Variables Convex" },
        done: has("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"),
      },
    ];
    const groups = env.groups.map((g) => ({
      group: g.group,
      optional: g.optional,
      vars: g.vars,
      count: `${g.vars.filter((x) => x.present).length}/${g.vars.length}`,
    }));
    return { todo: needs.filter((n) => !n.done), done: needs.filter((n) => n.done), groups };
  }, [env]);

  const briefView = useMemo(() => {
    if (!briefs) return null;
    return briefs.map((b) => ({
      id: b.id,
      title: `${b.kind === "daily" ? "Brief du jour" : "Récap de la semaine"} · ${formatDayLong(b.date)}`,
      status: b.sentAt ? { label: `Envoyé ${formatAgo(b.sentAt)}`, status: "good" as const } : { label: "Non envoyé", status: "critical" as const },
      error: b.error,
      text: stripHtml(b.text),
    }));
  }, [briefs]);

  return {
    theme,
    changeTheme,
    forgetDevice,
    apps,
    money: MONEY_DEFINITIONS,
    vat,
    env: envView,
    convexEnvUrl: CONVEX_ENV_URL,
    briefs: briefView,
    loading: env === undefined,
  };
}
