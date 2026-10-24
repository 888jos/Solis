import { ArrowDownRight, ArrowUpRight, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppSlug } from "@/lib/apps";
import { AppLabel, Badge, Card, DataTable, EmptyState, Segmented, type Column } from "@/ui";
import type { RankMove } from "../asoRules";
import type { AsoViewModel, KeywordRowVM } from "../useAsoViewModel";

function Move({ move }: { move: RankMove }) {
  switch (move.kind) {
    case "up":
      return (
        <Badge status="good" icon={false}>
          <ArrowUpRight />
          {move.delta}
        </Badge>
      );
    case "down":
      return (
        <Badge status="critical" icon={false}>
          <ArrowDownRight />
          {move.delta}
        </Badge>
      );
    case "entered":
      return (
        <Badge status="good" icon={false}>
          Entré
        </Badge>
      );
    case "left":
      return (
        <Badge status="critical" icon={false}>
          Sorti
        </Badge>
      );
    case "same":
      return <span className="muted">=</span>;
    case "new":
      return (
        <span className="muted" title="Moins de 7 jours d'historique">
          —
        </span>
      );
    default:
      return <span className="muted">—</span>;
  }
}

function AddKeyword({ form }: { form: AsoViewModel["addForm"] }) {
  const [appSlug, setAppSlug] = useState<string>(form.apps[0]?.value ?? "");
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState(form.defaultCountry);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const app = form.apps.some((a) => a.value === appSlug) ? appSlug : (form.apps[0]?.value ?? "");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !app) return;
    setBusy(true);
    const err = await form.submit(app as AppSlug, keyword, country);
    setBusy(false);
    setError(err);
    if (!err) setKeyword("");
  };

  return (
    <form className="aso-add" onSubmit={onSubmit}>
      {form.apps.length > 1 && (
        <select className="select" value={app} onChange={(e) => setAppSlug(e.target.value)} aria-label="App">
          {form.apps.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <input className="input aso-add__kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Mot-clé à suivre" maxLength={100} aria-label="Mot-clé" />
      <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Pays">
        {form.countries.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <button className="btn" type="submit" disabled={busy || !keyword.trim()}>
        <Plus />
        Suivre
      </button>
      {error && <span className="aso-add__error">{error}</span>}
    </form>
  );
}

export function KeywordTable({ vm }: { vm: AsoViewModel }) {
  const showApp = !vm.appFilter;
  const columns: Column<KeywordRowVM>[] = [
    {
      key: "keyword",
      header: "Mot-clé",
      cell: (r) => (
        <div className="aso-kw">
          <button type="button" className={r.selected ? "aso-link aso-link--active" : "aso-link"} onClick={r.select} aria-pressed={r.selected} aria-label={`Historique de ${r.keyword} (${r.country.toUpperCase()})`}>
            {r.keyword}
          </button>
          {showApp && <AppLabel slug={r.appSlug} />}
        </div>
      ),
    },
    { key: "country", header: "Pays", cell: (r) => <span title={r.countryName}>{r.country.toUpperCase()}</span> },
    { key: "rank", header: "Rang", align: "right", cell: (r) => (r.rank != null ? <strong className="num">{r.rankLabel}</strong> : <span className="muted">{r.rankLabel}</span>) },
    { key: "move", header: "vs 7 j", align: "right", cell: (r) => <Move move={r.move} /> },
    { key: "competitor", header: "1er concurrent", cell: (r) => <span className="aso-competitor">{r.topCompetitor ?? "—"}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 40,
      cell: (r) => (
        <button
          type="button"
          className="btn btn--ghost aso-remove"
          aria-label={`Ne plus suivre ${r.keyword} (${r.country.toUpperCase()})`}
          title={r.manual ? "Ne plus suivre (historique conservé)" : "Ne plus suivre (historique conservé ; revient s'il est encore dans le champ mots-clés à la prochaine synchro)"}
          onClick={() => void vm.removeKeyword(r.id)}
        >
          <X />
        </button>
      ),
    },
  ];

  return (
    <Card
      title="Où se classent les mots-clés suivis ?"
      subtitle="Position de l'app dans la recherche iTunes, top 200, mesurée chaque jour"
      action={vm.countryFilter.options.length > 2 ? <Segmented label="Pays" value={vm.countryFilter.value} options={vm.countryFilter.options} onChange={vm.countryFilter.set} /> : undefined}
      flush
      footer={<AddKeyword form={vm.addForm} />}
    >
      <DataTable
        columns={columns}
        rows={vm.keywordRows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="Aucun mot-clé suivi">Les mots-clés sont repris du champ mots-clés App Store Connect à la prochaine synchro, ou ajoute-les ci-dessous.</EmptyState>}
      />
      {vm.keywordMore && (
        <div className="aso-more">
          <button type="button" className="btn btn--ghost" onClick={vm.keywordMore.toggle}>
            {vm.keywordMore.showAll ? "Afficher moins" : `Afficher les ${vm.keywordMore.total} mots-clés`}
          </button>
        </div>
      )}
    </Card>
  );
}
