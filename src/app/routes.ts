import { Activity, AppWindow, Compass, Clapperboard, Download, Euro, Film, GalleryHorizontalEnd, Globe2, LayoutDashboard, MessageCircleHeart, Plug, Receipt, Repeat, Rocket, Scale, Search, Settings, Star, type LucideIcon } from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// The sidebar and the router both read this list. One entry per feature module in src/features/.
// Sidebar order = order of this list; sections are grouped by first appearance ("" = no title).
export type BadgeKey = "today" | "videos" | "reviews" | "versions" | "sources";

export type PageDef = {
  id: string;
  path: string;
  label: string;
  section: string;
  icon: LucideIcon;
  Component: LazyExoticComponent<ComponentType>;
  /** Pages shown as tabs of another page (same section), not in the sidebar. */
  tabOf?: string;
  /** Short label of the page in its tab strip. */
  tabLabel?: string;
  /** Live counter shown next to the entry (convex pilot.navBadges). */
  badge?: BadgeKey;
  /** Paused project: listed in the collapsed "En pause" group. */
  paused?: boolean;
};

export const PAGES: PageDef[] = [
  { id: "today", path: "/", label: "Aujourd'hui", section: "", icon: Compass, badge: "today", Component: lazy(() => import("@/features/today")) },
  { id: "overview", path: "/vue-d-ensemble", label: "Vue d'ensemble", section: "", icon: LayoutDashboard, Component: lazy(() => import("@/features/overview")) },

  { id: "revenue", path: "/revenus", label: "Revenus", tabLabel: "Revenus", section: "Argent", icon: Euro, Component: lazy(() => import("@/features/revenue")) },
  { id: "subscriptions", path: "/abonnements", label: "Abonnements", tabLabel: "Abonnements", tabOf: "revenue", section: "Argent", icon: Repeat, Component: lazy(() => import("@/features/subscriptions")) },
  { id: "geo", path: "/pays", label: "Pays", tabLabel: "Pays", tabOf: "revenue", section: "Argent", icon: Globe2, Component: lazy(() => import("@/features/geo")) },
  { id: "expenses", path: "/depenses", label: "Dépenses", section: "Argent", icon: Receipt, Component: lazy(() => import("@/features/expenses")) },
  { id: "profitability", path: "/rentabilite", label: "Rentabilité", section: "Argent", icon: Scale, Component: lazy(() => import("@/features/profitability")) },

  { id: "acquisition", path: "/acquisition", label: "Acquisition", section: "Croissance", icon: Download, Component: lazy(() => import("@/features/acquisition")) },
  { id: "aso", path: "/aso", label: "ASO", section: "Croissance", icon: Search, Component: lazy(() => import("@/features/aso")) },

  { id: "videos", path: "/videos", label: "Vidéos", section: "Marketing", icon: Film, Component: lazy(() => import("@/features/videos")) },
  { id: "carousels", path: "/carrousels", label: "Carrousels", section: "Marketing", icon: GalleryHorizontalEnd, Component: lazy(() => import("@/features/carousels")) },
  { id: "ugc", path: "/ugc", label: "Créateurs UGC", section: "Marketing", icon: Clapperboard, Component: lazy(() => import("@/features/ugc")) },

  { id: "engagement", path: "/engagement", label: "Engagement", section: "Produit", icon: Activity, Component: lazy(() => import("@/features/engagement")) },
  { id: "reviews", path: "/avis", label: "Avis & notes", section: "Produit", icon: Star, badge: "reviews", Component: lazy(() => import("@/features/reviews")) },
  { id: "versions", path: "/versions", label: "Versions", section: "Produit", icon: Rocket, badge: "versions", Component: lazy(() => import("@/features/versions")) },

  // Projects: App Store apps and Otto (a website). Paused ones fold into "En pause".
  { id: "project-otto", path: "/projets/otto", label: "Otto", section: "Projets", icon: MessageCircleHeart, badge: "videos", Component: lazy(() => import("@/features/project-otto")) },
  { id: "app-cortifree", path: "/apps/cortifree", label: "CortiFree", section: "Projets", icon: AppWindow, Component: lazy(() => import("@/features/app-cortifree")) },
  { id: "app-cocorise", path: "/apps/cocorise", label: "Cocorise", section: "Projets", icon: AppWindow, Component: lazy(() => import("@/features/app-cocorise")) },
  { id: "app-questirl", path: "/apps/questirl", label: "Quest IRL", section: "Projets", icon: AppWindow, paused: true, Component: lazy(() => import("@/features/app-questirl")) },

  { id: "sources", path: "/sources", label: "Sources", section: "Système", icon: Plug, badge: "sources", Component: lazy(() => import("@/features/sources")) },
  { id: "settings", path: "/reglages", label: "Réglages", section: "Système", icon: Settings, Component: lazy(() => import("@/features/settings")) },
];

export const SECTIONS = [...new Set(PAGES.map((p) => p.section))];

/** Old addresses kept working (bookmarks, Telegram links). */
export const REDIRECTS: Record<string, string> = { "/aujourdhui": "/" };

/** The pages of a tab strip (the parent and its tabs), or null when the page has none. */
export function tabsFor(page: PageDef | undefined): PageDef[] | null {
  if (!page) return null;
  const parentId = page.tabOf ?? page.id;
  const group = PAGES.filter((p) => p.id === parentId || p.tabOf === parentId);
  return group.length > 1 ? group : null;
}
