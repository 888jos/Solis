import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, EmptyState, Kpi } from "@/ui";
import type { useCarouselsViewModel } from "../useCarouselsViewModel";

type Plan = NonNullable<ReturnType<typeof useCarouselsViewModel>["plan"]>;

export function PlanView({ plan, date, onDate }: { plan: Plan; date: string; onDate: (d: string) => void }) {
  if (plan.empty) {
    return (
      <div className="card">
        <EmptyState title="Carousel Factory n'a encore rien envoyé">
          Sur le Mac, dans ~/app/carousel-factory : <code>cf sync</code>. Ensuite le job de nuit synchronise tout seul.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <div className="cr-datebar">
        <button type="button" className="btn" onClick={() => onDate(plan.prev)} aria-label="Jour précédent">
          <ChevronLeft />
        </button>
        <input className="input" type="date" value={date} onChange={(e) => onDate(e.target.value)} aria-label="Date" />
        <button type="button" className="btn" onClick={() => onDate(plan.next)} aria-label="Jour suivant">
          <ChevronRight />
        </button>
        <strong className="cr-datebar__title">{plan.title}</strong>
        {!plan.isToday && (
          <button type="button" className="btn btn--ghost" onClick={() => onDate("")}>
            Aujourd'hui
          </button>
        )}
      </div>

      <div className="grid grid--kpi">
        {plan.kpis.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} />
        ))}
      </div>

      {plan.unplanned && (
        <p className="cr-note">Pas encore planifié. Le job de nuit planifie et génère le lendemain à 2 h ; à la main : <code>cf plan --date {date}</code>.</p>
      )}

      <div className="cr-accounts">
        {plan.accounts.map((a) => (
          <Card
            key={a.name}
            className={a.state.off ? "cr-account cr-account--off" : "cr-account"}
            title={`@${a.name}`}
            subtitle={a.persona}
            action={<Badge status={a.state.tone} icon={false}>{a.state.label}</Badge>}
          >
            {a.series && <p className="cr-series">Série « {a.series} »</p>}
            {a.slots.length ? (
              <ol className="cr-slots">
                {a.slots.map((s) => (
                  <li key={s.key} className="cr-slot">
                    <div className="cr-slot__when num">
                      <strong>{s.ny}</strong>
                      <span>{s.paris}</span>
                    </div>
                    <div className="cr-slot__what">
                      <p className="cr-slot__hook">{s.hook}</p>
                      <p className="cr-tags">
                        {s.tags.map((t) => (
                          <span key={t.label} className={`cr-tag cr-tag--${t.kind}`}>
                            {t.label}
                          </span>
                        ))}
                      </p>
                      {s.error && <p className="cr-slot__error">{s.error}</p>}
                    </div>
                    <div className="cr-slot__side">
                      <Badge status={s.status.tone} icon={false}>
                        {s.status.label}
                      </Badge>
                      {s.href && s.cover && (
                        <Link to={s.href} className="cr-thumb" aria-label={`Ouvrir ${s.hook}`}>
                          <img src={s.cover} alt="" loading="lazy" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              !a.state.off && <p className="muted cr-empty">Rien de prévu ce jour-là.</p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
