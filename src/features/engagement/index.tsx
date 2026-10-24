import { AppLabel, Badge, Card, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Segmented, Skeleton, SourceNote, TimeChart } from "@/ui";
import { HeatLegend, RetentionTable } from "./components/RetentionTable";
import { useEngagementViewModel } from "./useEngagementViewModel";
import "./engagement.css";

export default function EngagementPage() {
  const vm = useEngagementViewModel();
  const v = vm.view;
  const header = <PageHeader title="Engagement" subtitle="Utilisateurs actifs, nouveaux utilisateurs et rétention" />;

  if (vm.loading || !v) {
    return (
      <div className="stack f-engagement" style={{ gap: "var(--space-5)" }}>
        {header}
        <KpiSkeleton count={4} />
        <div className="grid grid--2">
          <Skeleton height={280} />
          <Skeleton height={280} />
        </div>
      </div>
    );
  }

  const missing = v.notConnected.map((m) => (
    <Card key={m.slug} title={<AppLabel slug={m.slug} />}>
      <NotConnected source={`L'analytics de ${m.name}`} missing={m.missing} />
    </Card>
  ));

  if (v.connectedCount === 0) {
    return (
      <div className="stack f-engagement" style={{ gap: "var(--space-5)" }}>
        {header}
        {missing}
      </div>
    );
  }

  const c = v.charts;
  const t = v.cohorts;

  return (
    <div className="stack f-engagement" style={{ gap: "var(--space-5)" }}>
      {header}

      <div className="grid grid--kpi">
        <Kpi label="Utilisateurs actifs/jour" value={v.kpis.avgDau.value} delta={v.kpis.avgDau.delta} foot={v.kpis.avgDau.foot} hint="Moyenne des utilisateurs actifs uniques par jour sur la période" />
        <Kpi label="Nouveaux utilisateurs" value={v.kpis.newUsers.value} delta={v.kpis.newUsers.delta} foot={v.kpis.newUsers.foot} hint="Utilisateurs vus pour la première fois sur la période" />
        <Kpi label="Stickiness DAU/MAU" value={v.kpis.stickiness.value} delta={v.kpis.stickiness.delta} foot={v.kpis.stickiness.foot} hint="Actifs du jour moyens / actifs uniques sur les 30 jours glissants" />
        <Kpi label="Rétention J7" value={v.kpis.retention.value} delta={v.kpis.retention.delta} foot={v.kpis.retention.foot} hint="Part des nouveaux actifs 7 jours après leur premier jour (cohortes dont le J7 tombe sur la période)" />
      </div>

      {v.trackingNote && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{v.trackingNote}</p>}

      <div className="grid grid--2">
        <Card title={c.dauTitle} subtitle="Combien de personnes ouvrent l'app">
          {c.dau ? (
            <TimeChart x={c.x} series={c.dau} kind={c.dau.length === 1 ? "area" : "line"} formatValue={c.formatValue} formatX={c.formatX} formatXLong={c.formatXLong} showTotal />
          ) : (
            <EmptyState title="Aucun utilisateur actif sur la période" />
          )}
        </Card>
        <Card title={c.freshTitle} subtitle="Premier jour d'activité dans l'app">
          {c.fresh ? (
            <TimeChart x={c.x} series={c.fresh} kind="bar" formatValue={c.formatCount} formatX={c.formatX} formatXLong={c.formatXLong} showTotal />
          ) : (
            <EmptyState title="Aucun nouvel utilisateur sur la période" />
          )}
        </Card>
      </div>

      <Card
        title="Qui revient après J1, J7, J30 ?"
        subtitle="Part des nouveaux encore actifs le jour N, par semaine d’arrivée"
        action={
          t.tables.length > 1 && t.active ? (
            <Segmented label="App" value={t.active.slug} onChange={t.pickApp} options={t.tables.map((x) => ({ value: x.slug, label: <AppLabel slug={x.slug} /> }))} />
          ) : t.active ? (
            <AppLabel slug={t.active.slug} />
          ) : undefined
        }
        flush
        footer={<HeatLegend />}
      >
        {t.active ? <RetentionTable rows={t.active.rows} /> : <EmptyState title="Aucune cohorte sur la période" />}
      </Card>

      {missing}

      <div className="eg-notes">
        {v.notes.map((n) => (
          <div key={n.slug} className="row" style={{ gap: 8 }}>
            <SourceNote source={n.text} updatedAt={n.updatedAt} />
            {n.error && <Badge status="critical">Dernière synchro en erreur</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}
