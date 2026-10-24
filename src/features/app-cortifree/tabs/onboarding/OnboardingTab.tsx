import { BarList, Card } from "@/ui";
import {
  Async,
  Bars,
  ChartCard,
  Funnel,
  FunnelCard,
  Select,
  Show,
  SimpleTable,
  TableCard,
  Tags,
} from "../../components/blocks";
import {
  useOnboardingViewModel,
  useStepDetailViewModel,
} from "./useOnboardingViewModel";

function StepDetail({ screen }: { screen: string }) {
  const vm = useStepDetailViewModel(screen);
  return (
    <Async cell={vm} height={120}>
      {(d) => (
        <div className="stack" style={{ gap: 10 }}>
          {d.intro && <p className="cf-note">{d.intro}</p>}
          {d.quiz.length > 0 && (
            <div className="cf-quiz">
              {d.quiz.map((q) => (
                <details key={q.key}>
                  <summary>
                    <strong>{q.title}</strong>
                    <span>{q.text}</span>
                    <Tags items={q.tags} />
                  </summary>
                  {q.answers.length ? (
                    <BarList items={q.answers} formatValue={q.formatAnswer} />
                  ) : (
                    <p className="cf-note">
                      Pas encore de réponses détaillées pour cette question.
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
          {d.events && (
            <>
              <p className="cf-note">Événements envoyés par cet écran</p>
              <SimpleTable vm={d.events} />
            </>
          )}
          {d.empty && <p className="cf-note">{d.empty}</p>}
        </div>
      )}
    </Async>
  );
}

export default function OnboardingTab() {
  const vm = useOnboardingViewModel();
  return (
    <>
      <Card
        title="Où les gens décrochent-ils dans l'onboarding ?"
        subtitle="Écrans découverts via onboarding_screen_viewed, ordonnés par step_number · utilisateurs uniques par écran"
        action={
          vm.flowOptions && (
            <Select
              label="Version du flow"
              value={vm.flowValue}
              options={vm.flowOptions}
              onChange={vm.setFlow}
            />
          )
        }
      >
        <Async cell={vm.screens} height={420}>
          {(f) => (
            <Funnel
              vm={f}
              renderDetail={(screen) => <StepDetail screen={screen} />}
            />
          )}
        </Async>
      </Card>

      <div className="grid grid--2">
        <FunnelCard
          title="De l'installation au paywall"
          subtitle="Entonnoir ordonné Amplitude, utilisateurs actifs"
          cell={vm.acq}
        />
        <FunnelCard
          title="Du paywall à l'achat"
          subtitle="Paywall → essai → payant, entonnoir ordonné"
          cell={vm.paywall}
        />
      </div>

      <ChartCard
        title="Combien commencent et finissent l'onboarding ?"
        subtitle="Utilisateurs uniques par jour sur le premier et le dernier écran du flow"
        cell={vm.daily}
      />

      <div className="grid grid--2">
        <TableCard
          title="IA ou manuel : lequel convertit ?"
          subtitle="Par parcours (onboarding_path), du choix du quiz jusqu'à l'achat · fenêtre 30 j"
          cell={vm.path}
        />
        <FunnelCard
          title="Parcours IA, étape par étape"
          subtitle="Où on perd les gens entre « Mon IA répond » et le plan"
          cell={vm.aiPath}
        />
      </div>

      <TableCard
        title="Combien de temps pour finir l'onboarding ?"
        subtitle="Moyenne de total_time_seconds sur onboarding_completed, par parcours"
        cell={vm.time}
      />

      <Async cell={vm.splits} height={200}>
        {(s) => (
          <>
            <div className="grid grid--2">
              <Card
                title="Quelle IA ?"
                subtitle="onboarding_quiz_mode_selected par ai_app · utilisateurs uniques"
              >
                <Show content={s.aiApp}>{(b) => <Bars vm={b} />}</Show>
              </Card>
              <Card
                title="La réponse de l'IA est-elle exploitable ?"
                subtitle="onboarding_ai_quiz_pasted par success (plan trouvé dans la réponse collée)"
              >
                <Show content={s.aiReply}>{(b) => <Bars vm={b} />}</Show>
              </Card>
            </div>
            <div className="grid grid--2">
              <Card
                title="Sur quel écran quittent-ils l'app ?"
                subtitle="onboarding_backgrounded par écran"
              >
                <Show content={s.leftScreen}>{(b) => <Bars vm={b} />}</Show>
              </Card>
              <Card
                title="Sorties de l'app par parcours"
                subtitle="onboarding_backgrounded par onboarding_path (sortir vers son IA est normal sur le parcours IA)"
              >
                <Show content={s.leftPath}>{(b) => <Bars vm={b} />}</Show>
              </Card>
            </div>
          </>
        )}
      </Async>
    </>
  );
}
