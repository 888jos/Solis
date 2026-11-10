import { ArrowUpRight, Check, KeyRound, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { AppLabel, Badge, Card, DataTable, EmptyState, PageHeader, Segmented, Skeleton, type Column } from "@/ui";
import { THEME_OPTIONS, useSettingsViewModel } from "./useSettingsViewModel";
import "./settings.css";

type Vm = ReturnType<typeof useSettingsViewModel>;
type AppRow = Vm["apps"][number];
type VatRow = Vm["vat"]["groups"][number];

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a className="set-link" href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
      {external && <ArrowUpRight size={12} />}
    </a>
  );
}

export default function SettingsPage() {
  const vm = useSettingsViewModel();

  const appColumns: Column<AppRow>[] = [
    { key: "app", header: "App", cell: (r) => <AppLabel slug={r.slug} /> },
    { key: "store", header: "Nom App Store", cell: (r) => r.storeName },
    { key: "id", header: "Apple ID", cell: (r) => <span className="num">{r.appStoreId}</span> },
    { key: "bundle", header: "Bundle", cell: (r) => <code className="set-code">{r.bundleId}</code> },
    { key: "sku", header: "SKU", cell: (r) => <code className="set-code">{r.sku}</code> },
    { key: "link", header: "", align: "right", cell: (r) => <ExternalLink href={r.storeUrl}>App Store</ExternalLink> },
  ];

  const vatColumns: Column<VatRow>[] = [
    { key: "rate", header: "Taux", width: 72, cell: (r) => <span className="num">{r.rate}</span> },
    { key: "count", header: "Pays", width: 52, align: "right", cell: (r) => <span className="num">{r.count}</span> },
    { key: "countries", header: "Storefronts", cell: (r) => <span className="set-cc">{r.countries}</span> },
  ];

  return (
    <div className="stack f-settings">
      <PageHeader title="Réglages" subtitle="Cet appareil, les apps, les définitions et les clés" />

      <div className="grid grid--2 set-top">
        <Card title="Cet appareil">
          <div className="set-rows">
            <div className="set-row">
              <div>
                <div className="set-row__label">Thème</div>
                <div className="set-row__hint">Gardé sur cet appareil</div>
              </div>
              <Segmented label="Thème" value={vm.theme} onChange={vm.changeTheme} options={THEME_OPTIONS} />
            </div>
            <div className="set-row">
              <div>
                <div className="set-row__label">Compte</div>
                <div className="set-row__hint">Connecté{vm.email ? ` : ${vm.email}` : ""}.</div>
              </div>
              <button type="button" className="btn" onClick={vm.forgetDevice}>
                <KeyRound />
                Se déconnecter
              </button>
            </div>
          </div>
        </Card>

        <Card title="Que reste-t-il à fournir ?" subtitle={vm.env ? `${vm.env.todo.length} élément${vm.env.todo.length > 1 ? "s" : ""} manquant${vm.env.todo.length > 1 ? "s" : ""}` : undefined}>
          {!vm.env ? (
            <Skeleton height={160} />
          ) : vm.env.todo.length === 0 ? (
            <EmptyState title="Tout est fourni" />
          ) : (
            <ul className="set-needs">
              {vm.env.todo.map((n) => (
                <li key={n.key}>
                  <div className="set-needs__head">
                    <strong>{n.title}</strong>
                    {n.link && <ExternalLink href={n.link.href}>{n.link.label}</ExternalLink>}
                  </div>
                  <div className="set-needs__unlocks">Débloque : {n.unlocks}</div>
                  <div className="set-needs__where">{n.where}</div>
                </li>
              ))}
              {vm.env.done.length > 0 && <li className="set-needs__done">Déjà fourni : {vm.env.done.map((n) => n.title).join(", ")}</li>}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Quelles apps suit Solis ?" subtitle="Registre unique, partagé par toutes les pages" flush>
        <DataTable columns={appColumns} rows={vm.apps} rowKey={(r) => r.slug} />
      </Card>

      <div className="grid grid--2">
        <Card title="Que veulent dire Brut, HT et Net ?">
          <dl className="set-defs">
            {vm.money.map((d) => (
              <div key={d.term}>
                <dt>{d.term}</dt>
                <dd>{d.text}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card
          title="Quelle TVA est retirée pour passer en HT ?"
          subtitle={`${vm.vat.total} storefronts, ${vm.vat.zero} à 0 %. Taux en vigueur au 1er octobre 2026 (convex/lib/vat.ts).`}
          flush
        >
          <div className="set-vat-pick">
            {vm.vat.pick.map((p) => (
              <span key={p.cc}>
                <span className="set-cc">{p.cc}</span> <span className="num">{p.rate}</span>
              </span>
            ))}
          </div>
          <div className="set-vat-table">
            <DataTable columns={vatColumns} rows={vm.vat.groups} rowKey={(r) => r.key} />
          </div>
        </Card>
      </div>

      <div className="grid grid--2">
        <Card title="Quelles clés sont posées sur Convex ?" subtitle="Présence seulement, jamais la valeur" action={<ExternalLink href={vm.convexEnvUrl}>Convex</ExternalLink>}>
          {!vm.env ? (
            <Skeleton height={220} />
          ) : (
            <div className="set-env">
              {vm.env.groups.map((g) => (
                <div key={g.group} className="set-env__group">
                  <div className="set-env__title">
                    <span>{g.group}</span>
                    <span className="muted num">{g.count}</span>
                  </div>
                  {g.vars.map((x) => (
                    <div key={x.name} className={`set-env__var${x.present ? "" : " set-env__var--missing"}`}>
                      {x.present ? <Check size={13} /> : <Minus size={13} />}
                      <code>{x.name}</code>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Qu'a dit le dernier brief Telegram ?" subtitle="Tous les jours à 06:30 UTC, récap le lundi à 14:30 UTC">
          {!vm.briefs ? (
            <Skeleton height={220} />
          ) : vm.briefs.length === 0 ? (
            <EmptyState title="Aucun brief envoyé pour l'instant">Le premier part demain à 06:30 UTC, ou tout de suite depuis Sources.</EmptyState>
          ) : (
            <div className="set-briefs">
              <div className="set-briefs__head">
                <strong>{vm.briefs[0].title}</strong>
                <Badge status={vm.briefs[0].status.status}>{vm.briefs[0].status.label}</Badge>
              </div>
              {vm.briefs[0].error && <div className="set-briefs__error">{vm.briefs[0].error}</div>}
              <pre className="set-briefs__text">{vm.briefs[0].text}</pre>
              {vm.briefs.length > 1 && (
                <ul className="set-briefs__older">
                  {vm.briefs.slice(1).map((b) => (
                    <li key={b.id}>
                      <span>{b.title}</span>
                      <Badge status={b.status.status}>{b.status.label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
