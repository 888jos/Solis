/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_apps from "../lib/apps.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dates from "../lib/dates.js";
import type * as schema_core from "../schema/core.js";
import type * as schema_expenses from "../schema/expenses.js";
import type * as schema_growth from "../schema/growth.js";
import type * as schema_product from "../schema/product.js";
import type * as schema_revenue from "../schema/revenue.js";
import type * as schema_subscriptions from "../schema/subscriptions.js";
import type * as session from "../session.js";
import type * as sources_asc from "../sources/asc.js";
import type * as syncRuns from "../syncRuns.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/apps": typeof lib_apps;
  "lib/auth": typeof lib_auth;
  "lib/dates": typeof lib_dates;
  "schema/core": typeof schema_core;
  "schema/expenses": typeof schema_expenses;
  "schema/growth": typeof schema_growth;
  "schema/product": typeof schema_product;
  "schema/revenue": typeof schema_revenue;
  "schema/subscriptions": typeof schema_subscriptions;
  session: typeof session;
  "sources/asc": typeof sources_asc;
  syncRuns: typeof syncRuns;
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
