import { api } from "@convex/_generated/api";
import { ChevronRight, Compass, LayoutDashboard, Menu, MessageCircleHeart, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSolisQuery } from "@/lib/convex";
import { PERIODS, useFilters } from "@/lib/filters";
import { AppIcon, AppPicker, Segmented, Skeleton } from "@/ui";
import { ErrorBoundary } from "./ErrorBoundary";
import { PAGES, SECTIONS, tabsFor, type BadgeKey, type PageDef } from "./routes";

/** Pages where the global period/app filters don't apply hide them. */
const NO_FILTERS = new Set(["/", "/sources", "/reglages", "/versions", "/carrousels", "/videos", "/projets/otto"]);

/** Badge tone: red for things broken, neutral for things waiting. */
const BADGE_TONE: Record<BadgeKey, "alert" | "count"> = { today: "count", videos: "count", reviews: "count", versions: "alert", sources: "alert" };

function NavItem({ page, search, badges }: { page: PageDef; search: string; badges: Record<BadgeKey, number> | undefined }) {
  const n = page.badge && badges ? badges[page.badge] : 0;
  return (
    <NavLink to={{ pathname: page.path, search }} end className="nav-item">
      {/^\/(apps|projets)\//.test(page.path) ? <AppIcon slug={page.path.split("/")[2]} size={24} /> : <page.icon />}
      <span className="nav-item__label">{page.label}</span>
      {n > 0 && (
        <span className={`nav-badge nav-badge--${BADGE_TONE[page.badge!]}`} aria-label={`${n} en attente`}>
          {n > 99 ? "99+" : n}
        </span>
      )}
    </NavLink>
  );
}

export function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { period, setPeriod, app, setApp } = useFilters();
  // Only the global filters (period, app) follow you from page to page; page-specific params
  // (tabs, views, categories) stay on their own page.
  const search = globalSearch(location.search);
  const current = PAGES.find((p) => p.path === location.pathname);
  const showFilters = !NO_FILTERS.has(location.pathname);
  const tabs = tabsFor(current);
  const badges = useSolisQuery(api.pilot.navBadges, {});
  const pausedActive = PAGES.some((p) => p.paused && p.path === location.pathname);
  const [pausedOpen, setPausedOpen] = useState(pausedActive);

  useEffect(() => setNavOpen(false), [location.pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);
  useEffect(() => {
    document.title = current ? `${current.label} · Solis` : "Solis";
  }, [current]);

  return (
    <div className="shell" data-nav-open={navOpen}>
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar__brand">
          <img src="/icon.svg" alt="" />
          <div>
            Solis
            <small>Drift Studio</small>
          </div>
          <button className="btn btn--ghost topbar__menu" style={{ marginLeft: "auto" }} onClick={() => setNavOpen(false)} aria-label="Fermer le menu">
            <X />
          </button>
        </div>
        {SECTIONS.map((section) => {
          const pages = PAGES.filter((p) => p.section === section && !p.tabOf);
          const active = pages.filter((p) => !p.paused);
          const paused = pages.filter((p) => p.paused);
          return (
            <nav key={section || "top"}>
              {section && <div className="nav-section__label">{section}</div>}
              {active.map((p) => (
                <NavItem key={p.id} page={p} search={search} badges={badges} />
              ))}
              {paused.length > 0 && (
                <>
                  <button type="button" className="nav-item nav-item--toggle" aria-expanded={pausedOpen || pausedActive} onClick={() => setPausedOpen((o) => !o)}>
                    <ChevronRight className={pausedOpen || pausedActive ? "nav-chevron nav-chevron--open" : "nav-chevron"} />
                    <span className="nav-item__label">En pause ({paused.length})</span>
                  </button>
                  {(pausedOpen || pausedActive) && paused.map((p) => <NavItem key={p.id} page={p} search={search} badges={badges} />)}
                </>
              )}
            </nav>
          );
        })}
        <div className="sidebar__footer">Données réelles · App Store Connect, RevenueCat, Amplitude, PostHog</div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main panel-grain">
        <div className={`topbar${showFilters ? "" : " topbar--bare"}`}>
          <button className="btn btn--ghost topbar__menu" onClick={() => setNavOpen(true)} aria-label="Ouvrir le menu">
            <Menu />
          </button>
          <strong className="topbar__menu" style={{ alignItems: "center" }}>
            {current?.label}
          </strong>
          {tabs && (
            <nav className="page-tabs" aria-label="Vues">
              {tabs.map((t) => (
                <NavLink key={t.id} to={{ pathname: t.path, search }} end className="page-tab">
                  {t.tabLabel ?? t.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="topbar__spacer" />
          {showFilters && (
            <div className="topbar__filters">
              <AppPicker value={app} onChange={setApp} />
              <Segmented label="Période" value={period.key} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.key, label: p.short }))} />
            </div>
          )}
        </div>
        <main className="content">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<Skeleton height={320} />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <nav className="mobile-bar" aria-label="Navigation rapide">
        <NavLink to={{ pathname: "/", search }} end className="mobile-bar__item">
          <Compass />
          Aujourd'hui
          {badges && badges.today > 0 && <span className="nav-badge nav-badge--count">{badges.today}</span>}
        </NavLink>
        <NavLink to={{ pathname: "/vue-d-ensemble", search }} end className="mobile-bar__item">
          <LayoutDashboard />
          Ensemble
        </NavLink>
        <NavLink to={{ pathname: "/projets/otto", search }} end className="mobile-bar__item">
          <MessageCircleHeart />
          Otto
        </NavLink>
        <button type="button" className="mobile-bar__item" onClick={() => setNavOpen(true)}>
          <Menu />
          Menu
        </button>
      </nav>
    </div>
  );
}

const GLOBAL_PARAMS = ["p", "app"];

function globalSearch(search: string): string {
  const from = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of GLOBAL_PARAMS) {
    const value = from.get(key);
    if (value) kept.set(key, value);
  }
  const s = kept.toString();
  return s ? `?${s}` : "";
}
