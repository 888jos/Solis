"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { APPS } from "../lib/apps";
import { isoDay } from "../lib/dates";
import { storefrontOf } from "../reviewsData";
import { ascGetAll } from "./asc";

// Reviews (App Store Connect customerReviews) + ratings per storefront (public iTunes Lookup).
// Read-only on both APIs. syncRecent is cheap enough to run daily: it re-reads every review
// (a few pages at most) so new answers and deleted reviews are picked up too.

/** Storefronts checked every day (ratings can exist without any written review). */
const STOREFRONTS = (
  "us fr gb de ca au es it jp kr br mx nl be ch pl at se no dk fi ie pt nz in sg hk tw cn ru tr ae sa il za " +
  "ar cl co cz hu ro gr ua th id my ph vn lu pe eg ng kz sk si hr bg lt lv ee is"
).split(" ");

type AscReview = {
  id: string;
  attributes: { rating: number; title?: string; body?: string; reviewerNickname?: string; createdDate: string; territory: string };
  relationships?: { response?: { data: { id: string } | null } };
};

async function syncReviews(ctx: any): Promise<{ total: number; written: number; removed: number; territories: string[] }> {
  let total = 0;
  let written = 0;
  let removed = 0;
  const territories = new Set<string>();
  for (const app of APPS) {
    const data = await ascGetAll<AscReview>(`/v1/apps/${app.appStoreId}/customerReviews?limit=200&sort=-createdDate&include=response`, 50);
    const reviews = data.map((r) => ({
      reviewId: r.id,
      rating: r.attributes.rating,
      title: r.attributes.title || undefined,
      body: r.attributes.body || undefined,
      nickname: r.attributes.reviewerNickname || undefined,
      territory: r.attributes.territory,
      // Stored in UTC so string order = time order.
      createdAt: new Date(r.attributes.createdDate).toISOString(),
      hasResponse: r.relationships?.response?.data != null,
    }));
    reviews.forEach((r) => territories.add(r.territory));
    total += reviews.length;
    for (let i = 0; i < reviews.length; i += 200) {
      written += (await ctx.runMutation(internal.reviewsData.upsertReviews, { appSlug: app.slug, reviews: reviews.slice(i, i + 200) })) as number;
    }
    removed += (await ctx.runMutation(internal.reviewsData.pruneReviews, { appSlug: app.slug, keepIds: reviews.map((r) => r.reviewId) })) as number;
  }
  return { total, written, removed, territories: [...territories] };
}

async function lookup(country: string): Promise<any[]> {
  const ids = APPS.map((a) => a.appStoreId).join(",");
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const res = await fetch(`https://itunes.apple.com/lookup?id=${ids}&country=${country}`);
    if (res.ok) return ((await res.json()) as any).results ?? [];
    lastError = `${res.status}`;
  }
  throw new Error(`iTunes Lookup ${country}: ${lastError}`);
}

async function syncRatings(ctx: any, extraStorefronts: string[]): Promise<{ countries: number; withRatings: number; failed: string[] }> {
  const date = isoDay(new Date());
  const countries = [...new Set([...STOREFRONTS, ...extraStorefronts])];
  const rows: { appSlug: string; country: string; averageRating: number | null; ratingCount: number }[] = [];
  const failed: string[] = [];
  for (const country of countries) {
    let results: any[];
    try {
      results = await lookup(country);
    } catch {
      failed.push(country);
      continue;
    }
    for (const app of APPS) {
      const hit = results.find((r) => String(r.trackId) === app.appStoreId);
      const count = Number(hit?.userRatingCount ?? 0);
      // Only storefronts with at least one rating are stored; an empty storefront adds nothing.
      if (!hit || count <= 0) continue;
      rows.push({ appSlug: app.slug, country, averageRating: typeof hit.averageUserRating === "number" ? hit.averageUserRating : null, ratingCount: count });
    }
  }
  if (failed.length === countries.length) throw new Error("iTunes Lookup unreachable for every storefront");
  await ctx.runMutation(internal.reviewsData.upsertRatings, { date, rows });
  return { countries: countries.length - failed.length, withRatings: rows.length, failed };
}

export const syncRecent = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const reviewsRun: Id<"syncRuns"> = await ctx.runMutation(internal.syncRuns.start, { source: "asc_reviews" });
    let territories: string[] = [];
    try {
      const r = await syncReviews(ctx);
      territories = r.territories;
      await ctx.runMutation(internal.syncRuns.finish, {
        runId: reviewsRun,
        status: "ok",
        rows: r.total,
        message: `${r.total} avis, ${r.written} écrits, ${r.removed} supprimés`,
      });
    } catch (e) {
      await ctx.runMutation(internal.syncRuns.finish, { runId: reviewsRun, status: "error", message: String(e).slice(0, 500) });
    }

    const ratingsRun: Id<"syncRuns"> = await ctx.runMutation(internal.syncRuns.start, { source: "itunes_ratings" });
    try {
      const r = await syncRatings(ctx, territories.map(storefrontOf));
      await ctx.runMutation(internal.syncRuns.finish, {
        runId: ratingsRun,
        status: "ok",
        rows: r.withRatings,
        message: `${r.countries} storefronts lus${r.failed.length ? `, échec : ${r.failed.join(", ")}` : ""}`,
      });
    } catch (e) {
      await ctx.runMutation(internal.syncRuns.finish, { runId: ratingsRun, status: "error", message: String(e).slice(0, 500) });
    }
    return null;
  },
});
