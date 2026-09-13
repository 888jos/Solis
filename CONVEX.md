# Convex database

DriftOS uses the Convex project **Solis** as its production database. The
legacy D1 tables were exported, imported to Convex with their original IDs, and
checked against the source row counts before the production Worker was switched
over. The compatibility adapter in `db/index.ts` keeps existing server routes
working while the app moves to native Convex functions incrementally.

The migration snapshot contained 400 rows across 20 tables, including 133
creator videos, 94 daily app metrics, 59 sync jobs, 56 backend events, 36
sessions, and 6 social accounts. Convex's internal `migration:counts` query can
be used to audit those counts. The initial schema is intentionally permissive
to preserve legacy records; replace `v.any()` validators with field-level
validators as individual domains are migrated to native functions.

## Local development

1. Install dependencies with `npm install`.
2. Run `npx convex dev --once` against the existing **Solis** project.
3. Set `VITE_CONVEX_URL` to the development deployment URL in ignored
   `.env.local` and `CONVEX_URL` plus `CONVEX_DEPLOY_KEY` in ignored
   `.dev.vars`. The deploy key is server-only and must never use a `VITE_`
   prefix.
4. Run `npm run dev`.

The browser client only receives the public deployment URL. Never put a Convex
admin key or deploy key in a `VITE_` variable.

## Production

The production Worker reads `CONVEX_URL` from `wrangler.toml` and its
server-only `CONVEX_DEPLOY_KEY` from a Cloudflare Worker secret. Deploy
Convex functions first, then build and publish the Worker:

```sh
VITE_CONVEX_URL=https://<production-deployment>.convex.cloud DRIFTOS_CLOUDFLARE_DEPLOY=1 npm run build
npx wrangler deploy
```

The browser receives only the public Convex URL. Never expose the deploy key
in client bundles, logs, or committed files. Keep the permission-restricted D1
export backup outside the repository until the migration retention period ends.
