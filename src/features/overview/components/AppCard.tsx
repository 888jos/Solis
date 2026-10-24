import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Delta, Sparkline } from "@/ui";
import type { AppCardVm } from "../useOverviewViewModel";

/** One app at a glance: net + trend, then subscribers, trials, downloads, rating, live version. */
export function AppCard({ app }: { app: AppCardVm }) {
  return (
    <section className="card ov-app">
      <Link className="ov-app__head" to={app.to} aria-label={`Revenus de ${app.name}`}>
        <span className="app-dot" style={{ background: app.color }} />
        <strong>{app.name}</strong>
        {app.version && <span className="ov-app__version num">{app.version}</span>}
        <ChevronRight className="ov-app__chevron" size={15} />
      </Link>
      <div className="ov-app__net">
        <div>
          <div className="ov-app__value num">{app.net}</div>
          <div className="kpi__foot">
            <Delta value={app.netDelta} />
            <span>{app.netFoot}</span>
          </div>
        </div>
        <div className="ov-app__spark">
          <Sparkline values={app.spark} color={app.color} height={34} />
        </div>
      </div>
      <dl className="ov-app__stats">
        {app.stats.map((s) => (
          <div key={s.key}>
            <dt>{s.label}</dt>
            <dd className="num">
              {s.value}
              {s.foot && <small>{s.foot}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {(app.versionFoot || app.pending) && (
        <div className="ov-app__foot">
          {app.versionFoot && <span>{app.versionFoot}</span>}
          {app.pending && <span className="ov-app__pending">{app.pending}</span>}
        </div>
      )}
    </section>
  );
}
