import { Card, Kpi, KpiSkeleton, NotConnected, Skeleton } from "@/ui";
import {
  Async,
  Bars,
  Chart,
  ChartCard,
  ErrorState,
  KpiRow,
  SectionTitle,
  Select,
  Show,
  SimpleTable,
  TableCard,
  Tags,
} from "../../components/blocks";
import { useMonetizationViewModel } from "./useMonetizationViewModel";

const RC_MISSING =
  "REVENUECAT_CORTIFREE_SECRET_KEY et REVENUECAT_CORTIFREE_PROJECT_ID (clé secrète v2 avec lecture charts/metrics) dans les variables d'environnement Convex";

export default function MonetizationTab() {
  const vm = useMonetizationViewModel();
  return (
    <>
      <SectionTitle>RevenueCat · source de vérité pour l'argent</SectionTitle>
      {vm.rc.state === "loading" ? (
        <KpiSkeleton count={6} />
      ) : vm.rc.state === "error" ? (
        <Card>
          <ErrorState message={vm.rc.message} retry={vm.rc.retry} />
        </Card>
      ) : vm.rc.data.configured ? (
        <div className="grid grid--kpi">
          {vm.rc.data.tiles.map((t) => (
            <Kpi key={t.key} label={t.label} value={t.value} foot={t.foot} />
          ))}
        </div>
      ) : (
        <Card>
          <NotConnected source="RevenueCat" missing={RC_MISSING} />
        </Card>
      )}

      {vm.rcCharts.state === "ready" ? (
        <div className="grid grid--3">
          {vm.rcCharts.data.map((c) => (
            <Card key={c.key} title={c.title} subtitle={c.subtitle}>
              {c.notConnected ? (
                <NotConnected source="RevenueCat" missing={RC_MISSING} />
              ) : c.chart ? (
                <div className="stack" style={{ gap: 8 }}>
                  <Chart vm={c.chart} height={180} />
                  {c.summary && <p className="cf-note">{c.summary}</p>}
                </div>
              ) : (
                <p className="cf-note">Aucune donnée sur la période.</p>
              )}
            </Card>
          ))}
        </div>
      ) : vm.rcCharts.state === "error" ? (
        <Card>
          <ErrorState message={vm.rcCharts.message} retry={vm.rcCharts.retry} />
        </Card>
      ) : (
        <div className="grid grid--3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={230} />
          ))}
        </div>
      )}

      <SectionTitle>Événements de l'app (Amplitude)</SectionTitle>
      <KpiRow cell={vm.kpis} count={6} />

      <div className="grid grid--2">
        <ChartCard
          title="Les achats vont-ils au bout ?"
          subtitle="Cycle d'achat Superwall par jour"
          cell={vm.tx}
        />
        <TableCard
          title="Quels produits sont achetés ?"
          subtitle="Achats par product_id, par événement"
          cell={vm.mix}
        />
      </div>

      <Card
        title="Quels paywalls convertissent ?"
        subtitle="Ouvertures, fermetures et refus Superwall par dimension"
        action={
          <Select
            label="Dimension"
            value={vm.dim}
            options={vm.dimOptions}
            onChange={vm.setDim}
          />
        }
      >
        <Async cell={vm.paywalls} height={200}>
          {(p) => (
            <div className="stack" style={{ gap: 12 }}>
              <p className="cf-mini-title">Ouvertures (paywall_open)</p>
              <Bars vm={p.bars} limit={12} />
              <SimpleTable vm={p.table} />
            </div>
          )}
        </Async>
      </Card>

      <Card
        title="Revenu tracké dans Amplitude"
        subtitle="Somme de $revenue par événement de revenu (client et RevenueCat → Amplitude)"
      >
        <Async cell={vm.revenue} height={220}>
          {(r) => (
            <div className="stack" style={{ gap: 10 }}>
              <Tags items={r.tags} />
              {r.chart && <Chart vm={r.chart} />}
              {r.note && <p className="cf-note">{r.note}</p>}
            </div>
          )}
        </Async>
      </Card>

      <div className="grid grid--2">
        <TableCard
          title="Cycle de vie des abonnements"
          subtitle="Événements d'essai et d'abonnement, période vs précédente"
          cell={vm.lifecycle}
        />
        <Card
          title="Statut d'abonnement des actifs"
          subtitle="Propriétés utilisateur, actifs uniques sur la période"
        >
          <Async cell={vm.status} height={240}>
            {(items) => (
              <div className="cf-split">
                {items.map((s) => (
                  <div key={s.prop}>
                    <p className="cf-mini-title">{s.prop}</p>
                    <Show content={s.bars}>{(b) => <Bars vm={b} />}</Show>
                  </div>
                ))}
              </div>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
}
