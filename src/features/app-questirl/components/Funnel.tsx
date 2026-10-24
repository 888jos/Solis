import { ChevronDown } from "lucide-react";

export type FunnelStep = { key: string; label: string; sublabel?: string; value: string; widthPct: number; shade: number; share: string; conversion: string | null; lost: string | null };

/** Horizontal step bars (ordinal blue ramp), with the conversion from the previous step between rows. */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  return (
    <ol className="qi-funnel">
      {steps.map((s) => (
        <li key={s.key}>
          {s.conversion != null && (
            <div className="qi-funnel__between">
              <ChevronDown size={13} aria-hidden />
              <span className="num">{s.conversion}</span>
              {s.lost && <span className="qi-funnel__lost num">{s.lost}</span>}
            </div>
          )}
          <div className="qi-funnel__row">
            <div className="qi-funnel__label">
              <span>{s.label}</span>
              {s.sublabel && <small>{s.sublabel}</small>}
            </div>
            <div className="qi-funnel__track">
              <span className="qi-funnel__fill" style={{ width: `${s.widthPct}%`, background: `color-mix(in oklab, var(--series-1) ${s.shade}%, var(--surface))` }} />
            </div>
            <div className="qi-funnel__value">
              <strong className="num">{s.value}</strong>
              <small className="num">{s.share}</small>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
