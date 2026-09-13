# Convex connection

DriftOS is connected to the Convex project **Solis**. Convex currently provides
the live health query shown on the Integrations page. Existing workspace,
creator, campaign, social, and revenue data remain in Cloudflare D1; no data was
migrated or copied.

## Local development

1. Install dependencies with `npm install`.
2. Run `npx convex dev --once` and select the existing `Solis` project if asked.
3. Set `VITE_CONVEX_URL` in the ignored `.env.local` to the development
   deployment URL ending in `.convex.cloud` (the Convex CLI may also write a
   `NEXT_PUBLIC_CONVEX_URL` for its framework detection).
4. Run `npm run dev`.

The browser client only receives the public deployment URL. Never put a Convex
admin key or deploy key in a `VITE_` variable.

## Production

Deploy Convex functions to the production deployment with
`npx convex deploy --typecheck enable`, then build DriftOS with that production
deployment's URL and publish the Worker:

```sh
VITE_CONVEX_URL=https://<production-deployment>.convex.cloud DRIFTOS_CLOUDFLARE_DEPLOY=1 npm run build
npx wrangler deploy
```

The application root wraps the UI in `ConvexProvider` when `VITE_CONVEX_URL` is
configured. Add future Convex queries/mutations incrementally; D1 remains the
source of truth until a deliberate, tested migration is implemented.
