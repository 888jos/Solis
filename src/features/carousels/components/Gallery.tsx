import { Link } from "react-router-dom";
import { Badge, EmptyState, Segmented } from "@/ui";
import type { useCarouselsViewModel } from "../useCarouselsViewModel";

type GalleryData = NonNullable<ReturnType<typeof useCarouselsViewModel>["gallery"]>;

export function Gallery({
  gallery,
  showFilters,
  statusFilter,
  onStatus,
  account,
  onAccount,
  emptyTitle,
}: {
  gallery: GalleryData;
  showFilters: boolean;
  statusFilter: string;
  onStatus: (s: string) => void;
  account: string;
  onAccount: (a: string) => void;
  emptyTitle: string;
}) {
  return (
    <>
      <div className="cr-filters">
        {showFilters && <Segmented<string> label="Statut" value={statusFilter} onChange={onStatus} options={gallery.filters} />}
        <select className="select" value={account} onChange={(e) => onAccount(e.target.value)} aria-label="Compte">
          <option value="">Tous les comptes</option>
          {gallery.accounts.map((a) => (
            <option key={a} value={a}>
              @{a}
            </option>
          ))}
        </select>
      </div>

      {gallery.tiles.length ? (
        gallery.groups.map((g) => (
        <section key={g.name} className="cr-group">
          {!account && (
            <h3 className="cr-group__title">
              @{g.name} <span className="muted num">{g.tiles.length}</span>
            </h3>
          )}
        <div className="cr-tiles">
          {g.tiles.map((t) => (
            <Link key={t.cid} to={t.href} className="cr-tile">
              <div className="cr-tile__cover">
                {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <span className="muted">Pas d'image</span>}
                <span className="cr-tile__count num">{t.slides}</span>
              </div>
              <div className="cr-tile__body">
                <p className="cr-tile__title">{t.title}</p>
                <p className="cr-tile__meta">{t.meta}</p>
                <div className="cr-tile__foot">
                  <Badge status={t.status.tone} icon={false}>
                    {t.status.label}
                  </Badge>
                  <span className="muted num">{t.created}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        </section>
        ))
      ) : (
        <div className="card">
          <EmptyState title={emptyTitle}>
            {gallery.empty ? "Aucun carrousel synchronisé depuis le Mac pour l'instant (cf sync)." : "Aucun carrousel avec ces filtres."}
          </EmptyState>
        </div>
      )}
      {gallery.more > 0 && <p className="muted">Et {gallery.more} de plus : affine avec les filtres.</p>}
    </>
  );
}
