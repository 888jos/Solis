import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { allowedEmail } from "./lib/auth";

// Email + password sign-in, limited to Jos's addresses (SOLIS_ALLOWED_EMAILS, see lib/auth.ts). One shared
// password, stored only as a PBKDF2 hash in SOLIS_PASSWORD_HASH ("pbkdf2$<iterations>$<salt b64>$<hash b64>",
// made by scripts/hash-password.mjs). Env on each Convex deployment: SOLIS_PASSWORD_HASH, SITE_URL, JWT_PRIVATE_KEY, JWKS.

const enc = new TextEncoder();
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function checkPassword(password: string): Promise<boolean> {
  const [algo, iter, salt, hash] = (process.env.SOLIS_PASSWORD_HASH ?? "").split("$");
  if (algo !== "pbkdf2" || !iter || !salt || !hash) throw new Error("SOLIS_PASSWORD_HASH is not configured");
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: Number(iter) }, key, 256);
  const got = b64(bits);
  let diff = got.length ^ hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
  return diff === 0;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "password",
      authorize: async (credentials, ctx) => {
        const email = String(credentials.email ?? "").trim().toLowerCase();
        const ok = allowedEmail(email) && (await checkPassword(String(credentials.password ?? "")));
        if (!ok) {
          await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
          return null;
        }
        const account = { id: email };
        try {
          const { user } = await retrieveAccount(ctx, { provider: "password", account });
          return { userId: user._id };
        } catch {
          const { user } = await createAccount(ctx, { provider: "password", account, profile: { email } });
          return { userId: user._id };
        }
      },
    }),
  ],
});
