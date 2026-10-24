import { APPS, appBySlug, type AppSlug, type StudioApp } from "@convex/lib/apps";

export { APPS, appBySlug, type AppSlug, type StudioApp };

/** CSS color for an app (follows the entity, never its rank). */
export function appColor(slug: string): string {
  const app = appBySlug(slug);
  return app ? `var(--series-${app.colorSlot})` : "var(--series-other)";
}

export function appName(slug: string | null | undefined): string {
  if (!slug) return "Studio";
  return appBySlug(slug)?.name ?? slug;
}
