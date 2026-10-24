import type { IcpAllP } from "../../data/payloads";
import { mapCell, useWidgets } from "../../data/useWidgets";
import { data, fmtNum, pct0, waiting, type TableVM } from "../../data/vm";

const LABELS: Record<string, string> = {
  icp_age: "Âge",
  icp_gender: "Genre",
  icp_main_reason: "Raison principale",
  icp_stress_reasons: "Raisons (choix multiples)",
  icp_reason_count: "Nombre de raisons",
  icp_stress_duration: "Depuis combien de temps",
  icp_symptoms: "Symptômes cochés",
  icp_symptom_count: "Nombre de symptômes",
  icp_primary_goal: "Objectif choisi",
  icp_available_minutes: "Temps dispo / jour",
  icp_global_score: "Score global",
  icp_stress_score: "Score stress",
  icp_sleep_score: "Score sommeil",
  icp_energy_score: "Score énergie",
  icp_focus_score: "Score concentration",
  country: "Pays",
  app_language: "Langue de l'app",
  language: "Langue de l'iPhone",
  device_type: "Appareil",
  plan_goal: "Objectif du plan",
  has_apple_watch: "Apple Watch",
};
const VALUES: Record<string, string> = {
  under_18: "Moins de 18 ans",
  "18_24": "18–24 ans",
  "25_34": "25–34 ans",
  "35_44": "35–44 ans",
  "45_54": "45–54 ans",
  "55_plus": "55 ans et +",
  male: "Homme",
  female: "Femme",
  other: "Autre / non précisé",
  sleep: "Sommeil",
  anxiety: "Stress / anxiété",
  energy: "Énergie",
  mental: "Santé mentale",
  difficult: "Période difficile",
  habits: "Habitudes",
  focus: "Concentration",
  weeks: "Quelques semaines",
  "2_6_months": "2 à 6 mois",
  "6_12_months": "6 mois à 1 an",
  "1_year_plus": "Plus d'un an",
  years: "Plusieurs années",
};
export const icpLabel = (prop: string) =>
  LABELS[prop] ??
  (prop.startsWith("icp_habit_q")
    ? `Habitudes — question ${prop.slice(11)}`
    : prop);
const icpValue = (v: string) =>
  v === "(none)" ? "Non renseigné (anciennes versions)" : (VALUES[v] ?? v);

export type DimVM = { prop: string; title: string; table: TableVM | null; error?: string | null };

/** Profil ICP: who the users are (onboarding answers icp_*, country, language, device) and how each segment converts. */
export function useIcpViewModel() {
  const { cell } = useWidgets({ all: { w: "icpAll" } });
  return mapCell(cell<IcpAllP>("all"), (p) => {
    const stepsLine = p.steps.map((s) => `${s.label} (${s.event})`).join(" → ");
    const summaryRows: Record<string, string>[] = [];
    const dims: DimVM[] = p.dims.map((d) => {
      const known = d.segments.filter((s) => s.value !== "(none)");
      if (!d.missing && known.length) {
        const last = known[0].counts.length - 1;
        const total = known.reduce((t, s) => t + s.counts[0], 0);
        const best = known
          .filter((s) => s.counts[0] >= 3)
          .map((s) => ({ ...s, conv: s.counts[last] / s.counts[0] }))
          .sort((a, b) => b.conv - a.conv)[0];
        summaryRows.push({
          dim: icpLabel(d.prop),
          top: `${icpValue(known[0].value)} · ${pct0(known[0].counts[0] / total)}`,
          best:
            best && last > 0
              ? `${icpValue(best.value)} · ${pct0(best.conv)} → ${d.steps[last]}`
              : "—",
        });
      }
      if (d.error) return { prop: d.prop, title: icpLabel(d.prop), table: null, error: `${d.error} · nouvel essai automatique dans 2 min` };
      if (d.missing || !d.segments.length)
        return { prop: d.prop, title: icpLabel(d.prop), table: null };
      // « (none) »: users who never sent this property (older app versions), shown last.
      const segs = [
        ...known,
        ...d.segments.filter((s) => s.value === "(none)"),
      ].slice(0, 15);
      const total = segs.reduce((t, s) => t + s.counts[0], 0);
      return {
        prop: d.prop,
        title: icpLabel(d.prop),
        table: {
          columns: [
            { key: "seg", header: "Segment" },
            { key: "n", header: "Utilisateurs", align: "right" },
            ...d.steps
              .slice(1)
              .map((s, i) => ({
                key: `s${i + 1}`,
                header: s,
                align: "right" as const,
              })),
          ],
          rows: segs.map((s) => ({
            seg: icpValue(s.value),
            n: `${fmtNum(s.counts[0])} · ${pct0(total ? s.counts[0] / total : null)}`,
            ...Object.fromEntries(
              s.counts
                .slice(1)
                .map((n, i) => [
                  `s${i + 1}`,
                  `${pct0(s.counts[0] ? n / s.counts[0] : null)} (${fmtNum(n)})`,
                ]),
            ),
          })),
        },
      };
    });
    if (!p.steps.length)
      return waiting({
        title: "Pas encore d'étapes de conversion",
        note: "Aucun des événements de début, paywall, essai ou achat n'a été reçu.",
      });
    return data({
      intro: `Conversion par segment, dans l'ordre : ${stepsLine}. Utilisateurs actifs, fenêtre de 30 jours.`,
      notYet: p.notYet.length
        ? `En attente (pas encore envoyé par l'app) : ${p.notYet.map(icpLabel).join(", ")}.`
        : null,
      summary: summaryRows.length
        ? ({
            columns: [
              { key: "dim", header: "Critère" },
              { key: "top", header: "Le plus fréquent" },
              { key: "best", header: "Convertit le mieux (≥ 3 pers.)" },
            ],
            rows: summaryRows,
          } satisfies TableVM)
        : null,
      dims,
    });
  });
}
