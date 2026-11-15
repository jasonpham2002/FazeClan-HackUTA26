# Backend release on Vultr

The direct-port setup uses `http://104.238.146.107:3001` for the API. To serve the frontend and API at `manilovefaze.club`, use the same-origin setup below. Updating static frontend files alone does not restart the Node API. This repository has no checked-in GitHub Actions deployment workflow. Any auto-deployment is configured outside the repository and must update both services.

## Release the existing service

In the existing server checkout, pull `main`, then from `backend/`:

```sh
npm ci
npm run check
npm run migrate
npm run import:esports -- data/faze-cs2-2026-11-15.json --write
npm run import:calendar -- data/faze-calendar-2026-11-15.json --write
```

Use Node.js 24 or newer. Keep the deployed `.env`, CA certificate, auth secret and ingestion token. Confirm `DATABASE_URL` and `DB_SCHEMA` are the intended service and schema; the local import used `faze_test_johnny`. Do not change the deployed schema merely to match the local one: that would switch which accounts, points, events and rewards are visible. Instead, import the roster into the deployed service's existing schema. The importer does not seed or reset users/rewards.

Restart the existing API and worker using the process manager configured on the host. The API must run `backend/src/server.ts` through `npm start` from `backend/`. The worker uses `npm run worker`. A Git pull alone does not restart a running Node process.

For the current direct-port deployment, the API's environment needs:

```dotenv
LISTEN_HOST=0.0.0.0
PORT=3001
PUBLIC_BASE_URL=http://104.238.146.107:3001
APP_ORIGINS=http://104.238.146.107
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
```

Build the frontend from `web/` with:

```sh
npm ci
VITE_DATA_SOURCE=live VITE_API_BASE_URL=http://104.238.146.107:3001 npm run build
```

Serve the updated `web/dist/` through the existing static host.

## Same-origin demo at manilovefaze.club

Build from `web/` with `VITE_DATA_SOURCE=live VITE_API_BASE_URL=/api npm run build`. Use the public site origin for the backend's `PUBLIC_BASE_URL` (for example, `http://manilovefaze.club`) and include it in `APP_ORIGINS`.

If the site is served by Vite preview, run it with the checked-in `web/vite.config.ts`. If another proxy owns the public routes, apply the same routing there and remove any rules that send page paths such as `/admin` to the API.

| Public path | Upstream |
|---|---|
| `/api/auth/*` | Backend on port 3001 with the full path and query preserved |
| Other `/api/*` | Backend on port 3001 with the leading `/api` removed |
| `/admin`, `/admin/*`, and other browser pages | Serve the frontend and fall back to `index.html` for page routes |

After updating the host, check that opening `/admin` directly serves HTML and that `/api/admin/events` returns JSON with HTTP 401 without a session. Request a new staff link in Mailpit, open it in the same browser, and reload the dashboard to verify the redirect and session.

## Verify the release

From any Node 24 checkout, in `backend/`:

```sh
npm run verify:deployment -- http://104.238.146.107:3001
```

This command only reads public endpoints; it needs no credentials. It verifies the backend version marker and health, nonempty imported roster, one real stat snapshot, rewards, predictions and events. Empty rewards/markets are valid; they must still return JSON lists rather than missing-route errors. An old backend, HTML fallback, missing import or missing migration fails the command.

`GET /health` returns `status: "ok"`, `apiVersion: "faze-id-v1"` and the player/prediction/points/reward capabilities only when all required core tables and the player engagement view exist. This distinguishes the updated API from the earlier events-only service. It checks database readiness, not the running worker, SMTP delivery, YouTube integration or AI provider availability.

Migration 011 connects `engagement_players` to the real imported roster, allowing follow requests to validate sourced player IDs. Migration 012 adds match/tournament storage, source-attributed calendar routes and prediction reference views. The calendar bundle includes one upcoming fixture, one recent result, and two tournament records. Import it after the roster. It never settles a market automatically.

## Domain sign-in loop: confirmed deployment mismatch

A live check found the domain frontend fetching `http://104.238.146.107:3001/me`, while `/api/me` and `/admin` on the domain returned backend 404 JSON. This combines a cross-site cookie request with incorrect proxy paths. Merging the Vite preview proxy does not update Nginx or change an already compiled API base URL.

On Vultr, preserve the existing secrets, database/schema, and other required origins; update backend `.env`:

```dotenv
PUBLIC_BASE_URL=http://manilovefaze.club
APP_ORIGINS=http://manilovefaze.club,http://104.238.146.107
```

Build the frontend with explicit settings (these override any stale Vite environment files):

```sh
cd web
VITE_DATA_SOURCE=live VITE_API_BASE_URL=/api npm run build
```

For Nginx, adapt [nginx-domain.conf.example](nginx-domain.conf.example) in the **existing active domain server block**. Replace its root with the real absolute `web/dist` path. Remove competing locations that proxy `/admin` or all page routes to port 3001. If the frontend is intentionally served through Vite preview instead of static files, keep the existing frontend upstream for page routes and apply the two API locations from the example. Do not run two services competing for port 80.

After editing the actual active configuration, run `sudo nginx -t` and reload Nginx only if validation succeeds. Restart the API through its existing process manager so `PUBLIC_BASE_URL` and `APP_ORIGINS` take effect. Then:

```sh
cd backend
npm run verify:site -- http://manilovefaze.club
```

This checks domain page routes, API prefix stripping, auth prefix preservation, and stale IP references in the built JavaScript. It is read-only and does not request or expose email tokens. It is not a substitute for opening a newly requested magic link: old links retain the old callback/base URL. Use the domain consistently in the same browser, then verify `/api/me` returns the signed-in user and refreshing `/profile` preserves the session.

At the time of diagnosis HTTPS on port 443 was unavailable. These examples therefore match the currently working HTTP origin. If TLS is enabled, update both public URLs/origins to HTTPS and apply the route rules to the TLS server block as well.
