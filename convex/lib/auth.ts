import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";

// Solis is single-tenant: every public function takes the access token and checks it against
// SOLIS_ACCESS_TOKEN. Public functions MUST use these wrappers, never raw query/mutation/action.
export function assertToken(token: string) {
  const expected = process.env.SOLIS_ACCESS_TOKEN;
  if (!expected) throw new Error("SOLIS_ACCESS_TOKEN is not configured");
  let diff = token.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (token.charCodeAt(i) || 0);
  if (diff !== 0) throw new Error("Unauthorized");
}

const tokenArgs = { token: v.string() };
const check = async (_ctx: unknown, { token }: { token: string }) => {
  assertToken(token);
  return { ctx: {}, args: {} };
};

export const authQuery = customQuery(query, { args: tokenArgs, input: check });
export const authMutation = customMutation(mutation, { args: tokenArgs, input: check });
export const authAction = customAction(action, { args: tokenArgs, input: check });
