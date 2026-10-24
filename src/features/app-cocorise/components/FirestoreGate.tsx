import { CloudOff, Hourglass, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Card, EmptyState, KpiSkeleton, NotConnected, Skeleton } from "@/ui";
import type { GateView } from "../data/gate";

/** Renders the Firestore report states (loading, not connected, empty, history loading, error) or the tab. */
export function FirestoreGate({ gate, children }: { gate: GateView; children: ReactNode }) {
  if (gate.kind === "loading") {
    return (
      <>
        <KpiSkeleton count={4} />
        <Skeleton height={260} />
      </>
    );
  }
  if (gate.kind === "notConnected") {
    return (
      <Card>
        <NotConnected source="Firestore (Cocorise)" missing={gate.missing}>
          {gate.help}
        </NotConnected>
      </Card>
    );
  }
  if (gate.kind !== "ready") {
    const icon = gate.kind === "error" ? <CloudOff /> : gate.kind === "building" ? <RefreshCw className="cr-spin" /> : <Hourglass />;
    return (
      <Card>
        <EmptyState title={gate.title} icon={icon}>
          {gate.body}
        </EmptyState>
      </Card>
    );
  }
  return (
    <>
      {gate.partialNote && (
        <div className="cr-banner" role="status">
          <Hourglass size={14} aria-hidden />
          <span>{gate.partialNote}</span>
        </div>
      )}
      {children}
    </>
  );
}
