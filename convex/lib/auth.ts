import { getAuthUserId } from "@convex-dev/auth/server";
import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { action, mutation, query, type QueryCtx } from "../_generated/server";

// Solis is single-tenant: Jos signs in with Google (convex/auth.ts) and every public function checks that the
// signed-in user's email is in SOLIS_ALLOWED_EMAILS. Public functions MUST use these wrappers, never raw
// query/mutation/action.
const DEFAULT_EMAILS = ["jossel1.biot@gmail.com", "contact@driftstudio.app"];

export function allowedEmail(email: string): boolean {
  const list = (process.env.SOLIS_ALLOWED_EMAILS ?? DEFAULT_EMAILS.join(","))
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** The signed-in user's email when it is allowed, else null. Convex Auth tokens carry the user id, not the email. */
export async function signedInEmail(ctx: QueryCtx): Promise<string | null> {
  const userId = await getAuthUserId(ctx);
  const user = userId ? await ctx.db.get(userId) : null;
  const email = user?.email ?? "";
  return email && allowedEmail(email) ? email.toLowerCase() : null;
}

async function assertSignedIn(ctx: QueryCtx) {
  if (!(await signedInEmail(ctx))) throw new Error("Unauthorized");
}

// Actions have no db: they ask session.allowedInternal (a string reference avoids a type cycle with _generated/api).
const allowedInternal = makeFunctionReference<"query", Record<string, never>, boolean>("session:allowedInternal");

export const authQuery = customQuery(query, { args: {}, input: async (ctx) => (await assertSignedIn(ctx), { ctx: {}, args: {} }) });
export const authMutation = customMutation(mutation, { args: {}, input: async (ctx) => (await assertSignedIn(ctx), { ctx: {}, args: {} }) });
export const authAction = customAction(action, {
  args: {},
  input: async (ctx) => {
    if (!(await ctx.runQuery(allowedInternal as any, {}))) throw new Error("Unauthorized");
    return { ctx: {}, args: {} };
  },
});

function assertEnvToken(token: string, envName: string) {
  const expected = process.env[envName];
  if (!expected) throw new Error(`${envName} is not configured`);
  let diff = token.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (token.charCodeAt(i) || 0);
  if (diff !== 0) throw new Error("Unauthorized");
}

const tokenArgs = { token: v.string() };

// Machine client: the Carousel Factory on Jos's Mac (`cf sync`). It gets its own token, CAROUSEL_SYNC_TOKEN,
// which only opens the carousel sync functions (convex/carousels.ts), never the rest of Solis.
const checkCarouselSync = async (_ctx: unknown, { token }: { token: string }) => {
  assertEnvToken(token, "CAROUSEL_SYNC_TOKEN");
  return { ctx: {}, args: {} };
};

export const carouselSyncQuery = customQuery(query, { args: tokenArgs, input: checkCarouselSync });
export const carouselSyncMutation = customMutation(mutation, { args: tokenArgs, input: checkCarouselSync });
