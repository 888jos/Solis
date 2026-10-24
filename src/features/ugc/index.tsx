import { ExternalLink, Video } from "lucide-react";
import { Badge, BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, SourceNote, TimeChart, type Column } from "@/ui";
import { CPM_METHOD, useUgcViewModel } from "./useUgcViewModel";
import "./ugc.css";

type View = NonNullable<ReturnType<typeof useUgcViewModel>["view"]>;
type CreatorRow = View["creators"][number];
type VideoRow = View["topVideos"][number];

const creatorColumns: Column<CreatorRow>[] = [
  {
    key: "name",
    header: "Créateur",
    cell: (r) => (
      <div className="ugc-creator">
        <span className="ugc-creator__name">{r.name}</span>
        {r.handle &&
          (r.url ? (
            <a className="ugc-creator__handle" href={r.url} target="_blank" rel="noreferrer">
              {r.handle}
            </a>
          ) : (
            <span className="ugc-creator__handle">{r.handle}</span>
          ))}
      </div>
    ),
  },
  { key: "deal", header: "Deal", cell: (r) => <span className="secondary">{r.deal}</span> },
  {
    key: "stage",
    header: "Étape",
    cell: (r) => (
      <span className="row" style={{ gap: 6 }}>
        {r.stage ? (
          <Badge status={r.stage.status} icon={false}>
            {r.stage.label}
          </Badge>
        ) : (
          <span className="muted">—</span>
        )}
        {r.statusLabel && <span className="muted ugc-small">{r.statusLabel}</span>}
      </span>
    ),
  },
  { key: "joined", header: "Ajouté", align: "right", cell: (r) => <span className="secondary">{r.joined}</span> },
  { key: "videos", header: "Vidéos", align: "right", cell: (r) => r.videos },
  { key: "views", header: "Vues", align: "right", cell: (r) => r.views },
  { key: "cost", header: "Coût", align: "right", cell: (r) => r.cost },
  { key: "per1k", header: "Coût / 1000 vues", align: "right", cell: (r) => r.per1k },
];

const videoColumns: Column<VideoRow>[] = [
  {
    key: "label",
    header: "Vidéo",
    cell: (r) =>
      r.url ? (
        <a className="ugc-link" href={r.url} target="_blank" rel="noreferrer">
          {r.label}
          <ExternalLink size={12} />
        </a>
      ) : (
        r.label
      ),
  },
  { key: "creator", header: "Créateur", cell: (r) => r.creator },
  { key: "platform", header: "Plateforme", cell: (r) => <span className="secondary">{r.platform}</span> },
  { key: "posted", header: "Publiée", align: "right", cell: (r) => <span className="secondary">{r.posted}</span> },
  { key: "views", header: "Vues", align: "right", cell: (r) => r.views },
  { key: "cost", header: "Coût", align: "right", cell: (r) => <span title={r.costNote}>{r.cost}</span> },
];

export default function UgcPage() {
  const vm = useUgcViewModel();
  const v = vm.view;
  const header = (
    <PageHeader
      title="Créateurs UGC"
      subtitle="CortiFree · vidéos, vues et coût des créateurs SideShift"
      actions={v?.snapshotBadge ? <Badge status="warning">{v.snapshotBadge}</Badge> : undefined}
    />
  );

  if (vm.otherAppName) {
    return (
      <div className="stack f-ugc">
        {header}
        <div className="card">
          <EmptyState title={`Pas de programme UGC pour ${vm.otherAppName}`}>La base Airtable UGC ne couvre que CortiFree. Choisis CortiFree ou Toutes.</EmptyState>
        </div>
      </div>
    );
  }

  if (vm.loading) {
    return (
      <div className="stack f-ugc">
        {header}
        <KpiSkeleton count={5} />
        <Skeleton height={280} />
      </div>
    );
  }

  if (vm.notConnected || !v) {
    return (
      <div className="stack f-ugc">
        {header}
        <div className="card">
          <NotConnected source="Airtable UGC" missing="AIRTABLE_TOKEN dans Convex (lecture de la base appDXNkfK2prnjyud), ou un snapshot importé">
            Aucune donnée créateur en base.
          </NotConnected>
        </div>
      </div>
    );
  }

  return (
    <div className="stack f-ugc" data-refreshing={vm.refreshing || undefined}>
      {header}

      <div className="grid grid--kpi">
        {v.kpis.map((k) => (
          <Kpi key={k.key} label={k.label} value={k.value} delta={k.delta} invertDelta={k.invertDelta} foot={k.foot} hint={k.hint} />
        ))}
      </div>

      <div className="grid grid--main-side">
        <Card title="Combien de vues font les vidéos publiées ?" subtitle={`Vues actuelles, par date de publication · ${vm.periodLabel}`}>
          {v.hasViews ? (
            <TimeChart kind="bar" {...v.viewsChart} legend={false} height={240} formatValue={vm.formatViews} formatX={v.formatX} formatXLong={v.formatXLong} />
          ) : (
            <EmptyState title="Aucune vidéo publiée sur la période" icon={<Video />}>
              {v.productionsTotal === 0
                ? "La table Productions d'Airtable est vide : aucune vidéo n'y est encore enregistrée."
                : "Aucune production au statut Published avec une date de publication dans cette période."}
            </EmptyState>
          )}
        </Card>
        <Card title="Où en est le recrutement ?" subtitle={`Contact → candidature → publication · ${vm.periodLabel}`}>
          {v.hasFunnel ? <BarList items={v.funnelItems} formatValue={vm.formatCount} /> : <EmptyState title="Aucun contact ni candidature sur la période" />}
        </Card>
      </div>

      <div className="grid grid--main-side">
        <Card title="Combien de candidatures arrivent ?" subtitle={`Formulaire créateur, par programme · ${vm.periodLabel}`}>
          {v.hasApplications ? (
            <TimeChart kind="bar" {...v.applicationsChart} showTotal height={220} formatValue={vm.formatCount} formatX={v.formatX} formatXLong={v.formatXLong} />
          ) : (
            <EmptyState title="Aucune candidature sur la période" />
          )}
        </Card>
        <Card title="Que répondent les créateurs contactés ?" subtitle={`${vm.formatCount(v.contacted)} contacts SideShift · ${vm.periodLabel}`}>
          {v.replyItems.length ? <BarList items={v.replyItems} formatValue={vm.formatCount} /> : <EmptyState title="Aucun contact sur la période" />}
        </Card>
      </div>

      <Card
        title="Qui produit, pour combien ?"
        subtitle={`${vm.formatCount(v.creatorsCount)} créateurs · ${v.stageSummary}`}
        flush
        footer={
          <div className="ugc-breakdown">
            {v.costBreakdown.map((c) => (
              <span key={c.key}>
                {c.label} <strong className="num">{c.value}</strong>
              </span>
            ))}
            <span className="muted">{CPM_METHOD}</span>
          </div>
        }
      >
        <DataTable columns={creatorColumns} rows={v.creators} rowKey={(r) => r.id} empty={<EmptyState title="Aucun créateur dans Airtable" />} />
      </Card>

      <Card title="Quelles vidéos font le plus de vues ?" subtitle={`Top 10 publiées · ${vm.periodLabel}`} flush>
        <DataTable
          columns={videoColumns}
          rows={v.topVideos}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Aucune vidéo publiée sur la période" icon={<Video />} />}
        />
      </Card>

      <div className="stack" style={{ gap: 4 }}>
        <SourceNote source={v.sourceLabel} updatedAt={v.updatedAt} />
        {v.fxNote && <span className="muted ugc-small">{v.fxNote}</span>}
      </div>
    </div>
  );
}
