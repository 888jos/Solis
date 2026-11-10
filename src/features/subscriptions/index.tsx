import { useExplorerLink } from "@/lib/explorer";
import { formatInt, formatPct } from "@/lib/format";

// Counts are whole numbers: on tiny ranges the shared axis puts ticks at 0.25 steps, leave those unlabeled.
const formatCount = (n: number) => (Number.isInteger(n) ? formatInt(n) : "");
import { AppLabel, BarList, Card, DataTable, Delta, EmptyState, Kpi, KpiSkeleton, PageHeader, Segmented, Skeleton, SourceNote, Sparkline, TimeChart, type Column } from "@/ui";
import { CONVERSION_HINT, useSubscriptionsViewModel, type ActiveMetric } from "./useSubscriptionsViewModel";
import "./subscriptions.css";

type View = NonNullable<ReturnType<typeof useSubscriptionsViewModel>["view"]>;
type AppRow = View["appRows"][number];
type EventRow = View["events"]["rows"][number];

export default function SubscriptionsPage() {
  const vm = useSubscriptionsViewModel();
  const explore = useExplorerLink();
  const v = vm.view;
  const header = <PageHeader title="Abonnements" subtitle="Abonnés actifs, essais et mouvements, rapports Apple et RevenueCat" />;

  if (vm.loading || !v) {
    return (
      <div className="stack f-subs">
        {header}
        <KpiSkeleton count={4} />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!v.anyAppleData) {
    return (
      <div className="stack f-subs">
        {header}
        <div className="card">
          <EmptyState title="Aucun rapport d'abonnements en base">
            Les rapports Apple SUBSCRIPTION et SUBSCRIPTION_EVENT n'ont pas encore été synchronisés (sources/subscriptions:backfill).
          </EmptyState>
        </div>
      </div>
    );
  }

  const appColumns: Column<AppRow>[] = [
    { key: "app", header: "App", cell: (r) => <AppLabel slug={r.appSlug} /> },
    { key: "paid", header: "Payants", align: "right", cell: (r) => <span className="num">{formatInt(r.paid)}</span> },
    { key: "trials", header: "Essais", align: "right", cell: (r) => <span className="num">{formatInt(r.trials)}</span> },
    { key: "billing", header: "Échec paiement", align: "right", cell: (r) => <span className={`num${r.billing ? "" : " muted"}`}>{formatInt(r.billing)}</span> },
    { key: "starts", header: "Essais démarrés", align: "right", cell: (r) => <span className="num">{formatInt(r.trialStarts)}</span> },
    {
      key: "conv",
      header: <span title={CONVERSION_HINT}>Conversion</span>,
      align: "right",
      cell: (r) => (
        <span className="num" title={r.conversionDetail ? `${r.conversionDetail} essais terminés` : undefined}>
          {r.conversion}
          {r.conversionDetail && <span className="muted f-subs__sub"> {r.conversionDetail}</span>}
        </span>
      ),
    },
    { key: "cancels", header: "Résil. payantes", align: "right", cell: (r) => <span className="num">{formatInt(r.cancels)}</span> },
    { key: "refunds", header: "Rembours.", align: "right", cell: (r) => <span className={`num${r.refunds ? "" : " muted"}`}>{formatInt(r.refunds)}</span> },
    ...(v.showRcColumn
      ? [
          {
            key: "mrr",
            header: "MRR RevenueCat",
            align: "right" as const,
            cell: (r: AppRow) => (
              <span className="num" title={r.rcActives != null ? `RevenueCat compte ${r.rcActives} abonnements actifs` : undefined}>
                {r.mrr}
              </span>
            ),
          },
        ]
      : []),
  ];

  const eventColumns: Column<EventRow>[] = [
    {
      key: "label",
      header: "Événement",
      cell: (r) => (
        <span className="app-chip">
          <span className="app-dot" style={{ background: r.color }} />
          {r.label}
        </span>
      ),
    },
    ...(v.singleApp
      ? []
      : v.perAppNames.map((slug) => ({
          key: slug,
          header: <AppLabel slug={slug} />,
          align: "right" as const,
          cell: (r: EventRow) => <span className={`num${r.perApp[slug] ? "" : " muted"}`}>{formatInt(r.perApp[slug])}</span>,
        }))),
    { key: "total", header: "Total", align: "right", cell: (r) => <strong className="num">{formatInt(r.total)}</strong> },
    ...(v.showPrev
      ? [
          { key: "prev", header: "Période préc.", align: "right" as const, cell: (r: EventRow) => <span className="num muted">{formatInt(r.prev)}</span> },
          { key: "delta", header: "Évol.", align: "right" as const, cell: (r: EventRow) => <Delta value={r.delta} invert={r.key === "cancel" || r.key === "trialCancel" || r.key === "refund"} /> },
        ]
      : []),
  ];

  return (
    <div className="stack f-subs">
      {header}

      <div className="grid grid--kpi">
        {v.kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} spark={k.spark ? <Sparkline values={k.spark} color="var(--text-3)" /> : undefined} to={k.key === "paid" || k.key === "trials" ? explore(k.key) : k.key === "conversion" ? explore("conversions") : undefined} />
        ))}
      </div>

      <div className="grid grid--main-side">
        <Card
          title={v.singleApp ? "Combien d'abonnés et d'essais ?" : vm.metric === "paid" ? "Combien d'abonnés payants par app ?" : "Combien d'essais en cours par app ?"}
          subtitle="Fin de journée, rapport Apple SUBSCRIPTION"
          action={
            v.singleApp ? undefined : (
              <Segmented<ActiveMetric>
                label="Mesure"
                value={vm.metric}
                onChange={vm.setMetric}
                options={[
                  { value: "paid", label: "Payants" },
                  { value: "trials", label: "Essais" },
                ]}
              />
            )
          }
        >
          {v.active.points > 0 ? (
            <TimeChart x={v.active.x} series={v.active.series} kind="line" height={240} formatValue={formatCount} formatX={v.formatX} formatXLong={v.formatXLong} />
          ) : (
            <EmptyState title="Aucun rapport Apple sur la période" />
          )}
        </Card>

        <Card title="Quelle durée choisissent les abonnés ?" subtitle={v.latestDay ? "Abonnés payants par durée, dernier rapport" : undefined}>
          {v.plans.items.length ? (
            <div className="stack f-subs__plans">
              <BarList items={v.plans.items.map((p) => ({ ...p, color: "var(--series-4)" }))} formatValue={(n) => `${formatInt(n)} · ${formatPct(v.plans.total ? n / v.plans.total : 0, 0)}`} />
              {v.plans.byApp.length > 1 && (
                <div className="f-subs__mix">
                  {v.plans.byApp.map((a) => (
                    <div key={a.appSlug} className="f-subs__mix-row">
                      <AppLabel slug={a.appSlug} />
                      <span className="muted">{a.parts.map((p) => `${p.label} ${formatPct(p.share, 0)}`).join(" · ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Aucun abonné payant" />
          )}
        </Card>
      </div>

      <Card title="Qu'est-ce qui fait bouger les abonnements ?" subtitle={`Événements Apple SUBSCRIPTION_EVENT par date d'événement, ${vm.periodLabel}. Les sorties sont en négatif.`}>
        {v.events.series.length ? (
          <TimeChart x={v.events.x} series={v.events.series} kind="bar" height={220} formatValue={formatCount} formatX={v.formatX} formatXLong={v.formatXLong} />
        ) : (
          <EmptyState title="Aucun événement d'abonnement sur la période" />
        )}
      </Card>

      <Card title="Combien d'événements sur la période ?" subtitle={v.events.billingEvents ? `Plus ${formatInt(v.events.billingEvents)} passage(s) en échec de paiement (délai de grâce, relance de facturation)` : undefined} flush>
        <DataTable columns={eventColumns} rows={v.events.rows} rowKey={(r) => r.key} />
      </Card>

      <Card title="Où en est chaque app ?" subtitle={`État au dernier rapport Apple, mouvements ${vm.periodLabel}. Conversion : essais démarrés sur la période et terminés, part passée payante.`} flush>
        <DataTable columns={appColumns} rows={v.appRows} rowKey={(r) => r.appSlug} />
      </Card>

      <div className="stack f-subs__sources">
        <SourceNote source={`App Store Connect, rapports SUBSCRIPTION et SUBSCRIPTION_EVENT${v.latestDay ? ` (dernier jour : ${v.latestDay})` : ""}`} updatedAt={v.appleSyncedAt} />
        {v.rcScope && <SourceNote source="RevenueCat, MRR CortiFree (USD converti en EUR)" updatedAt={v.rcFetchedAt} />}
      </div>
    </div>
  );
}
