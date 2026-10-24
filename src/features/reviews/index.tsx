import { RefreshCw } from "lucide-react";
import { formatDay, formatDecimal, formatInt } from "@/lib/format";
import { AppLabel, Badge, Card, DataTable, EmptyState, Kpi, KpiSkeleton, PageHeader, Skeleton, SourceNote, TimeChart, type Column } from "@/ui";
import { FeedFilters, ReviewFeed } from "./components/ReviewFeed";
import { Stars } from "./components/Stars";
import { useReviewsViewModel } from "./useReviewsViewModel";
import "./reviews.css";

type CountryRow = NonNullable<ReturnType<typeof useReviewsViewModel>["view"]>["countries"][number];

export default function ReviewsPage() {
  const vm = useReviewsViewModel();
  const v = vm.view;

  const syncButton = (
    <button type="button" className="btn" onClick={vm.sync.run} disabled={vm.sync.running}>
      <RefreshCw className={vm.sync.running ? "rv-spin" : undefined} />
      {vm.sync.running ? "Synchro…" : "Synchroniser"}
    </button>
  );

  const header = <PageHeader title="Avis & notes" subtitle="Notes App Store par pays et avis écrits" actions={syncButton} />;

  if (vm.loading || !v) {
    return (
      <div className="stack f-reviews" style={{ gap: "var(--space-5)" }}>
        {header}
        <KpiSkeleton count={4} />
        <Skeleton height={280} />
      </div>
    );
  }

  if (v.neverSynced) {
    return (
      <div className="stack f-reviews" style={{ gap: "var(--space-5)" }}>
        {header}
        <div className="card">
          <EmptyState title="Pas encore synchronisé" action={syncButton}>
            Aucun avis App Store Connect ni relevé iTunes Lookup en base. Lance une première synchro.
          </EmptyState>
        </div>
      </div>
    );
  }

  const columns: Column<CountryRow>[] = [
    { key: "country", header: "Pays", cell: (r) => <span className="rv-country"><span className="rv-cc">{r.country}</span>{r.countryName}</span> },
    ...(v.showAppColumn ? [{ key: "app", header: "App", cell: (r: CountryRow) => <AppLabel slug={r.appSlug} /> }] : []),
    {
      key: "avg",
      header: "Note",
      align: "right",
      cell: (r) => (
        <span className="rv-rating-cell">
          {r.average != null && <Stars value={r.average} size={11} />}
          <span className="num">{r.averageLabel}</span>
        </span>
      ),
    },
    { key: "count", header: "Notes", align: "right", cell: (r) => r.count },
    { key: "share", header: "Part", align: "right", cell: (r) => <span className="muted">{r.share}</span> },
    { key: "reviews", header: "Avis écrits", align: "right", cell: (r) => r.reviewsTotal },
    { key: "period", header: "Sur la période", align: "right", cell: (r) => r.reviewsPeriod },
  ];

  return (
    <div className="stack f-reviews" style={{ gap: "var(--space-5)" }}>
      {header}

      {(v.syncErrors.length > 0 || vm.sync.error) && (
        <div className="row rv-errors">
          {vm.sync.error && <Badge status="critical">Synchro : {vm.sync.error}</Badge>}
          {v.syncErrors.map((e) => (
            <Badge key={e} status="critical">
              {e}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid--kpi">
        {v.kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} foot={k.foot} hint={k.hint} />
        ))}
      </div>

      <div className="grid grid--main-side">
        <Card title="Comment évolue la note ?" subtitle="Note moyenne pondérée par app, un relevé par jour">
          {v.trend.points >= 2 ? (
            <TimeChart x={v.trend.x} series={v.trend.series} kind="line" height={220} formatValue={(n) => formatDecimal(n)} formatX={formatDay} />
          ) : (
            <div className="stack">
              <p className="rv-note">
                {v.trend.points === 1
                  ? `Un seul relevé pour l'instant (${v.trend.firstDate}). La courbe se construit avec la synchro quotidienne.`
                  : "Aucun relevé sur la période."}
              </p>
              {v.perApp.length > 0 && (
                <div className="rv-perapp">
                  {v.perApp.map((a) => (
                    <div key={a.appSlug} className="rv-perapp__row">
                      <AppLabel slug={a.appSlug} />
                      <span className="rv-rating-cell">
                        {a.average != null && <Stars value={a.average} size={12} />}
                        <span className="num rv-perapp__avg">{a.averageLabel}</span>
                      </span>
                      <span className="muted num">{a.count} notes</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Quelles notes laissent les avis ?" subtitle={`Avis écrits, ${vm.periodLabel}`}>
          {v.reviewsInPeriod === 0 ? (
            <EmptyState title="Aucun avis sur la période" />
          ) : (
            <div className="rv-dist">
              {v.distribution.map((d) => (
                <div key={d.key} className="hbar">
                  <span className="hbar__label">{d.stars}★</span>
                  <span className="hbar__track">
                    <span className="hbar__fill rv-dist__fill" style={{ width: `${d.widthPct}%` }} />
                  </span>
                  <span className="hbar__value">
                    {formatInt(d.value)} <span className="muted">{d.share}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Où sont les notes ?" subtitle="Dernier relevé par pays (iTunes Lookup) et avis écrits (App Store Connect)" flush>
        <DataTable columns={columns} rows={v.countries} rowKey={(r) => r.key} empty={<EmptyState title="Aucune note relevée" />} />
      </Card>

      <Card title="Que disent les avis ?" subtitle={vm.feed ? `${formatInt(vm.feed.matched)} avis, ${vm.periodLabel}` : undefined} action={<FeedFilters vm={vm} />} flush>
        <ReviewFeed vm={vm} />
      </Card>

      <div className="stack" style={{ gap: 4 }}>
        <SourceNote source="App Store Connect, avis clients" updatedAt={v.reviewsSyncedAt} />
        <SourceNote source={`iTunes Lookup, notes par pays${v.ratingsStorefronts ? ` (${v.ratingsStorefronts})` : ""}`} updatedAt={v.ratingsSyncedAt} />
      </div>
    </div>
  );
}
