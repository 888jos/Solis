import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "@/app/AuthGate";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { applyStoredTheme } from "@/features/settings/theme";
import { PAGES } from "@/app/routes";
import { Shell } from "@/app/Shell";
import { FiltersProvider } from "@/lib/filters";
import { captureTokenFromUrl } from "@/lib/session";
import "@/ui/tokens.css";
import "@/ui/base.css";

captureTokenFromUrl();
applyStoredTheme();
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ErrorBoundary fullPage>
        <AuthGate>
          <BrowserRouter>
            <FiltersProvider>
              <Routes>
                <Route element={<Shell />}>
                  {PAGES.map((p) => (
                    <Route key={p.id} path={p.path} element={<p.Component />} />
                  ))}
                  <Route path="*" element={<p className="muted">Page introuvable.</p>} />
                </Route>
              </Routes>
            </FiltersProvider>
          </BrowserRouter>
        </AuthGate>
      </ErrorBoundary>
    </ConvexProvider>
  </StrictMode>,
);
