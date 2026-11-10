import { Menu, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { appColor } from "@/lib/apps";
import { PERIODS, useFilters } from "@/lib/filters";
import { AppPicker, Segmented, Skeleton } from "@/ui";
import { ErrorBoundary } from "./ErrorBoundary";
import { PAGES, SECTIONS } from "./routes";

/** Pages where the global period/app filters don't apply hide them. */
const NO_FILTERS = new Set(["/sources", "/reglages", "/versions", "/carrousels", "/videos", "/projets/otto", "/aujourdhui"]);

export function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { period, setPeriod, app, setApp } = useFilters();
  // Only the global filters (period, app) follow you from page to page; page-specific params
  // (tabs, views, categories) stay on their own page.
  const search = globalSearch(location.search);
  const current = PAGES.find((p) => p.path === location.pathname);
  const showFilters = !NO_FILTERS.has(location.pathname);

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
        {SECTIONS.map((section) => (
          <nav key={section}>
            <div className="nav-section__label">{section}</div>
            {PAGES.filter((p) => p.section === section).map((p) => (
              <NavLink key={p.id} to={{ pathname: p.path, search }} end className="nav-item">
                {p.path.startsWith("/apps/") ? <span className="nav-item__dot" style={{ background: appColor(p.path.split("/")[2]) }} aria-hidden /> : <p.icon />}
                {p.label}
              </NavLink>
            ))}
          </nav>
        ))}
        <div className="sidebar__footer">Données réelles · App Store Connect, RevenueCat, Amplitude, PostHog</div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <div className={`topbar${showFilters ? "" : " topbar--bare"}`}>
          <button className="btn btn--ghost topbar__menu" onClick={() => setNavOpen(true)} aria-label="Ouvrir le menu">
            <Menu />
          </button>
          <strong className="topbar__menu" style={{ alignItems: "center" }}>
            {current?.label}
          </strong>
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
