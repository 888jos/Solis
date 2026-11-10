import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { SourceStatusRow } from "./sources";
import { sendTelegram, telegramConfigured } from "./sources/telegram";

// Hourly watchdog: a source that fails, falls behind or gets interrupted triggers one Telegram
// message when it starts and one when it is back. Open alerts live in the `alerts` table.

const BAD = new Set(["error", "late", "interrupted"]);

const LABEL: Record<string, string> = { error: "en erreur", late: "en retard", interrupted: "interrompue" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const openAlerts = internalQuery({
  args: { kind: v.union(v.literal("source"), v.literal("anomaly")) },
  handler: async (ctx, { kind }) => {
    const rows = await ctx.db.query("alerts").withIndex("by_opened").order("desc").take(500);
    return rows.filter((r) => r.kind === kind && r.resolvedAt === undefined);
  },
});

export const open = internalMutation({
  args: { key: v.string(), kind: v.union(v.literal("source"), v.literal("anomaly")), message: v.string() },
  handler: (ctx, args) => ctx.db.insert("alerts", { ...args, openedAt: Date.now() }),
});

export const resolve = internalMutation({
  args: { id: v.id("alerts") },
  handler: (ctx, { id }) => ctx.db.patch(id, { resolvedAt: Date.now() }),
});

export const checkSources = internalAction({
  args: {},
  handler: async (ctx) => {
    const statuses: SourceStatusRow[] = await ctx.runQuery(internal.sources.statusesInternal, {});
    const opened = await ctx.runQuery(internal.watchdog.openAlerts, { kind: "source" });
    const openByKey = new Map(opened.map((a) => [a.key, a]));
    const lines: string[] = [];

    for (const s of statuses) {
      const key = `source:${s.source}`;
      const bad = BAD.has(s.health);
      const existing = openByKey.get(key);
      if (bad && !existing) {
        const detail = s.health === "error" && s.lastErrorMessage ? ` : ${s.lastErrorMessage.slice(0, 160)}` : "";
        const message = `${s.name} ${LABEL[s.health]}${detail}`;
        await ctx.runMutation(internal.watchdog.open, { key, kind: "source", message });
        lines.push(`🔴 ${esc(message)}`);
      } else if (!bad && existing) {
        await ctx.runMutation(internal.watchdog.resolve, { id: existing._id });
        lines.push(`🟢 ${esc(s.name)} est rétablie`);
      }
    }

    if (lines.length && telegramConfigured()) {
      await sendTelegram(`<b>Solis · sources</b>\n${lines.join("\n")}\n\nDétail : page Sources.`);
    }
    return { changes: lines.length };
  },
});
