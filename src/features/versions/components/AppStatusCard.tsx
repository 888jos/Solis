import { AppLabel, Badge, Card } from "@/ui";
import type { useVersionsViewModel } from "../useVersionsViewModel";

type AppCard = NonNullable<ReturnType<typeof useVersionsViewModel>["view"]>["appCards"][number];

/** What is live for one app, and what is coming next. */
export function AppStatusCard({ card, wide }: { card: AppCard; wide?: boolean }) {
  return (
    <Card title={<AppLabel slug={card.slug} />} action={<span className="vs-meta">{card.releases365} sortie{card.releases365 > 1 ? "s" : ""} sur 12 mois</span>}>
      <div className={wide ? "vs-app vs-app--wide" : "vs-app"}>
        <div>
          <div className="vs-section-label">En ligne</div>
          {card.live ? (
            <>
              <div className="vs-live">
                <span className="vs-live__version">{card.live.version}</span>
                {card.live.build && <span className="vs-meta">build {card.live.build}</span>}
              </div>
              <div className="vs-meta">{card.live.released}</div>
            </>
          ) : (
            <div className="vs-meta">Aucune version en ligne</div>
          )}
        </div>

        <div className="vs-upcoming">
          <div className="vs-section-label" style={{ marginBottom: 0 }}>
            Prochaine version
          </div>
          {card.upcoming.length ? (
            card.upcoming.map((u) => (
              <div className="vs-upcoming__row" key={u.key}>
                <span className="vs-upcoming__version">{u.version}</span>
                <span>
                  <Badge status={u.status} icon={u.status !== "neutral"}>
                    {u.label}
                  </Badge>
                </span>
                {u.detail && <span className="vs-meta">{u.detail}</span>}
              </div>
            ))
          ) : (
            <div className="vs-meta">Rien en préparation dans App Store Connect</div>
          )}
        </div>

        {card.latestBuild && (
          <div className="vs-build">
            {wide && <div className="vs-section-label">Dernier build</div>}
            <span>{card.latestBuild.text}</span>
            {card.latestBuild.expiry &&
              (card.latestBuild.expiryStatus === "warning" ? <Badge status="warning">{card.latestBuild.expiry}</Badge> : <span className="vs-meta">{card.latestBuild.expiry}</span>)}
          </div>
        )}
      </div>
    </Card>
  );
}
