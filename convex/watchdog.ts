import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
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

type Anomaly = { key: string; project: string; metric: string; day: string; value: number; baseline: number; change: number };

export const checkSources = internalAction({
  args: {},
  handler: async (ctx): Promise<{ changes: number }> => {
    const statuses: SourceStatusRow[] = await ctx.runQuery(internal.sources.statusesInternal, {});
    const opened: Doc<"alerts">[] = await ctx.runQuery(internal.watchdog.openAlerts, { kind: "source" });
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

const PROJECT_NAME: Record<string, string> = { studio: "Studio", cortifree: "CortiFree", cocorise: "Cocorise", questirl: "Quest IRL", otto: "Otto" };
const METRIC_NAME: Record<string, string> = { net: "net", downloads: "téléchargements", reports: "rapports", payments: "paiements" };

function fmt(metric: string, n: number): string {
  if (metric === "net") return `${n.toFixed(2).replace(".", ",")} €`;
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/** Daily: unusual moves on the last data day (vs the same weekday of the 4 previous weeks). */
export const checkAnomalies = internalAction({
  args: {},
  handler: async (ctx): Promise<{ found: number; sent: number }> => {
    const found: Anomaly[] = await ctx.runQuery(internal.pilot.anomalies, {});
    const opened: Doc<"alerts">[] = await ctx.runQuery(internal.watchdog.openAlerts, { kind: "anomaly" });
    const openKeys = new Set(opened.map((a) => a.key));
    const fresh = new Set(found.map((f) => f.key));
    // Yesterday's anomalies are history once a newer day has been checked.
    for (const a of opened) if (!fresh.has(a.key)) await ctx.runMutation(internal.watchdog.resolve, { id: a._id });
    const lines: string[] = [];
    for (const f of found) {
      if (openKeys.has(f.key)) continue;
      const pct = Math.round(f.change * 100);
      const message = `${PROJECT_NAME[f.project] ?? f.project} : ${METRIC_NAME[f.metric] ?? f.metric} ${pct > 0 ? "+" : "−"}${Math.abs(pct)} % le ${f.day} (${fmt(f.metric, f.value)} vs ${fmt(f.metric, f.baseline)} d'habitude)`;
      await ctx.runMutation(internal.watchdog.open, { key: f.key, kind: "anomaly", message });
      lines.push(`${pct > 0 ? "📈" : "📉"} ${esc(message)}`);
    }
    if (lines.length && telegramConfigured()) await sendTelegram(`<b>Solis · inhabituel</b>\n${lines.join("\n")}`);
    return { found: found.length, sent: lines.length };
  },
});
