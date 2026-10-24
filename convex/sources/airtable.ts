"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { AIRTABLE_BASE_ID, AIRTABLE_TABLES, UGC_SOURCE, type AirtableRecord } from "../ugcData";

// Airtable UGC base sync (read-only: GET only). Env: AIRTABLE_TOKEN (personal access token,
// scope data.records:read on appDXNkfK2prnjyud). Without it the run is recorded as skipped.

async function listAll(token: string, tableId: string, fields: readonly string[]): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ pageSize: "100" });
    fields.forEach((f) => q.append("fields[]", f));
    if (offset) q.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${res.status} on ${tableId}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    out.push(...json.records.map((r) => ({ id: r.id, createdTime: r.createdTime, fields: r.fields ?? {} })));
    offset = json.offset;
    if (!offset) break;
    await new Promise((resolve) => setTimeout(resolve, 220)); // Airtable: 5 requests / s per base
  }
  return out;
}

export const syncRecent = internalAction({
  args: {},
  handler: async (ctx): Promise<{ skipped: boolean; creators?: number; videos?: number; outreach?: number; applications?: number }> => {
    const runId: Id<"syncRuns"> = await ctx.runMutation(internal.syncRuns.start, { source: UGC_SOURCE });
    const token = process.env.AIRTABLE_TOKEN;
    if (!token) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "skipped", message: "AIRTABLE_TOKEN manquant" });
      return { skipped: true };
    }
    try {
      // Sequential on purpose: one base, 5 requests per second at most.
      const creators = await listAll(token, AIRTABLE_TABLES.creators.id, AIRTABLE_TABLES.creators.fields);
      const productions = await listAll(token, AIRTABLE_TABLES.productions.id, AIRTABLE_TABLES.productions.fields);
      const outreach = await listAll(token, AIRTABLE_TABLES.outreach.id, AIRTABLE_TABLES.outreach.fields);
      const applications = await listAll(token, AIRTABLE_TABLES.applications.id, AIRTABLE_TABLES.applications.fields);
      const counts = await ctx.runMutation(internal.ugcData.applyApiSnapshot, { runId, creators, productions, outreach, applications });
      return { skipped: false, ...counts };
    } catch (error) {
      await ctx.runMutation(internal.syncRuns.finish, { runId, status: "error", message: String(error).slice(0, 500) });
      throw error;
    }
  },
});
