import type { Status } from "@/ui";

// French labels for App Store Connect states. Presentation only.
const VERSION_STATES: Record<string, { label: string; status: Status }> = {
  READY_FOR_SALE: { label: "En ligne", status: "good" },
  REPLACED_WITH_NEW_VERSION: { label: "Remplacée", status: "neutral" },
  WAITING_FOR_REVIEW: { label: "En attente de review", status: "neutral" },
  IN_REVIEW: { label: "En review", status: "neutral" },
  READY_FOR_REVIEW: { label: "Prête pour la review", status: "neutral" },
  ACCEPTED: { label: "Acceptée", status: "good" },
  PENDING_DEVELOPER_RELEASE: { label: "Validée, à publier", status: "warning" },
  PENDING_APPLE_RELEASE: { label: "Validée, publication Apple", status: "good" },
  PROCESSING_FOR_APP_STORE: { label: "Traitement Apple", status: "neutral" },
  PROCESSING_FOR_DISTRIBUTION: { label: "Traitement Apple", status: "neutral" },
  PREPARE_FOR_SUBMISSION: { label: "En préparation", status: "neutral" },
  DEVELOPER_REJECTED: { label: "Retirée de la review", status: "neutral" },
  REJECTED: { label: "Rejetée", status: "critical" },
  METADATA_REJECTED: { label: "Métadonnées rejetées", status: "critical" },
  INVALID_BINARY: { label: "Binaire invalide", status: "critical" },
  REMOVED_FROM_SALE: { label: "Retirée de la vente", status: "warning" },
  DEVELOPER_REMOVED_FROM_SALE: { label: "Retirée de la vente", status: "warning" },
};

export function versionState(state: string, kind: string): { label: string; status: Status } {
  // ASC keeps older shipped versions as READY_FOR_SALE: only the newest one is actually live.
  if (kind === "replaced") return { label: "Remplacée", status: "neutral" };
  return VERSION_STATES[state] ?? { label: state.toLowerCase().replace(/_/g, " "), status: "neutral" };
}

export function releaseTypeLabel(type: string | null): string {
  if (type === "MANUAL") return "Manuelle";
  if (type === "AFTER_APPROVAL") return "Auto après validation";
  if (type === "SCHEDULED") return "Programmée";
  return "—";
}

export function buildState(processingState: string, expired: boolean): { label: string; status: Status } {
  if (expired) return { label: "Expiré", status: "neutral" };
  if (processingState === "VALID") return { label: "Valide", status: "good" };
  if (processingState === "PROCESSING") return { label: "En traitement", status: "neutral" };
  if (processingState === "FAILED") return { label: "Échec", status: "critical" };
  if (processingState === "INVALID") return { label: "Invalide", status: "critical" };
  return { label: processingState.toLowerCase(), status: "neutral" };
}
