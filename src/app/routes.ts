import { Activity, Clapperboard, Download, Euro, Globe2, LayoutDashboard, Plug, Receipt, Repeat, Rocket, Scale, Search, Settings, Star, type LucideIcon } from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// The sidebar and the router both read this list. One entry per feature module in src/features/.
export type PageDef = {
  id: string;
  path: string;
  label: string;
  section: string;
  icon: LucideIcon;
  Component: LazyExoticComponent<ComponentType>;
};

export const PAGES: PageDef[] = [
  { id: "overview", path: "/", label: "Vue d'ensemble", section: "Pilotage", icon: LayoutDashboard, Component: lazy(() => import("@/features/overview")) },
  { id: "profitability", path: "/rentabilite", label: "Rentabilité", section: "Pilotage", icon: Scale, Component: lazy(() => import("@/features/profitability")) },
  { id: "revenue", path: "/revenus", label: "Revenus", section: "Revenus", icon: Euro, Component: lazy(() => import("@/features/revenue")) },
  { id: "subscriptions", path: "/abonnements", label: "Abonnements", section: "Revenus", icon: Repeat, Component: lazy(() => import("@/features/subscriptions")) },
  { id: "geo", path: "/pays", label: "Pays", section: "Revenus", icon: Globe2, Component: lazy(() => import("@/features/geo")) },
  { id: "expenses", path: "/depenses", label: "Dépenses", section: "Dépenses", icon: Receipt, Component: lazy(() => import("@/features/expenses")) },
  { id: "acquisition", path: "/acquisition", label: "Acquisition", section: "Croissance", icon: Download, Component: lazy(() => import("@/features/acquisition")) },
  { id: "ugc", path: "/ugc", label: "Créateurs UGC", section: "Croissance", icon: Clapperboard, Component: lazy(() => import("@/features/ugc")) },
  { id: "aso", path: "/aso", label: "ASO", section: "Croissance", icon: Search, Component: lazy(() => import("@/features/aso")) },
  { id: "engagement", path: "/engagement", label: "Engagement", section: "Produit", icon: Activity, Component: lazy(() => import("@/features/engagement")) },
  { id: "reviews", path: "/avis", label: "Avis & notes", section: "Produit", icon: Star, Component: lazy(() => import("@/features/reviews")) },
  { id: "versions", path: "/versions", label: "Versions", section: "Produit", icon: Rocket, Component: lazy(() => import("@/features/versions")) },
  { id: "sources", path: "/sources", label: "Sources", section: "Système", icon: Plug, Component: lazy(() => import("@/features/sources")) },
  { id: "settings", path: "/reglages", label: "Réglages", section: "Système", icon: Settings, Component: lazy(() => import("@/features/settings")) },
];

export const SECTIONS = [...new Set(PAGES.map((p) => p.section))];
