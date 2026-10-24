import { Card } from "@/ui";
import { Async, SimpleTable, WaitingState } from "../../components/blocks";
import { useIcpViewModel } from "./useIcpViewModel";

export default function IcpTab() {
  const vm = useIcpViewModel();
  return (
    <Async cell={vm} height={360}>
      {(d) => (
        <>
          <p className="cf-note">
            {d.intro}
            {d.notYet && <> {d.notYet}</>}
          </p>
          <Card
            title="Ton ICP en un coup d'œil"
            subtitle="Pour chaque critère : le profil le plus fréquent, et celui qui convertit le mieux"
            flush
          >
            {d.summary ? (
              <SimpleTable vm={d.summary} />
            ) : (
              <WaitingState
                w={{
                  title: "Pas encore de profil",
                  events: ["onboarding_profile_completed"],
                }}
              />
            )}
          </Card>
          <div className="grid grid--2">
            {d.dims.map((dim) => (
              <Card key={dim.prop} title={dim.title} subtitle={dim.prop} flush>
                {dim.table ? (
                  <SimpleTable vm={dim.table} />
                ) : (
                  <WaitingState
                    w={
                      dim.error
                        ? { title: "Amplitude n'a pas répondu pour ce critère", note: dim.error }
                        : { title: "Pas encore de données", note: "Envoyé à la fin du quiz d'onboarding." }
                    }
                  />
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </Async>
  );
}
