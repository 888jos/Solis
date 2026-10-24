import { CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, EmptyState } from "@/ui";
import { appColor } from "@/lib/apps";
import type { WatchRow } from "../useOverviewViewModel";

/** "À surveiller": real signals only, each row opens the page that explains it. */
export function WatchList({ rows }: { rows: WatchRow[] }) {
  if (!rows.length) return <EmptyState title="Rien à signaler" icon={<CheckCircle2 />} />;
  return (
    <ul className="ov-watch">
      {rows.map((r) => (
        <li key={r.key}>
          <Link to={r.to} className="ov-watch__row">
            <Badge status={r.status} icon={r.status !== "neutral"}>
              {r.badge}
            </Badge>
            <span className="ov-watch__text">
              <span className="ov-watch__title">
                {r.appSlug && <span className="app-dot" style={{ background: appColor(r.appSlug) }} />}
                {r.title}
              </span>
              {r.detail && <span className="ov-watch__detail">{r.detail}</span>}
            </span>
            <ChevronRight className="ov-watch__chevron" size={15} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
