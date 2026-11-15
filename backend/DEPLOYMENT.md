# Backend release on Vultr

The public frontend uses `http://104.238.146.107:3001`. Updating static frontend files alone does not restart the Node API. This repository has no checked-in GitHub Actions deployment workflow; any auto-deployment is configured outside the repository and must update both services.

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

Serve the updated `web/dist/` through the existing static host. `/api` on port 80 currently returns the frontend HTML, so it is not the API base URL unless the host's reverse proxy is explicitly changed.

## Verify the release

From any Node 24 checkout, in `backend/`:

```sh
npm run verify:deployment -- http://104.238.146.107:3001
```

This command only reads public endpoints; it needs no credentials. It verifies the backend version marker and health, nonempty imported roster, one real stat snapshot, rewards, predictions and events. Empty rewards/markets are valid; they must still return JSON lists rather than missing-route errors. An old backend, HTML fallback, missing import or missing migration fails the command.

`GET /health` returns `status: "ok"`, `apiVersion: "faze-id-v1"` and the player/prediction/points/reward capabilities only when all required core tables and the player engagement view exist. This distinguishes the updated API from the earlier events-only service. It checks database readiness, not the running worker, SMTP delivery, YouTube integration or AI provider availability.

Migration 011 connects `engagement_players` to the real imported roster, allowing follow requests to validate sourced player IDs. Migration 012 adds match/tournament storage, source-attributed calendar routes and prediction reference views. The calendar bundle includes one upcoming fixture, one recent result, and two tournament records. Import it after the roster. It never settles a market automatically.
