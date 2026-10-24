import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { addDays, isoDay } from "./lib/dates";
import { convertToEur, fetchEurRates, ratesForDay } from "./lib/fx";

// FX model. Rates are written by the Apple sales sync (one fetch per report day) and by syncRecent (cron).

/** Insert or update the rates of one day (1 EUR = perEur units). */
export const upsertDay = internalMutation({
  args: { date: v.string(), rates: v.record(v.string(), v.number()) },
  handler: async (ctx, { date, rates }) => {
    const existing = await ctx.db.query("fxRates").withIndex("by_date_currency", (q) => q.eq("date", date)).collect();
    const byCurrency = new Map(existing.map((row) => [row.currency, row]));
    let written = 0;
    for (const [currency, perEur] of Object.entries(rates)) {
      const row = byCurrency.get(currency);
      if (!row) await ctx.db.insert("fxRates", { date, currency, perEur });
      else if (row.perEur !== perEur) await ctx.db.patch(row._id, { perEur });
      else continue;
      written++;
    }
    return written;
  },
});

/** Rates for a day (nearest earlier stored day when missing). */
export const ratesOn = internalQuery({
  args: { day: v.string() },
  handler: (ctx, { day }) => ratesForDay(ctx.db, day),
});

/** Fetch and store the last 7 days of rates (cheap; for the cron). */
export const syncRecent = internalAction({
  args: {},
  handler: async (ctx) => {
    const runId = await ctx.runMutation(internal.syncRuns.start, { source: "fx" });
    const today = isoDay(new Date());
    let days = 0;
    let missing = 0;
    try {
      for (let i = 0; i < 7; i++) {
        const day = addDays(today, -i);
        const rates = await fetchEurRates(day);
        if (!rates) {
          missing++;
          continue;
        }
        await ctx.runMutation(internal.fx.upsertDay, { date: day, rates });
        days++;
      }
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "ok", rows: days, message: missing ? `${missing} jour(s) pas encore publiés` : undefined });
    } catch (error) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String(error).slice(0, 500) });
      throw error;
    }
  },
});

/** Convert an amount to EUR on a given day (public, for the UI and other features). */
export const toEur = authQuery({
  args: { amount: v.number(), currency: v.string(), day: v.string() },
  handler: async (ctx, { amount, currency, day }) => {
    const { date, rates } = await ratesForDay(ctx.db, day);
    return { eur: convertToEur(amount, currency, rates), rateDate: date };
  },
});
