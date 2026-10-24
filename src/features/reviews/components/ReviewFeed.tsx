import { MessageSquareReply } from "lucide-react";
import { AppLabel, Badge, EmptyState, Segmented, Skeleton } from "@/ui";
import type { ReviewsViewModel, StarsFilter } from "../useReviewsViewModel";
import { Stars } from "./Stars";

const STAR_OPTIONS: { value: StarsFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "low", label: "1-2★" },
  { value: "mid", label: "3★" },
  { value: "high", label: "4-5★" },
];

export function FeedFilters({ vm }: { vm: ReviewsViewModel }) {
  return (
    <div className="row rv-filters">
      <Segmented<StarsFilter> label="Notes" value={vm.filters.stars} onChange={vm.filters.setStars} options={STAR_OPTIONS} />
      <Segmented<string>
        label="Réponse"
        value={vm.filters.unanswered ? "todo" : "all"}
        onChange={(v) => vm.filters.setUnanswered(v === "todo")}
        options={[
          { value: "all", label: "Tous" },
          { value: "todo", label: "Sans réponse" },
        ]}
      />
    </div>
  );
}

export function ReviewFeed({ vm }: { vm: ReviewsViewModel }) {
  const feed = vm.feed;
  if (vm.feedLoading || !feed) return <div style={{ padding: "var(--space-5)" }}><Skeleton height={160} /></div>;
  if (!feed.rows.length) {
    return (
      <EmptyState title={feed.inPeriod ? "Aucun avis ne correspond aux filtres" : "Aucun avis sur la période"}>
        {feed.inPeriod ? `${feed.inPeriod} avis sur la période, aucun avec ces filtres.` : "Choisis « Tout » dans la période pour voir l'historique complet."}
      </EmptyState>
    );
  }
  return (
    <div>
      <ul className="rv-feed">
        {feed.rows.map((r) => (
          <li key={r.id} className="rv-item">
            <div className="rv-item__head">
              <Stars value={r.rating} />
              <span className="rv-item__rating num">{r.rating}</span>
              {r.title && <strong className="rv-item__title">{r.title}</strong>}
              <span className="rv-item__badge">
                {r.hasResponse ? (
                  <Badge status="good">Répondu</Badge>
                ) : (
                  <Badge icon={false}>
                    <MessageSquareReply size={12} />
                    Sans réponse
                  </Badge>
                )}
              </span>
            </div>
            {r.body && <p className="rv-item__body">{r.body}</p>}
            <div className="rv-item__meta">
              <AppLabel slug={r.appSlug} />
              <span>·</span>
              <span title={r.countryName}>{r.countryName}</span>
              <span>·</span>
              <span title={r.dateLong}>{r.date}</span>
              {r.nickname && (
                <>
                  <span>·</span>
                  <span className="rv-item__nick">{r.nickname}</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {feed.hasMore && (
        <div className="rv-more">
          <button type="button" className="btn" onClick={vm.filters.showMore}>
            Afficher plus ({feed.matched - feed.rows.length} restants)
          </button>
        </div>
      )}
    </div>
  );
}
