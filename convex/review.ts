"use node";

import Anthropic from "@anthropic-ai/sdk";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { authAction } from "./lib/auth";
import { addDays } from "./lib/dates";
import { sendTelegram, telegramConfigured } from "./sources/telegram";

// Weekly review (cron Monday, after Apple has published Sunday): Claude reads the week's aggregates
// (pilot.weeklyFacts: numbers only, no personal data) and writes a short French review with three
// decisions. Stored in `reviews`, shown on Aujourd'hui and sent on Telegram.
// Needs ANTHROPIC_API_KEY on Convex (a regular API key, not the admin key used for costs).

const MODEL = "claude-opus-5-5";

const SYSTEM = `Tu es le copilote de Jos, fondateur solo d'un studio d'apps (CortiFree, Cocorise, Quest IRL sur l'App Store, et Otto, un site web à 12,90 € qui analyse des conversations, promu par des vidéos TikTok/Instagram).
Chaque lundi, tu reçois les chiffres de la semaine en JSON (7 derniers jours de données vs les 7 d'avant, objectifs du mois, expériences, alertes, annotations, vidéos Otto).
Écris la revue de la semaine en français, pour Telegram, en texte simple (pas de Markdown, pas de tableau), 1 200 caractères maximum :
1. « La semaine » : 2 ou 3 phrases sur ce qui a bougé, chiffres à l'appui.
2. « Ce qui marche » et « Ce qui coince » : 2 puces chacun, avec le chiffre qui le montre.
3. « 3 décisions » : trois actions concrètes pour la semaine, chacune liée à un chiffre du JSON.
N'invente aucun chiffre : n'utilise que ceux du JSON, et dis-le quand une donnée manque (valeur null). Sois direct, sans formule de politesse.`;

function paris(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

async function writeReview(facts: unknown): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "high" },
    // On a policy decline, the API retries on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Chiffres de la semaine :\n${JSON.stringify(facts)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude a refusé d'écrire la revue");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error(`Réponse vide (stop_reason ${response.stop_reason})`);
  return text;
}

async function run(ctx: ActionCtx, send: boolean): Promise<{ status: string; text: string }> {
  const startedAt = Date.now();
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: "weekly_review" });
  if (!process.env.ANTHROPIC_API_KEY) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "Il manque ANTHROPIC_API_KEY" });
    return { status: "skipped", text: "" };
  }
  try {
    const facts = await ctx.runQuery(internal.pilot.weeklyFacts, {});
    const text = await writeReview(facts);
    const today = paris(startedAt);
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    const weekStart = addDays(today, -weekday - 7);
    const weekEnd = addDays(weekStart, 6);
    let sentAt: number | undefined;
    if (send && telegramConfigured()) {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const res = await sendTelegram(`<b>Revue de la semaine</b> (${weekStart} → ${weekEnd})\n\n${esc(text)}`);
      if (res.ok) sentAt = Date.now();
    }
    await ctx.runMutation(internal.pilot.storeReview, { weekStart, weekEnd, text, model: MODEL, sentAt });
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: 1, message: sentAt ? "revue envoyée" : "revue écrite" });
    return { status: "ok", text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: message.slice(0, 400) });
    return { status: "error", text: message };
  }
}

export const weekly = internalAction({ args: {}, handler: (ctx) => run(ctx, true) });

/** "Écrire maintenant" from the Aujourd'hui page: writes and stores, without Telegram. */
export const writeNow = authAction({ args: {}, handler: (ctx): Promise<{ status: string; text: string }> => run(ctx, false) });
