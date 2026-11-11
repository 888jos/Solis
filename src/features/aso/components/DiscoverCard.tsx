import { api } from "@convex/_generated/api";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { AppSlug } from "@/lib/apps";
import { useSolisQuery } from "@/lib/convex";
import { formatDay } from "@/lib/format";
import { Card, EmptyState, NotConnected, Skeleton } from "@/ui";
import type { AsoViewModel } from "../useAsoViewModel";

const GENRE: Record<string, string> = { HEALTH_FITNESS: "Santé", LIFESTYLE: "Style de vie", PRODUCTIVITY_UTILITIES: "Productivité" };

/** Apple Ads: the most searched terms of the studio's genres that are not tracked yet, one click to track. */
export function DiscoverCard({ vm }: { vm: AsoViewModel }) {
  const countries = vm.countryFilter.options.filter((o) => o.value !== "all");
  const [country, setCountry] = useState(countries.find((c) => c.value === "us")?.value ?? countries[0]?.value ?? "us");
  const [appSlug, setAppSlug] = useState<string>(vm.addForm.apps[0]?.value ?? "cortifree");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const data = useSolisQuery(api.aso.discover, { country, app: vm.appFilter ?? appSlug });
  const configured = vm.appleSync != null && vm.appleSync.status !== "skipped";

  return (
    <Card
      title="Quelles recherches populaires je ne suis pas encore ?"
      subtitle={data?.week ? `Popularité officielle Apple Ads (1 à 100), semaine se terminant le ${formatDay(data.week)} · cliquer pour suivre` : "Popularité officielle Apple Ads, termes les plus cherchés de tes catégories"}
      action={
        <span className="row" style={{ gap: 8 }}>
          {!vm.appFilter && vm.addForm.apps.length > 1 && (
            <select className="select" value={appSlug} onChange={(e) => setAppSlug(e.target.value)} aria-label="App">
              {vm.addForm.apps.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Pays">
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </span>
      }
    >
      {!configured ? (
        <NotConnected source="Apple Ads (utilisateur API)" missing="ASA_CLIENT_ID, ASA_TEAM_ID et ASA_KEY_ID dans les variables Convex" />
      ) : !data ? (
        <Skeleton height={120} />
      ) : !data.rows.length ? (
        <EmptyState title="Rien pour ce pays">Apple ne liste que les ~500 termes les plus cherchés par catégorie, ou la première synchro n'a pas encore tourné.</EmptyState>
      ) : (
        <div className="aso-discover">
          {data.rows.map((r) => (
            <button
              key={r.term}
              type="button"
              className="aso-term"
              disabled={added.has(r.term)}
              title={`${GENRE[r.genre] ?? r.genre}${r.rankInGenre ? ` · n°${r.rankInGenre} de la catégorie` : ""} · cliquer pour suivre`}
              onClick={async () => {
                const err = await vm.addForm.submit((vm.appFilter ?? appSlug) as AppSlug, r.term, country);
                if (!err) setAdded((s) => new Set(s).add(r.term));
              }}
            >
              {added.has(r.term) ? "✓" : <Plus size={12} />}
              {r.term}
              <span className="num">{r.popularity}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
