import { RefreshCw } from "lucide-react";
import { formatDayLong, formatInt } from "@/lib/format";
import { BarList, Card, EmptyState, Kpi, KpiSkeleton, NotConnected, PageHeader, Skeleton, SourceNote } from "@/ui";
import { KeywordTable } from "./components/KeywordTable";
import { MetadataCard } from "./components/MetadataCard";
import { RankHistoryCard } from "./components/RankHistoryCard";
import { useAsoViewModel } from "./useAsoViewModel";
import "./aso.css";

export default function Page() {
  const vm = useAsoViewModel();
  const refreshLabel = vm.refreshState === "pending" ? "Lancement…" : vm.refreshState === "started" || vm.ranksRunning ? "Mesure en cours" : vm.refreshState === "busy" ? "Déjà en cours" : "Actualiser";

  return (
    <div className="f-aso stack" style={{ gap: "var(--space-5)" }}>
      <PageHeader
        title="ASO"
        subtitle="Mots-clés, positions dans la recherche App Store, popularité et fiches par langue"
        actions={
          <button className="btn" type="button" onClick={vm.refresh} disabled={vm.refreshState !== "idle" || vm.ranksRunning} title="Relit App Store Connect et mesure les mots-clés pas encore mesurés aujourd'hui">
            <RefreshCw />
            {refreshLabel}
          </button>
        }
      />

      {vm.loading ? (
        <>
          <KpiSkeleton count={4} />
          <Skeleton height={280} />
        </>
      ) : (
        <>
          <div className="grid grid--kpi">
            <Kpi label="Mots-clés suivis" value={formatInt(vm.kpis.tracked)} foot={`${vm.kpis.countries} pays · ${vm.kpis.measured} mesurés`} />
            <Kpi label="Mots-clés classés" value={formatInt(vm.kpis.ranked)} foot={`dont ${formatInt(vm.kpis.top10)} dans le top 10`} />
            <Kpi
              label="Évolution sur 7 jours"
              value={vm.kpis.comparable ? `${vm.kpis.up} ↑ · ${vm.kpis.down} ↓` : "—"}
              foot={vm.kpis.comparable ? `sur ${vm.kpis.comparable} comparables` : "il faut 7 jours d'historique"}
            />
            <Kpi label="Points à corriger" value={formatInt(vm.kpis.issues)} foot="sur les fiches en ligne" />
          </div>

          {vm.ranksError && (
            <Card>
              <EmptyState title="La dernière mesure des rangs a échoué">{vm.ranksError}</EmptyState>
            </Card>
          )}

          <div className="grid grid--main-side">
            <RankHistoryCard chart={vm.chart} />
            <Card title="Combien sont bien classés ?" subtitle={vm.lastMeasured ? `Mesure du ${formatDayLong(vm.lastMeasured)}` : undefined}>
              {vm.kpis.measured ? (
                <div className="stack" style={{ gap: "var(--space-5)" }}>
                  <BarList items={vm.distribution} formatValue={formatInt} />
                  {vm.distributionByApp.length > 1 && (
                    <div className="stack" style={{ gap: "var(--space-2)" }}>
                      <div className="aso-section-label">Classés, par app</div>
                      <BarList items={vm.distributionByApp} formatValue={formatInt} />
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState title="Aucune mesure pour l'instant">La mesure quotidienne lit la recherche App Store de chaque pays (≈ 20 requêtes par minute).</EmptyState>
              )}
            </Card>
          </div>

          <KeywordTable vm={vm} />

          {vm.metaError && !vm.hasMetadata ? (
            <Card title="Fiches App Store">
              <NotConnected source="App Store Connect (métadonnées)" missing={vm.metaError} />
            </Card>
          ) : vm.apps.length ? (
            vm.apps.map((app) => <MetadataCard key={app.slug} app={app} />)
          ) : (
            <Card title="Fiches App Store">
              <EmptyState title="Métadonnées pas encore synchronisées">Clique sur Actualiser pour lire les fiches depuis App Store Connect.</EmptyState>
            </Card>
          )}

          <div className="aso-sources">
            <SourceNote source="Métadonnées : App Store Connect" updatedAt={vm.metaSync?.lastOkAt ?? null} />
            <SourceNote source="Rangs : recherche App Store, chaque jour" updatedAt={vm.ranksSync?.lastOkAt ?? null} />
            <SourceNote source="Popularité estimée et difficulté : calculées par Solis" updatedAt={vm.statsSync?.lastOkAt ?? null} />
            <SourceNote source="Historique avant le 11 nov. : import Astro (grisé tant que pas recalculé)" updatedAt={vm.astroSync?.lastOkAt ?? null} />
          </div>
        </>
      )}
    </div>
  );
}
