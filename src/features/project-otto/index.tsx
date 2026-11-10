import { ExternalLink } from "lucide-react";
import { Badge, BarList, Card, DataTable, EmptyState, Kpi, KpiSkeleton, PageHeader, Segmented, Skeleton, SourceNote, TimeChart } from "@/ui";
import { formatDay, formatDayLong, formatEur, formatInt } from "@/lib/format";
import { formatUsd, useOttoViewModel, type RangeKey } from "./useOttoViewModel";
import { RANGES } from "./useOttoViewModel";
import "./otto.css";

const SYNC_CMD = "python3 scripts/solis_projects_sync.py otto";

export default function OttoPage() {
  const vm = useOttoViewModel();
  const actions = <Segmented<RangeKey> label="Période" value={vm.range} onChange={vm.setRange} options={[...RANGES]} />;

  if (vm.loading) {
    return (
      <div className="stack f-otto">
        <PageHeader title="Otto" subtitle="ottoknows.it" actions={actions} />
        <KpiSkeleton count={5} />
        <Skeleton height={260} />
      </div>
    );
  }

  if (!vm.connected) {
    return (
      <div className="stack f-otto">
        <PageHeader title="Otto" subtitle="ottoknows.it" actions={actions} />
        <Card>
          <EmptyState title="Otto pas encore synchronisé">
            Sur le Mac, dans ~/app/carousel-factory : <code>{SYNC_CMD}</code>
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack f-otto">
      <PageHeader
        title="Otto"
        subtitle={
          <>
            <a href="https://ottoknows.it" target="_blank" rel="noreferrer">
              ottoknows.it
            </a>{" "}
            · rapport de conversation à 12,90 € · {vm.rangeLabel}
          </>
        }
        actions={actions}
      />
      {vm.lastRun?.status === "error" && (
        <Card>
          <Badge status="critical">Dernière synchro en erreur</Badge> <span className="muted">{vm.lastRun.message}</span>
        </Card>
      )}

      <div className="grid grid--kpi ot-kpis">
        {vm.kpis.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} delta={k.delta} invertDelta={k.invertDelta} foot={k.foot} hint={k.hint} />
        ))}
      </div>

      <div className="grid grid--2">
        <Card title="Combien de rapports deviennent des paiements ?" subtitle="Par jour (heure de Paris)">
          <TimeChart x={vm.funnel.x} series={vm.funnel.series} kind="bar-grouped" formatValue={formatInt} formatX={formatDay} formatXLong={formatDayLong} />
        </Card>
        <Card title="Le revenu couvre-t-il le coût IA ?" subtitle={vm.moneyUnit === "€" ? "Par jour, en € (coût IA converti depuis le $)" : "Par jour (coût IA en $, pas de taux de change)"}>
          <TimeChart x={vm.money.x} series={vm.money.series} kind="bar-grouped" formatValue={(v) => (vm.moneyUnit === "€" ? formatEur(v) : formatUsd(v))} formatX={formatDay} formatXLong={formatDayLong} />
        </Card>
      </div>

      <h2 className="ot-section">Vidéos TikTok / Instagram</h2>
      <div className="grid grid--kpi">
        {vm.videoKpis.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} foot={k.foot} />
        ))}
      </div>

      <div className="grid grid--main-side">
        <Card title="Quel compte fait le plus de vues ?" subtitle="Vidéos publiées sur la période, dernier relevé">
          <DataTable
            rows={vm.accounts}
            rowKey={(a) => a.account}
            columns={[
              { key: "a", header: "Compte", cell: (a) => <span>@{a.account}</span> },
              { key: "p", header: "Vidéos", align: "right", cell: (a) => <span className="num">{formatInt(a.posts)}</span> },
              { key: "v", header: "Vues", align: "right", cell: (a) => <span className="num">{formatInt(a.views)}</span> },
              { key: "m", header: "Médiane", align: "right", cell: (a) => <span className="num">{formatInt(a.medianViews)}</span> },
              { key: "l", header: "Likes", align: "right", cell: (a) => <span className="num">{formatInt(a.likes)}</span> },
              { key: "c", header: "Comm.", align: "right", cell: (a) => <span className="num">{formatInt(a.comments)}</span> },
            ]}
            empty={<EmptyState title="Aucune vidéo publiée sur la période" />}
          />
        </Card>
        <Card title="Où en est la validation des vidéos ?" subtitle="Bot Telegram (validation.json)">
          {vm.validation.statuses.length ? (
            <BarList
              items={vm.validation.statuses.map((s, i) => ({
                key: s.key,
                label: s.label,
                value: vm.validation.totals[s.key] ?? 0,
                color: ["var(--series-4)", "var(--series-6)", "var(--series-7)", "var(--series-other)"][i] ?? "var(--series-other)",
              }))}
              formatValue={formatInt}
            />
          ) : (
            <EmptyState title="Pas de file de validation" />
          )}
          {vm.offers.length > 0 && (
            <div className="ot-offers">
              <div className="card__subtitle">Ventes par offre (90 j)</div>
              {vm.offers.map((o) => (
                <div key={o.offer} className="row ot-offer">
                  <span>{o.label}</span>
                  <span className="muted num">
                    {formatInt(o.sales)} vente{o.sales > 1 ? "s" : ""}
                    {o.refunded ? ` · ${o.refunded} remb.` : ""} · {o.eur}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Quelles vidéos marchent le mieux ?" subtitle="Top 15 par vues sur la période" flush>
        <DataTable
          rows={vm.top}
          rowKey={(t) => t.postId}
          columns={[
            {
              key: "v",
              header: "Vidéo",
              cell: (t) => (
                <a className="ot-video" href={t.url} target="_blank" rel="noreferrer" title={t.caption}>
                  <span className="ot-video__caption">{t.caption || "(sans légende)"}</span>
                  <ExternalLink size={12} aria-hidden />
                </a>
              ),
            },
            { key: "a", header: "Compte", cell: (t) => <span className="muted">@{t.account}</span> },
            { key: "pl", header: "Réseau", cell: (t) => <span className="muted">{t.platform === "tiktok" ? "TikTok" : "Instagram"}</span> },
            { key: "d", header: "Publiée", cell: (t) => <span className="muted num">{formatDay(new Date(t.postedAt).toISOString())}</span> },
            { key: "vw", header: "Vues", align: "right", cell: (t) => <span className="num">{formatInt(t.views)}</span> },
            { key: "l", header: "Likes", align: "right", cell: (t) => <span className="num">{formatInt(t.likes)}</span> },
            { key: "c", header: "Comm.", align: "right", cell: (t) => <span className="num">{formatInt(t.comments)}</span> },
          ]}
          empty={<EmptyState title="Aucune vidéo sur la période" />}
        />
      </Card>

      {vm.validation.rows.length > 0 && (
        <Card title="Validation par compte" flush>
          <DataTable
            rows={vm.validation.rows}
            rowKey={(r) => r.account}
            columns={[
              { key: "a", header: "Compte", cell: (r) => <span>{r.account}</span> },
              ...vm.validation.statuses.map((s) => ({
                key: s.key,
                header: s.label,
                align: "right" as const,
                cell: (r: (typeof vm.validation.rows)[number]) => <span className="num">{formatInt(r.counts[s.key] ?? 0)}</span>,
              })),
            ]}
          />
        </Card>
      )}

      <SourceNote source={`Convex Otto (prod) + otto-video-factory, poussés depuis le Mac (${SYNC_CMD})`} updatedAt={vm.syncedAt} />
    </div>
  );
}
