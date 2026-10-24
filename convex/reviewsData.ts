import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Model (writes) for the "Avis & notes" feature. Called by convex/sources/reviews.ts.

/** Apple 3-letter territory → 2-letter storefront (lowercase), for the storefronts we may see. */
export const TERRITORY_TO_STOREFRONT: Record<string, string> = {
  USA: "us", FRA: "fr", GBR: "gb", DEU: "de", CAN: "ca", AUS: "au", ESP: "es", ITA: "it", JPN: "jp", KOR: "kr",
  BRA: "br", MEX: "mx", NLD: "nl", BEL: "be", CHE: "ch", POL: "pl", AUT: "at", SWE: "se", NOR: "no", DNK: "dk",
  FIN: "fi", IRL: "ie", PRT: "pt", NZL: "nz", IND: "in", SGP: "sg", HKG: "hk", TWN: "tw", CHN: "cn", RUS: "ru",
  TUR: "tr", ARE: "ae", SAU: "sa", ISR: "il", ZAF: "za", ARG: "ar", CHL: "cl", COL: "co", CZE: "cz", HUN: "hu",
  ROU: "ro", GRC: "gr", UKR: "ua", THA: "th", IDN: "id", MYS: "my", PHL: "ph", VNM: "vn", LUX: "lu", PER: "pe",
  EGY: "eg", NGA: "ng", KAZ: "kz", SVK: "sk", SVN: "si", HRV: "hr", BGR: "bg", LTU: "lt", LVA: "lv", EST: "ee",
  ISL: "is", MAR: "ma", TUN: "tn", DZA: "dz", QAT: "qa", KWT: "kw", PAK: "pk", LKA: "lk", URY: "uy", ECU: "ec",
  CRI: "cr", DOM: "do", GTM: "gt", PAN: "pa", MLT: "mt", CYP: "cy", SRB: "rs", BLR: "by", MDA: "md", GEO: "ge",
};

export function storefrontOf(territory: string): string {
  return TERRITORY_TO_STOREFRONT[territory] ?? territory.slice(0, 2).toLowerCase();
}

const reviewArg = v.object({
  reviewId: v.string(),
  rating: v.number(),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  nickname: v.optional(v.string()),
  territory: v.string(),
  createdAt: v.string(),
  hasResponse: v.boolean(),
});

/** Insert new reviews, patch changed ones (response added, edited text). Returns rows written. */
export const upsertReviews = internalMutation({
  args: { appSlug: v.string(), reviews: v.array(reviewArg) },
  handler: async (ctx, { appSlug, reviews }) => {
    let written = 0;
    for (const review of reviews) {
      const existing = await ctx.db
        .query("appReviews")
        .withIndex("by_review", (q) => q.eq("reviewId", review.reviewId))
        .unique();
      if (!existing) {
        await ctx.db.insert("appReviews", { appSlug, ...review });
        written++;
        continue;
      }
      const changed =
        existing.rating !== review.rating ||
        existing.title !== review.title ||
        existing.body !== review.body ||
        existing.hasResponse !== review.hasResponse ||
        existing.createdAt !== review.createdAt;
      if (changed) {
        await ctx.db.patch(existing._id, { ...review, appSlug });
        written++;
      }
    }
    return written;
  },
});

/** Reviews that vanished from ASC (deleted by the reviewer or Apple) are removed. */
export const pruneReviews = internalMutation({
  args: { appSlug: v.string(), keepIds: v.array(v.string()) },
  handler: async (ctx, { appSlug, keepIds }) => {
    const keep = new Set(keepIds);
    const rows = await ctx.db
      .query("appReviews")
      .withIndex("by_app_created", (q) => q.eq("appSlug", appSlug))
      .collect();
    let removed = 0;
    for (const row of rows) {
      if (!keep.has(row.reviewId)) {
        await ctx.db.delete(row._id);
        removed++;
      }
    }
    return removed;
  },
});

/** One snapshot per app × storefront × day (re-running the same day overwrites it). */
export const upsertRatings = internalMutation({
  args: {
    date: v.string(),
    rows: v.array(v.object({ appSlug: v.string(), country: v.string(), averageRating: v.union(v.number(), v.null()), ratingCount: v.number() })),
  },
  handler: async (ctx, { date, rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query("appRatings")
        .withIndex("by_app_country_date", (q) => q.eq("appSlug", row.appSlug).eq("country", row.country).eq("date", date))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { averageRating: row.averageRating, ratingCount: row.ratingCount });
      else await ctx.db.insert("appRatings", { ...row, date });
    }
    return rows.length;
  },
});
