import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { clearToken, getToken, setToken } from "@/lib/session";

/** Blocks the app until the device holds a valid access token. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [token, setLocal] = useState(getToken());
  const status = useQuery(api.session.check, token ? { token } : "skip");

  if (token && status === undefined) return null;
  if (token && status === true) return <>{children}</>;

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        className="card"
        style={{ width: "100%", maxWidth: 380, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("token")?.toString().trim() ?? "";
          if (!value) return;
          setToken(value);
          setLocal(value);
        }}
      >
        <div className="row">
          <img src="/icon.svg" alt="" width={28} height={28} style={{ borderRadius: 8 }} />
          <strong style={{ fontSize: 16 }}>Solis</strong>
        </div>
        <p className="secondary" style={{ margin: 0 }}>
          <Lock size={13} style={{ verticalAlign: -2 }} /> Accès privé. Ouvre ton lien d'accès ou colle ta clé.
        </p>
        {token && status === false && <span className="badge badge--critical">Clé refusée</span>}
        <input className="input" name="token" type="password" autoComplete="current-password" placeholder="Clé d'accès" style={{ height: 38 }} />
        <button className="btn btn--primary" style={{ height: 38 }}>
          Entrer
        </button>
        {token && (
          <button type="button" className="btn btn--ghost" onClick={() => (clearToken(), setLocal(null))}>
            Oublier la clé de cet appareil
          </button>
        )}
      </form>
    </div>
  );
}
