import { formatInt, formatPct } from "@/lib/format";
import type { BarListItem } from "@/ui";
import { gateOf } from "../data/gate";
import type { FirestoreData } from "../data/useFirestoreReport";

/** "Événements": old "Top Button Taps" + "Raw Event Mix". */
export function useEventsViewModel(fs: FirestoreData) {
  const r = fs.report;
  const gate = gateOf(fs);
  if (!r) return { gate, buttons: null, events: null, eventsSubtitle: "", buttonsSubtitle: "" };
  const total = r.totals.totalEvents;
  const buttonsTotal = r.topButtons.reduce((s, b) => s + b.count, 0);
  const buttons: BarListItem[] = r.topButtons.map((b) => ({ key: b.button, label: b.button, value: b.count, color: "var(--series-1)" }));
  const events: BarListItem[] = r.eventCounts.slice(0, 20).map((e) => ({ key: e.name, label: e.name, value: e.count, color: "var(--series-1)", hint: total > 0 ? `${formatPct(e.count / total)} des événements` : undefined }));
  return {
    gate,
    buttons,
    events,
    buttonsSubtitle: `Événements button_tapped · ${formatInt(buttonsTotal)} taps sur les 12 premiers boutons`,
    eventsSubtitle: `20 événements les plus fréquents sur ${formatInt(total)} · ${formatInt(r.eventCounts.length)} types distincts${r.eventCounts.length >= 40 ? " ou plus" : ""}`,
  };
}
