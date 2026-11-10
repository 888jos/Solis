// Dev-only page (dev-preview.html, never built): the real Shell and UI components with made-up numbers,
// to check the look without signing in. The sidebar links lead to real pages, which need Convex auth.
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { CreditCard, Download, Hourglass, Receipt, Scale, Wallet } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "@/app/Shell";
import { applyStoredTheme } from "@/features/settings/theme";
import { FiltersProvider } from "@/lib/filters";
import { AppLabel, BarList, Card, Kpi, PageHeader, Sparkline } from "@/ui";
import { Globe } from "@/ui/charts/Globe";
import "@/ui/tokens.css";
import "@/ui/base.css";
import "@/features/overview/overview.css";
import "@/features/geo/geo.css";

applyStoredTheme();

const walk = (n: number, start: number, drift: number, noise: number, seed: number) => {
  let v = start;
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    v = Math.max(0, v + drift + (s / 233280 - 0.5) * noise);
    return v;
  });
};
const eur = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const COUNTRIES: [string, string, number][] = [
  ["US", "🇺🇸 États-Unis", 1248.4], ["FR", "🇫🇷 France", 402.91], ["GB", "🇬🇧 Royaume-Uni", 338.89], ["CA", "🇨🇦 Canada", 286.95],
  ["AU", "🇦🇺 Australie", 254.94], ["DE", "🇩🇪 Allemagne", 222.95], ["BR", "🇧🇷 Brésil", 150.2], ["JP", "🇯🇵 Japon", 131.7],
];
const bars = COUNTRIES.map(([key, label, value]) => ({ key, label, value }));

function Preview() {
  return (
    <div className="f-overview">
      <PageHeader title="Vue d'ensemble" subtitle="Aperçu du thème · chiffres fictifs" />
      <div className="ov-kpis">
        <Kpi big label={<><Wallet size={14} />Net versé</>} value="3 548 €" delta={0.084} foot="vs 30 j avant" spark={<Sparkline values={walk(30, 20, 0.5, 9, 3)} color="var(--glow-good)" height={64} />} />
        <Kpi big label={<><Receipt size={14} />Dépenses</>} value="1 204 €" delta={0.14} invertDelta foot="vs 30 j avant" spark={<Sparkline values={walk(30, 20, 0.3, 6, 5)} color="var(--glow-bad)" height={64} />} />
        <Kpi label={<><Scale size={14} />Marge</>} value="2 344 €" delta={0.05} spark={<Sparkline values={walk(30, 10, 0.4, 7, 8)} color="var(--glow-good)" height={40} />} />
        <Kpi label={<><CreditCard size={14} />Abonnés actifs</>} value="118" foot="+9" spark={<Sparkline values={walk(34, 20, 0.5, 8, 11)} color="var(--glow-violet)" height={40} />} />
        <Kpi label={<><Hourglass size={14} />Essais en cours</>} value="22" foot="conversion 41 %" spark={<Sparkline values={[5, 5, 6, 6, 6, 7, 7, 7, 7, 8]} color="var(--glow-violet)" height={40} />} />
        <Kpi label={<><Download size={14} />Téléchargements</>} value="1 893" delta={-0.03} spark={<Sparkline values={walk(30, 30, -0.1, 9, 13)} color="var(--glow-violet)" height={40} />} />
      </div>
      <div className="f-geo">
        <div className="geo-hero">
          <div className="geo-hero__globe">
            <Globe points={bars.map((b) => ({ code: b.key, value: b.value }))} />
          </div>
          <Card title="Où se fait le net ?" subtitle="Remboursements déduits" action={<span className="geo-total num">3 548,00 €</span>}>
            <BarList items={bars} formatValue={eur} />
          </Card>
        </div>
        <div className="grid grid--2">
          <Card title="Où sont les abonnés payants ?" subtitle="Dernier rapport Subscription">
            <BarList items={bars.slice(0, 5).map((b) => ({ ...b, value: Math.round(b.value / 6), color: "var(--glow-violet)" }))} formatValue={(v) => String(v)} />
          </Card>
          <Card title={<AppLabel slug="cortifree" />} subtitle="Top 5 pays par net">
            <BarList items={bars.slice(0, 5).map((b) => ({ ...b, color: "var(--series-1)" }))} formatValue={eur} />
          </Card>
        </div>
      </div>
    </div>
  );
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <FiltersProvider>
          <Routes>
            <Route element={<Shell />}>
              <Route path="*" element={<Preview />} />
            </Route>
          </Routes>
        </FiltersProvider>
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);
