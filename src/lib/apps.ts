import { APPS, appBySlug, type AppSlug, type StudioApp } from "@convex/lib/apps";

export { APPS, appBySlug, type AppSlug, type StudioApp };

/** Projects that are not App Store apps (no Apple data), shown next to the apps on studio-wide pages. */
export const OTHER_PROJECTS: Record<string, { name: string; color: string; path: string }> = {
  otto: { name: "Otto", color: "var(--series-4)", path: "/projets/otto" },
};

/** CSS color for an app (follows the entity, never its rank). */
export function appColor(slug: string): string {
  const app = appBySlug(slug);
  if (app) return `var(--series-${app.colorSlot})`;
  return OTHER_PROJECTS[slug]?.color ?? "var(--series-other)";
}

export function appName(slug: string | null | undefined): string {
  if (!slug) return "Studio";
  return appBySlug(slug)?.name ?? OTHER_PROJECTS[slug]?.name ?? slug;
}
