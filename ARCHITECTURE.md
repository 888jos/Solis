# Solis — architecture

Solis is Drift Studio's private cockpit: revenue (gross / ex-VAT / net), spending, margin, growth and
product health for every app (CortiFree, Cocorise, Quest IRL). Single user (Jos). French UI.

**Every number comes from a real API or a real import. No demo data, no hardcoded metrics, no
"estimated" values presented as real.** When a source is not connected, the UI says so
(`<NotConnected>`), it never invents numbers.

## Stack

| Layer | Tech |
|---|---|
| Hosting | Cloudflare Worker `solis` serving the static SPA (`wrangler.jsonc`, `dist/`) |
| Frontend | Vite + React 19 + TypeScript + react-router 7, no UI framework, hand-written design system |
| Backend | Convex project `solis` (team driftstudio). Dev deployment `giddy-bullfrog-898` |
| Auth | Email + password (Convex Auth, `convex/auth.ts`), only the addresses in `SOLIS_ALLOWED_EMAILS` (default: Jos's two). Password stored as a hash in `SOLIS_PASSWORD_HASH` (`scripts/hash-password.mjs`). Every public Convex function uses `authQuery` / `authMutation` / `authAction` from `convex/lib/auth.ts`. Never export a raw `query`/`mutation`/`action`. Prod: https://solis.jossel1-biot.workers.dev |

## MVVM, per feature

Each sidebar page is one feature module, isolated from the others:

```
src/features/<feature>/
  index.tsx                 View: default export, layout only, no data logic
  use<Feature>ViewModel.ts  ViewModel: reads filters + Convex queries, derives everything the view shows
  components/*.tsx          View pieces specific to this feature (optional)
  <feature>.css             Styles scoped under a root class like .f-revenue (optional, prefer ui/ classes)
convex/<feature>.ts         Model: authQuery/authMutation functions for this feature (+ internal helpers)
convex/sources/<source>.ts  Model: "use node" sync actions calling external APIs
convex/schema/<domain>.ts   Model: tables of that domain
```

Rules:
- **View** renders only. No `useQuery`, no arithmetic beyond formatting. It gets one object from its ViewModel.
- **ViewModel** is a hook: `useRevenueViewModel()` reads `usePeriod()` / `useAppFilter()` (src/lib/filters.tsx),
  calls `useSolisQuery(api.revenue.summary, {...})` (src/lib/convex.ts, injects the token), and returns
  ready-to-render data: formatted series for charts, KPI values + deltas vs previous period, loading flags.
- **Model** (Convex) does heavy aggregation server-side (sum by day/app/country), returns compact results.
  Query results must stay small (aggregate in the query, never ship raw rows to the client).
- Shared building blocks live in `src/ui` (design system) and `src/lib` (formatting, filters, apps, session).
  Do not fork them inside a feature. If a shared component truly lacks something, add an optional prop
  in a backwards-compatible way and mention it in your report.

## Design system (src/ui)

Tokens in `src/ui/tokens.css` (light + dark), classes in `src/ui/base.css`, components in `src/ui/components.tsx`
and charts in `src/ui/charts/`:
- `PageHeader`, `Card`, `Kpi` (+ `Delta`, `KpiSkeleton`), `Segmented`, `AppLabel`, `AppPicker`, `Badge`,
  `EmptyState`, `NotConnected`, `Skeleton`, `SourceNote`, `DataTable`.
- Charts: `TimeChart` (line / area / stacked bar / grouped bar with crosshair tooltip and legend),
  `Sparkline`, `BarList` (ranked horizontal bars), `Legend`.
- Layout classes: `.grid.grid--kpi`, `.grid--2`, `.grid--3`, `.grid--main-side`, `.stack`, `.row`, `.muted`, `.num`.
- Colors: apps always use `appColor(slug)` (CortiFree blue, Cocorise orange, Quest IRL aqua). Other series use
  `var(--series-4..8)` in order. Status colors (`--good`, `--warning`, `--critical`) only through `Badge`/`Delta`.
- Text never takes a series color. One y-axis per chart. No dual axes, no pie charts, no 3D, no gradients.
- Formatting: `src/lib/format.ts` only (`formatEur`, `formatInt`, `formatPct`, `formatDay`, `formatMonth`...).
- The page must look right at 375 px wide (phone) and in dark mode.

Look and feel: calm, dense, precise, like Linear / Stripe dashboards. Hairline borders, no drop shadows on cards,
generous but consistent spacing (4/8/12/16/20/24), 14 px base text, numbers in tabular figures. One clear headline
row of KPIs, then the charts that explain them, then the detail table. Every card answers one question in its title.

## Money definitions (used everywhere)

- **Brut (TTC)**: what customers paid, VAT/sales tax included (Apple customer price × units).
- **HT**: brut without VAT (country VAT table `convex/lib/vat.ts`; US/CA prices are already tax-exclusive).
- **Net**: Apple developer proceeds (after VAT and Apple's 15% Small Business commission). This is what reaches the bank.
- All stored in EUR on the day of the sale (`fxRates`); originals kept alongside.
- **Dépenses**: table `expenses`, positive amounts in EUR. **Marge** = Net − Dépenses.

## Data sources

| Source | Env vars (Convex) | Status |
|---|---|---|
| App Store Connect API (sales, subscriptions, reviews, versions, builds, ASO metadata) | ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_B64, ASC_VENDOR_NUMBER | connected, all 3 apps |
| RevenueCat v2 | REVENUECAT_CORTIFREE_SECRET_KEY, REVENUECAT_CORTIFREE_PROJECT_ID | CortiFree only |
| Amplitude | AMPLITUDE_CORTIFREE_API_KEY, AMPLITUDE_CORTIFREE_SECRET_KEY, AMPLITUDE_API_BASE_URL | CortiFree |
| PostHog | POSTHOG_QUESTIRL_HOST, POSTHOG_QUESTIRL_PROJECT_ID, POSTHOG_QUESTIRL_PERSONAL_KEY | Quest IRL |
| iTunes Search / Lookup (public) | none | ratings per country, top-10 strength for keyword difficulty, rank fallback |
| App Store search + suggestions (public, MZStore / MZSearchHints, storefront header) | none | ASO: real search order (~250) per keyword per day, estimated popularity every 14 days |
| Astro (Mac app) | none (scripts/astro_sync.py, Mac sync token) | one-off import of history before 2026-11-11; Solis does not depend on it |
| FX rates (public, cdn.jsdelivr.net/npm/@fawazahmed0/currency-api) | none | daily EUR rates |
| Bank CSV import, manual entries | none | through the Dépenses page |
| OpenAI / Anthropic admin cost APIs | OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY | not provided yet → NotConnected |
| Airtable UGC base appDXNkfK2prnjyud | AIRTABLE_TOKEN | not provided yet; snapshot import via mutation |
| Telegram brief | TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | daily brief, hourly source watchdog, daily anomalies |
| Stripe (Otto) | STRIPE_OTTO_KEY (restricted, balance transactions read) | not provided yet; Otto revenue falls back to the Mac push (collected, fees not deducted) |
| Meta Ads (CortiFree) | META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, optional META_GRAPH_VERSION, META_APP_SLUG | not provided yet → NotConnected on Acquisition |
| Claude weekly review | ANTHROPIC_API_KEY (regular key, model claude-opus-5-5) | not provided yet → skipped |

## Pilotage (page Aujourd'hui, convex/pilot.ts)

- Goals (table `goals`), experiments (`experiments`), annotations (`annotations`): values are never stored, they are
  computed at read time by `metricValue(project, metric, from, to)` from the real tables. Add a metric there and in `METRICS`.
- Actions of the day: open alerts, versions to publish/rejected, unanswered ≤3★ reviews, Otto videos to validate,
  experiments past their end, goals behind pace, bank statement older than 35 days.
- `convex/watchdog.ts`: hourly source alerts (one message when it breaks, one when it is back) and daily anomalies
  (last data day vs the same weekday of the 4 previous weeks, ±50 %), both through the `alerts` table.
- `convex/review.ts`: Monday review written by Claude from `pilot.weeklyFacts` (aggregates only).
- Otto is a project, not an App Store app: `OTHER_PROJECTS` in src/lib/apps.ts, `ottoWindow` in convex/otto.ts.

`convex/sources/asc.ts` is the shared App Store Connect client (JWT, paging, Sales report download + TSV parse).
Syncs: an `internalAction` in `convex/sources/<x>.ts` ("use node"), writing through `internalMutation`s in a
non-node file, wrapped in `internal.syncRuns.start/finish`. Each source exposes `syncRecent` (no args, cheap,
for the cron) and, if relevant, `backfill`. Crons are registered in `convex/crons.ts`.

## Working on it

- `npx convex dev --once` pushes the whole `convex/` folder to the dev deployment (shared by everyone working
  in parallel: keep your files compiling at all times, write files whole, retry if a push fails because of
  someone else's file).
- Run an internal action: `npx convex run sources/revenue:backfill '{}'`.
- Frontend dev server: http://localhost:5199 (already running). Sign in with email + password.
- Typecheck: `npx tsc -p .` (frontend + convex types).
