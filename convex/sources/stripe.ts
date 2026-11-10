import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { addDays, isoDay } from "../lib/dates";
import { fetchRetry } from "../lib/http";

// Stripe (Otto, ottoknows.it): balance transactions → per-day gross, Stripe fees, refunds and net
// (what reaches the bank). Read-only: needs a restricted key with "Balance transactions: read",
// STRIPE_OTTO_KEY on Convex. Amounts are in the settlement currency (EUR expected).

const SOURCE = "stripe_otto";

type Tx = { id: string; amount: number; fee: number; net: number; currency: string; type: string; created: number };

async function listTransactions(key: string, since: number): Promise<Tx[]> {
  const out: Tx[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ limit: "100", "created[gte]": String(since) });
    if (after) q.set("starting_after", after);
    const res = await fetchRetry(`https://api.stripe.com/v1/balance_transactions?${q}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data: Tx[]; has_more: boolean };
    out.push(...json.data);
    if (!json.has_more || !json.data.length) break;
    after = json.data[json.data.length - 1].id;
  }
  return out;
}

async function syncFrom(ctx: ActionCtx, from: string) {
  const runId = await ctx.runMutation(internal.syncRuns.start, { source: SOURCE });
  const key = process.env.STRIPE_OTTO_KEY;
  if (!key) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "Il manque STRIPE_OTTO_KEY" });
    return "skipped";
  }
  try {
    const txs = await listTransactions(key, Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000));
    const byDay = new Map<string, { day: string; currency: string; gross: number; fees: number; refunds: number; net: number; charges: number }>();
    for (const t of txs) {
      const day = isoDay(new Date(t.created * 1000));
      const d = byDay.get(day) ?? { day, currency: t.currency.toUpperCase(), gross: 0, fees: 0, refunds: 0, net: 0, charges: 0 };
      if (t.type === "charge" || t.type === "payment") {
        d.gross += t.amount / 100;
        d.charges += 1;
      } else if (t.type === "refund" || t.type === "payment_refund") {
        d.refunds += -t.amount / 100;
      }
      if (t.type !== "payout" && t.type !== "transfer") {
        d.fees += t.fee / 100;
        d.net += t.net / 100;
      }
      byDay.set(day, d);
    }
    const days = [...byDay.values()].map((d) => ({ ...d, gross: r2(d.gross), fees: r2(d.fees), refunds: r2(d.refunds), net: r2(d.net) }));
    const foreign = days.filter((d) => d.currency !== "EUR");
    if (foreign.length) throw new Error(`Devise de règlement ${foreign[0].currency} non gérée (EUR attendu)`);
    const written: number = await ctx.runMutation(internal.paid.upsertStripeDays, { project: "otto", days });
    const net = days.reduce((t, d) => t + d.net, 0);
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: written, message: `${txs.length} transactions depuis le ${from}, net ${net.toFixed(2)} €` });
    return "ok";
  } catch (err) {
    await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String((err as Error).message ?? err).slice(0, 300) });
    return "error";
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cron: last 7 days (refunds and fees can land after the charge). */
export const syncRecent = internalAction({ args: {}, handler: (ctx) => syncFrom(ctx, addDays(isoDay(new Date()), -7)) });

export const backfill = internalAction({ args: { from: v.optional(v.string()) }, handler: (ctx, { from }) => syncFrom(ctx, from ?? "2026-09-01") });
