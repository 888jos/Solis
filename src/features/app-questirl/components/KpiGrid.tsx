import { Kpi, KpiSkeleton } from "@/ui";
import type { KpiItem } from "../types";

export function KpiGrid({ items, skeleton = 4 }: { items: KpiItem[] | null; skeleton?: number }) {
  if (!items) return <div className="qi-kpis"><KpiSkeleton count={skeleton} /></div>;
  return (
    <div className="grid grid--kpi qi-kpis">
      {items.map((k) => (
        <Kpi key={k.key} label={k.label} value={k.value} foot={k.foot} hint={k.hint} />
      ))}
    </div>
  );
}
