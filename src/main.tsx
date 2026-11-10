import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "@/app/AuthGate";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { applyStoredTheme } from "@/features/settings/theme";
import { PAGES, REDIRECTS } from "@/app/routes";
import { Shell } from "@/app/Shell";
import { FiltersProvider } from "@/lib/filters";
import { ModelsStandalone } from "@/features/carousels/ModelsStandalone";
import "@/ui/tokens.css";
import "@/ui/base.css";

applyStoredTheme();
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const standaloneModels = import.meta.env.DEV && window.location.pathname === "/modeles";

createRoot(document.getElementById("root")!).render(
  standaloneModels ? (
    <StrictMode>
      <ModelsStandalone />
    </StrictMode>
  ) : (
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <ErrorBoundary fullPage>
        <AuthGate>
          <BrowserRouter>
            <FiltersProvider>
              <Routes>
                <Route element={<Shell />}>
                  {PAGES.map((p) => (
                    <Route key={p.id} path={p.path} element={<p.Component />} />
                  ))}
                  {Object.entries(REDIRECTS).map(([from, to]) => (
                    <Route key={from} path={from} element={<Navigate to={to} replace />} />
                  ))}
                  <Route path="*" element={<p className="muted">Page introuvable.</p>} />
                </Route>
              </Routes>
            </FiltersProvider>
          </BrowserRouter>
        </AuthGate>
      </ErrorBoundary>
    </ConvexAuthProvider>
  </StrictMode>
  ),
);
