# Connected fan and staff platform

`web/` is now the shared frontend. Khoi's staff dashboard and Johnny's fan pages use the same router, UI components, typed API interface, and fixture database. The earlier standalone `frontend/` remains intact as a reference; it does not synchronize with `web/` and is not the connected demo entry point.

## Run the connected demo

From the repository root on Windows:

```powershell
cd web
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

Alternatively, on macOS (`zsh`):

```zsh
cd web
npm ci
npm run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

Open http://127.0.0.1:5189. Live API mode is the default and requires the backend described below. For a browser-only walkthrough, explicitly set `VITE_DATA_SOURCE=fixtures` in `web/.env.local` and restart Vite; those sample accounts never reach PostgreSQL.

The following steps describe explicit fixture mode only. For database-backed accounts use the local-backend section below.

1. Open the event and submit an application with consent. Use the sample account; fixture sign-in and sign-up only change browser-local records.
2. Confirm the destination and select **Simulate call request**.
3. Select **Simulate completed interview** to create clearly synthetic Q&A. **Simulate missed call** also supports retries.
4. Open **Review in staff dashboard**. This is the same application ID and pinned interview version, not a separate sample.
5. Choose Invite or Waitlist and save the staff decision.
6. Return to the fan application. An invitation can be accepted; staff status and acceptance counts update.

Fan and staff tabs synchronize through the shared fixture storage key and query invalidation. A page reload retains fixture state. The banner's Reset sample data control clears the store. This persistence is for fictional demonstration data, not production storage or authentication.

The fixture has two explicitly simulated personas: Demo Staff for staff pages and Demo Fan for fan pages. This is not a role-switching authentication implementation. Live sessions use `/me` and server authorization.

## Connected routes

| Fan | Staff |
|---|---|
| `/` — published events | `/admin` — event overview |
| `/events/:id` — event/application | `/admin/events/:id` — edit event |
| `/applications/:id` — call readiness and decision | `/admin/applications/:id` — Q&A and Invite/Waitlist |
| `/profile` — own applications and activity | `/admin/events/:id/applications` — review queue |
| `/sign-in` — demo profile or real-auth handoff | `/admin/events/:id/interview` — draft/publish questions |

New applications pin the latest published interview. Draft edits do not change existing applications. A simulated completion uses the application's pinned questions and writes synthetic answers with valid transcript references into the staff dashboard.

## Run with the local backend

Follow [backend setup](../backend/README.md) and run the migrations before starting the API and worker. Migration 004 stores event time zones and defaults existing events to `America/Chicago`. Keep Mailpit running on loopback.

Configure `web/.env.local`:

```dotenv
VITE_DATA_SOURCE=live
VITE_API_BASE_URL=http://127.0.0.1:3001
```

Use Vite on `127.0.0.1:5189` and the same hostname for the API. The API trusts this frontend origin by default. Include it in `APP_ORIGINS` if overriding the default. Open `/sign-in`, request a magic link for an `@example.test` address, and open the link from Mailpit in the same browser profile. Use separate profiles or private sessions for fan and staff accounts. The seeded reviewer is `staff@example.test`.

The [backend guide](../backend/README.md) describes the HTTP contract. The client in `src/api/http.ts` translates server responses into the shapes used by the fan and staff screens. The server handles cookies, role and ownership checks, version pinning, duplicate requests, and invitation capacity. In live mode, **Run sample interview** writes synthetic transcript and result events through the local worker. Minh and Tuong own the Muse integration.

To run the live Chrome smoke test against a fresh, seeded disposable schema, start the API and worker on port `3101` with that same schema. Start Vite with `VITE_API_BASE_URL=http://127.0.0.1:3101`.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/live-smoke.mjs
```

The smoke test creates an application, publishes a new version, and makes a staff decision in that schema. Run it against a fresh test schema for each rehearsal.

## Verification

```powershell
npm.cmd test
npm.cmd run build
```

Alternatively, on macOS (`zsh`):

```zsh
npm test
npm run build
```

The fixture integration suite checks a new fan application appearing in the staff list, question version pinning, missed-call retry, synthetic transcript evidence, private-note exclusion, ownership, staff decisions, acceptance counts, capacity conflicts, and persistence through an older-store upgrade.

Optional browser regression (Playwright installed separately; start Vite on 5189 first):

```powershell
$env:PLAYWRIGHT_MODULE = 'absolute/path/to/playwright/index.mjs'
$env:BROWSER_CHANNEL = 'chrome'
node scripts/connected-smoke.mjs
```

Or on macOS:

```zsh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs BROWSER_CHANNEL=chrome node scripts/connected-smoke.mjs
```

Verified in headless Chrome: the complete flow across separate fan/staff tabs without manually reloading, persistence after reload, and fan layouts at 320, 390, 768, and 1440px. The live smoke test covers Mailpit authentication, persisted staff and fan operations, and the sample interview worker.
