/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acquisition from "../acquisition.js";
import type * as aso from "../aso.js";
import type * as asoData from "../asoData.js";
import type * as auth from "../auth.js";
import type * as brief from "../brief.js";
import type * as carousels from "../carousels.js";
import type * as cocoriseAnalytics from "../cocoriseAnalytics.js";
import type * as cortifreeAnalytics from "../cortifreeAnalytics.js";
import type * as crons from "../crons.js";
import type * as engagement from "../engagement.js";
import type * as engagementData from "../engagementData.js";
import type * as expenses from "../expenses.js";
import type * as expensesData from "../expensesData.js";
import type * as explorer from "../explorer.js";
import type * as fx from "../fx.js";
import type * as geo from "../geo.js";
import type * as http from "../http.js";
import type * as lib_apps from "../lib/apps.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_fx from "../lib/fx.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_storeReport from "../lib/storeReport.js";
import type * as lib_validate from "../lib/validate.js";
import type * as lib_vat from "../lib/vat.js";
import type * as media from "../media.js";
import type * as otto from "../otto.js";
import type * as overview from "../overview.js";
import type * as paid from "../paid.js";
import type * as pilot from "../pilot.js";
import type * as profitability from "../profitability.js";
import type * as questirlAnalytics from "../questirlAnalytics.js";
import type * as revenue from "../revenue.js";
import type * as revenueData from "../revenueData.js";
import type * as review from "../review.js";
import type * as reviews from "../reviews.js";
import type * as reviewsData from "../reviewsData.js";
import type * as schema_analytics from "../schema/analytics.js";
import type * as schema_content from "../schema/content.js";
import type * as schema_core from "../schema/core.js";
import type * as schema_expenses from "../schema/expenses.js";
import type * as schema_growth from "../schema/growth.js";
import type * as schema_paid from "../schema/paid.js";
import type * as schema_pilot from "../schema/pilot.js";
import type * as schema_product from "../schema/product.js";
import type * as schema_projects from "../schema/projects.js";
import type * as schema_revenue from "../schema/revenue.js";
import type * as schema_storeAnalytics from "../schema/storeAnalytics.js";
import type * as schema_subscriptions from "../schema/subscriptions.js";
import type * as session from "../session.js";
import type * as sources from "../sources.js";
import type * as sources_aiCosts from "../sources/aiCosts.js";
import type * as sources_airtable from "../sources/airtable.js";
import type * as sources_asc from "../sources/asc.js";
import type * as sources_ascAnalytics from "../sources/ascAnalytics.js";
import type * as sources_aso from "../sources/aso.js";
import type * as sources_cocoriseAnalytics from "../sources/cocoriseAnalytics.js";
import type * as sources_cortifreeAnalytics from "../sources/cortifreeAnalytics.js";
import type * as sources_engagement from "../sources/engagement.js";
import type * as sources_metaAds from "../sources/metaAds.js";
import type * as sources_questirlAnalytics from "../sources/questirlAnalytics.js";
import type * as sources_revenue from "../sources/revenue.js";
import type * as sources_reviews from "../sources/reviews.js";
import type * as sources_stripe from "../sources/stripe.js";
import type * as sources_subscriptions from "../sources/subscriptions.js";
import type * as sources_telegram from "../sources/telegram.js";
import type * as sources_versions from "../sources/versions.js";
import type * as storeAnalytics from "../storeAnalytics.js";
import type * as subscriptions from "../subscriptions.js";
import type * as subscriptionsData from "../subscriptionsData.js";
import type * as syncRuns from "../syncRuns.js";
import type * as ugc from "../ugc.js";
import type * as ugcData from "../ugcData.js";
import type * as versions from "../versions.js";
import type * as versionsData from "../versionsData.js";
import type * as videoScripts from "../videoScripts.js";
import type * as watchdog from "../watchdog.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acquisition: typeof acquisition;
  aso: typeof aso;
  asoData: typeof asoData;
  auth: typeof auth;
  brief: typeof brief;
  carousels: typeof carousels;
  cocoriseAnalytics: typeof cocoriseAnalytics;
  cortifreeAnalytics: typeof cortifreeAnalytics;
  crons: typeof crons;
  engagement: typeof engagement;
  engagementData: typeof engagementData;
  expenses: typeof expenses;
  expensesData: typeof expensesData;
  explorer: typeof explorer;
  fx: typeof fx;
  geo: typeof geo;
  http: typeof http;
  "lib/apps": typeof lib_apps;
  "lib/auth": typeof lib_auth;
  "lib/dates": typeof lib_dates;
  "lib/fx": typeof lib_fx;
  "lib/http": typeof lib_http;
  "lib/storeReport": typeof lib_storeReport;
  "lib/validate": typeof lib_validate;
  "lib/vat": typeof lib_vat;
  media: typeof media;
  otto: typeof otto;
  overview: typeof overview;
  paid: typeof paid;
  pilot: typeof pilot;
  profitability: typeof profitability;
  questirlAnalytics: typeof questirlAnalytics;
  revenue: typeof revenue;
  revenueData: typeof revenueData;
  review: typeof review;
  reviews: typeof reviews;
  reviewsData: typeof reviewsData;
  "schema/analytics": typeof schema_analytics;
  "schema/content": typeof schema_content;
  "schema/core": typeof schema_core;
  "schema/expenses": typeof schema_expenses;
  "schema/growth": typeof schema_growth;
  "schema/paid": typeof schema_paid;
  "schema/pilot": typeof schema_pilot;
  "schema/product": typeof schema_product;
  "schema/projects": typeof schema_projects;
  "schema/revenue": typeof schema_revenue;
  "schema/storeAnalytics": typeof schema_storeAnalytics;
  "schema/subscriptions": typeof schema_subscriptions;
  session: typeof session;
  sources: typeof sources;
  "sources/aiCosts": typeof sources_aiCosts;
  "sources/airtable": typeof sources_airtable;
  "sources/asc": typeof sources_asc;
  "sources/ascAnalytics": typeof sources_ascAnalytics;
  "sources/aso": typeof sources_aso;
  "sources/cocoriseAnalytics": typeof sources_cocoriseAnalytics;
  "sources/cortifreeAnalytics": typeof sources_cortifreeAnalytics;
  "sources/engagement": typeof sources_engagement;
  "sources/metaAds": typeof sources_metaAds;
  "sources/questirlAnalytics": typeof sources_questirlAnalytics;
  "sources/revenue": typeof sources_revenue;
  "sources/reviews": typeof sources_reviews;
  "sources/stripe": typeof sources_stripe;
  "sources/subscriptions": typeof sources_subscriptions;
  "sources/telegram": typeof sources_telegram;
  "sources/versions": typeof sources_versions;
  storeAnalytics: typeof storeAnalytics;
  subscriptions: typeof subscriptions;
  subscriptionsData: typeof subscriptionsData;
  syncRuns: typeof syncRuns;
  ugc: typeof ugc;
  ugcData: typeof ugcData;
  versions: typeof versions;
  versionsData: typeof versionsData;
  videoScripts: typeof videoScripts;
  watchdog: typeof watchdog;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
