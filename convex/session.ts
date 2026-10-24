import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertToken } from "./lib/auth";

/** true when the token is valid. The only public function that does not throw on a bad token. */
export const check = query({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => {
    try {
      assertToken(token);
      return true;
    } catch {
      return false;
    }
  },
});
