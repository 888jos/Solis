import { useMemo } from "react";
import { formatInt, toBars } from "../format";
import type { KpiItem, QuestirlSummary } from "../types";

/** Réponses: acquisition source (heard_from), every answer, dominant heroes, most answered questions. */
export function useAnswersViewModel(data: QuestirlSummary | null) {
  return useMemo(() => {
    if (!data) return null;
    const totalSources = data.sources.reduce((s, r) => s + r.count, 0);
    const kpis: KpiItem[] = [
      { key: "answers", label: "Réponses enregistrées", value: formatInt(data.cards.questionsAnswered), foot: "onboarding_question_answered" },
      { key: "questions", label: "Questions différentes", value: formatInt(data.questions.length) },
      { key: "sources", label: "Réponses « d'où viens-tu ? »", value: formatInt(totalSources), foot: data.sources[0] ? `1re source : ${data.sources[0].name}` : undefined },
      { key: "heroes", label: "Héros différents", value: formatInt(data.heroes.length), foot: data.heroes[0] ? `le plus fréquent : ${data.heroes[0].name}` : undefined },
    ];
    return {
      kpis,
      sources: toBars(data.sources),
      heroes: toBars(data.heroes, "var(--series-3)"),
      questions: toBars(data.questions),
      answers: toBars(data.answers),
    };
  }, [data]);
}
