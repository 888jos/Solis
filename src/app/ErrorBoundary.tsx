import { AlertTriangle, Lock } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearToken } from "@/lib/session";
import { EmptyState } from "@/ui";

type Props = { children: ReactNode; /** Wraps the whole app: no shell around it, so center the message. */ fullPage?: boolean };
type State = { error: Error | null };

/** Convex errors look like "[CONVEX Q(revenue:summary)] [Request ID: …] Server Error\nUncaught Error: Unauthorized …". */
function isUnauthorized(error: Error) {
  return /\bUnauthorized\b/.test(error.message);
}

/** Shown instead of a white screen when a page (or a query it reads) throws. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Solis: page error", error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const body = isUnauthorized(error) ? (
      <EmptyState
        title="Clé d'accès refusée"
        icon={<Lock />}
        action={
          <button
            className="btn btn--primary"
            onClick={() => {
              clearToken();
              window.location.reload();
            }}
          >
            Saisir la clé
          </button>
        }
      >
        La clé enregistrée sur cet appareil n'est plus valide.
      </EmptyState>
    ) : (
      <EmptyState
        title="Cette page n'a pas pu se charger"
        icon={<AlertTriangle />}
        action={
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn--primary" onClick={this.retry}>
              Réessayer
            </button>
            <button className="btn btn--ghost" onClick={() => window.location.reload()}>
              Recharger
            </button>
          </div>
        }
      >
        Une requête a échoué côté serveur ou dans la page. Les autres pages restent accessibles.
      </EmptyState>
    );
    if (!this.props.fullPage) return <div className="card">{body}</div>;
    return (
      <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 16 }}>
        <div className="card" style={{ width: "100%", maxWidth: 420 }}>
          {body}
        </div>
      </div>
    );
  }
}
