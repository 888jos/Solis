import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";

// Solis is single-tenant: every public function takes the access token and checks it against
// SOLIS_ACCESS_TOKEN. Public functions MUST use these wrappers, never raw query/mutation/action.
function assertEnvToken(token: string, envName: string) {
  const expected = process.env[envName];
  if (!expected) throw new Error(`${envName} is not configured`);
  let diff = token.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (token.charCodeAt(i) || 0);
  if (diff !== 0) throw new Error("Unauthorized");
}

export function assertToken(token: string) {
  assertEnvToken(token, "SOLIS_ACCESS_TOKEN");
}

const tokenArgs = { token: v.string() };
const check = async (_ctx: unknown, { token }: { token: string }) => {
  assertToken(token);
  return { ctx: {}, args: {} };
};

export const authQuery = customQuery(query, { args: tokenArgs, input: check });
export const authMutation = customMutation(mutation, { args: tokenArgs, input: check });
export const authAction = customAction(action, { args: tokenArgs, input: check });

// Machine client: the Carousel Factory on Jos's Mac (`cf sync`). It gets its own token, CAROUSEL_SYNC_TOKEN,
// which only opens the carousel sync functions (convex/carousels.ts), never the rest of Solis.
const checkCarouselSync = async (_ctx: unknown, { token }: { token: string }) => {
  assertEnvToken(token, "CAROUSEL_SYNC_TOKEN");
  return { ctx: {}, args: {} };
};

export const carouselSyncQuery = customQuery(query, { args: tokenArgs, input: checkCarouselSync });
export const carouselSyncMutation = customMutation(mutation, { args: tokenArgs, input: checkCarouselSync });
