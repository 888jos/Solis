import type { WaterfallStep } from "../useRevenueViewModel";

/** Horizontal waterfall: each row is a segment of the gross amount (0–100 %), deductions float. */
export function Waterfall({ steps }: { steps: WaterfallStep[] }) {
  return (
    <div className="rv-waterfall" role="list">
      {steps.map((step) => (
        <div className={`rv-waterfall__row rv-waterfall__row--${step.kind}${step.key === "net" ? " rv-waterfall__row--net" : ""}`} role="listitem" key={step.key}>
          <div className="rv-waterfall__label">
            <span>{step.label}</span>
            {step.note && <small>{step.note}</small>}
          </div>
          <div className="rv-waterfall__track" aria-hidden="true">
            <span className="rv-waterfall__bar" style={{ left: `${step.start}%`, width: `${Math.max(step.end - step.start, step.end > step.start ? 0.8 : 0)}%` }} />
          </div>
          <div className="rv-waterfall__amount num">{step.amount}</div>
        </div>
      ))}
    </div>
  );
}
