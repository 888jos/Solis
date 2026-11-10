import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Blocks the app until Jos is signed in (email + password, allowed addresses only: convex/auth.ts). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.session.me, isAuthenticated ? {} : "skip");
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || (isAuthenticated && me === undefined))
    return (
      <div className="muted" style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 16 }} aria-busy="true">
        Connexion…
      </div>
    );
  if (isAuthenticated && me?.email) return <>{children}</>;

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        className="card"
        style={{ width: "100%", maxWidth: 380, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const res = await signIn("password", { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
            if (!res.signingIn) setError("Email ou mot de passe incorrect");
          } catch {
            setError("Email ou mot de passe incorrect");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="row">
          <img src="/icon.svg" alt="" width={28} height={28} style={{ borderRadius: 8 }} />
          <strong style={{ fontSize: 16 }}>Solis</strong>
        </div>
        <p className="secondary" style={{ margin: 0 }}>
          <Lock size={13} style={{ verticalAlign: -2 }} /> Accès privé.
        </p>
        {error && <span className="badge badge--critical">{error}</span>}
        <input className="input" name="email" type="email" autoComplete="username" placeholder="Email" required style={{ height: 38 }} />
        <input className="input" name="password" type="password" autoComplete="current-password" placeholder="Mot de passe" required style={{ height: 38 }} />
        <button className="btn btn--primary" style={{ height: 38 }} disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
