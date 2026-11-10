import { internalQuery, query } from "./_generated/server";
import { signedInEmail } from "./lib/auth";

/** The signed-in email when it is allowed to use Solis, else null. Never throws. */
export const me = query({
  args: {},
  handler: async (ctx) => ({ email: await signedInEmail(ctx) }),
});

export const allowedInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await signedInEmail(ctx)) !== null,
});
