import { formatDayLong, formatInt } from "@/lib/format";
import type { FirestoreData } from "./useFirestoreReport";

// Shapes the Firestore report state into what FirestoreGate shows. Shared by every Firestore tab ViewModel.

export type GateView =
  | { kind: "loading" }
  | { kind: "notConnected"; missing: string; help: string }
  | { kind: "empty" | "building" | "error"; title: string; body: string }
  | { kind: "ready"; partialNote: string | null };

const time = new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

export function gateOf(fs: FirestoreData): GateView {
  const s = fs.state;
  switch (s.kind) {
    case "loading":
      return { kind: "loading" };
    case "notConnected":
      return {
        kind: "notConnected",
        missing: `la clé de compte de service Firebase (${s.missing})`,
        help: "Console Firebase > Paramètres du projet snapwake-33207 > Comptes de service > Générer une nouvelle clé privée, enregistrer dans ~/Documents/DriftStudio/cocorise-service-account.json, puis npx convex env set (dev et --prod) COCORISE_FIREBASE_SA_B64 avec le JSON encodé en base64.",
      };
    case "empty":
      return {
        kind: "empty",
        title: "Aucun événement Firestore sur la période",
        body: s.lastDay ? `L'app n'envoie plus d'événements depuis le ${formatDayLong(s.lastDay)}. Choisir une période qui couvre cette date (90 jours, 12 mois ou Tout).` : "La collection analytics_events est vide.",
      };
    case "building":
      return {
        kind: "building",
        title: "Lecture de Firestore en cours",
        body: s.progress && s.progress.total > 1 ? `${formatInt(s.progress.loaded)} sur ${formatInt(s.progress.total)} jours déjà lus. Les jours terminés ne sont lus qu'une fois puis gardés en cache.` : "Les événements de la période sont lus puis gardés en cache.",
      };
    case "error": {
      const quota = s.message.startsWith("Quota");
      const progress = s.progress && s.progress.total > 1 ? ` ${formatInt(s.progress.loaded)} sur ${formatInt(s.progress.total)} jours déjà lus.` : "";
      return {
        kind: "error",
        title: quota ? "Quota Firestore du jour atteint" : "Firestore n'a pas répondu",
        body: quota
          ? `Le projet Firebase est au forfait gratuit (50 000 lectures par jour) et l'historique en compte plus.${progress} La lecture reprend toute seule${s.resumeAt ? ` vers ${time.format(new Date(s.resumeAt))}` : ""}.`
          : s.message,
      };
    }
    case "ready":
      return {
        kind: "ready",
        partialNote: fs.partial
          ? `Historique partiel : ${formatInt(fs.partial.loaded)} sur ${formatInt(fs.partial.total)} jours chargés (quota gratuit Firestore de 50 000 lectures par jour). Les chiffres couvrent les jours déjà lus${fs.partial.resumeAt && fs.partial.resumeAt > Date.now() ? `, la suite arrive vers ${time.format(new Date(fs.partial.resumeAt))}` : ""}.`
          : null,
      };
  }
}
