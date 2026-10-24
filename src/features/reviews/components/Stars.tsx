import { Star } from "lucide-react";

/** Five stars, the first `value` filled. Decorative: the number is always shown next to it. */
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="rv-stars" aria-label={`${value} sur 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} strokeWidth={1.8} className={i <= full ? "rv-star rv-star--on" : "rv-star"} />
      ))}
    </span>
  );
}
