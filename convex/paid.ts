import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authQuery } from "./lib/auth";
import { addDays } from "./lib/dates";

// Model for Stripe (Otto) and paid acquisition (Meta Ads): writes from the syncs, and the
// "Pub payante" summary of the Acquisition page (spend, installs, CPI per campaign).

const stripeDay = v.object({ day: v.string(), currency: v.string(), gross: v.number(), fees: v.number(), refunds: v.number(), net: v.number(), charges: v.number() });

export const upsertStripeDays = internalMutation({
  args: { project: v.string(), days: v.array(stripeDay) },
  handler: async (ctx, { project, days }) => {
    const now = Date.now();
    for (const d of days) {
      const existing = await ctx.db.query("stripeDaily").withIndex("by_project_day", (q) => q.eq("project", project).eq("day", d.day)).first();
      if (existing) await ctx.db.patch(existing._id, { ...d, syncedAt: now });
      else await ctx.db.insert("stripeDaily", { project, ...d, syncedAt: now });
    }
    return days.length;
  },
});

const adRow = v.object({ appSlug: v.string(), day: v.string(), campaignId: v.string(), campaignName: v.string(), spendEur: v.number(), impressions: v.number(), clicks: v.number(), installs: v.number() });

export const upsertAdDays = internalMutation({
  args: { channel: v.string(), rows: v.array(adRow) },
  handler: async (ctx, { channel, rows }) => {
    const now = Date.now();
    for (const r of rows) {
      const existing = await ctx.db.query("adDaily").withIndex("by_campaign_day", (q) => q.eq("campaignId", r.campaignId).eq("day", r.day)).first();
      if (existing) await ctx.db.patch(existing._id, { ...r, channel, syncedAt: now });
      else await ctx.db.insert("adDaily", { ...r, channel, syncedAt: now });
    }
    return rows.length;
  },
});

/** Paid acquisition over [from, to], with the previous window for deltas. */
export const adsSummary = authQuery({
  args: { from: v.string(), to: v.string(), app: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { from, to, app }) => {
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    const prevFrom = addDays(from, -span);
    const rows = (await ctx.db.query("adDaily").withIndex("by_day", (q) => q.gte("day", prevFrom).lte("day", to)).collect()).filter((r) => !app || r.appSlug === app);
    const any = rows.length > 0 || (await ctx.db.query("adDaily").first()) != null;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const cur = { spend: 0, installs: 0, clicks: 0, impressions: 0 };
    const prev = { spend: 0, installs: 0 };
    const campaigns = new Map<string, { name: string; appSlug: string; channel: string; spend: number; installs: number; clicks: number; impressions: number }>();
    for (const r of rows) {
      if (r.day < from) {
        prev.spend += r.spendEur;
        prev.installs += r.installs;
        continue;
      }
      cur.spend += r.spendEur;
      cur.installs += r.installs;
      cur.clicks += r.clicks;
      cur.impressions += r.impressions;
      const c = campaigns.get(r.campaignId) ?? { name: r.campaignName, appSlug: r.appSlug, channel: r.channel, spend: 0, installs: 0, clicks: 0, impressions: 0 };
      c.spend += r.spendEur;
      c.installs += r.installs;
      c.clicks += r.clicks;
      c.impressions += r.impressions;
      campaigns.set(r.campaignId, c);
    }
    const lastSync = await ctx.db.query("syncRuns").withIndex("by_source_started", (q) => q.eq("source", "meta_ads")).order("desc").first();
    return {
      connected: any,
      configured: !!process.env.META_ACCESS_TOKEN && !!process.env.META_AD_ACCOUNT_ID,
      spend: round2(cur.spend),
      prevSpend: round2(prev.spend),
      installs: cur.installs,
      prevInstalls: prev.installs,
      clicks: cur.clicks,
      impressions: cur.impressions,
      cpi: cur.installs ? round2(cur.spend / cur.installs) : null,
      prevCpi: prev.installs ? round2(prev.spend / prev.installs) : null,
      campaigns: [...campaigns].map(([id, c]) => ({ id, ...c, spend: round2(c.spend), cpi: c.installs ? round2(c.spend / c.installs) : null })).sort((a, b) => b.spend - a.spend),
      syncedAt: lastSync?.finishedAt ?? null,
    };
  },
});
