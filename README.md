# FazeClan-HackUTA26

FaZe ID: a connected CS2 fan platform with sourced player analytics, YouTube highlights, free predictions, points, proposed rewards, and AI interviews for limited-access events.

## Connected demo — start here

The shared React app is in [web/](web/README.md). Khoi's staff dashboard and Johnny's fan pages use the same router, typed API client, and fixture database. Follow the [integration runbook](web/INTEGRATION.md) for local setup, the fan → staff → invitation walkthrough, and the [Vultr release steps](web/INTEGRATION.md#vultr-demo-release).

From this repository on Windows:

```powershell
cd web
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

Alternatively, on macOS (`zsh`) — run `npm ci` once (or after lockfile updates; `npm warn install-scripts` for `fsevents` is harmless):

```zsh
cd web
npm ci
npm run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

If you get `Error: Port 5189 is already in use`, `--strictPort` is protecting against a server already listening on `5189`. Check for an existing process before starting Vite:

```zsh
lsof -nP -iTCP:5189 -sTCP:LISTEN
```

Either reuse `http://127.0.0.1:5189`, stop the existing server (`Ctrl+C` in its terminal, or `kill <PID>` from the `lsof` output), or run Vite on another allowed port (`--port 3000` or `--port 3002`, or omit `--strictPort` in fixture mode).

Open http://127.0.0.1:5189 for fans and http://127.0.0.1:5189/admin for staff. In Vite development (`npm run dev`), `web/` defaults to live API mode against `http://127.0.0.1:3001`; production builds (`npm run build`) default to `/api` unless `VITE_API_BASE_URL` is set (for Vultr builds without an `/api` reverse proxy, build with `VITE_DATA_SOURCE=live VITE_API_BASE_URL=http://104.238.146.107:3001 npm run build`). Browser-only fixture mode requires an explicit `VITE_DATA_SOURCE=fixtures` setting and does not write to PostgreSQL. To configure the backend locally (Node.js 24+, Mailpit via `brew install mailpit` or `backend/.local/bin/mailpit`, and Tiger Cloud PostgreSQL), follow [backend/README.md](backend/README.md) and set `VITE_DATA_SOURCE=live` and `VITE_API_BASE_URL=http://127.0.0.1:3001` in `web/.env.local` per [web/INTEGRATION.md](web/INTEGRATION.md#run-with-the-local-backend).

Note on branch state: on this branch, `web/` wires community events, applications, `/me/applications` and `/me/activity`, and staff event/interview/application review; the expanded FaZe ID UI (roster, player profiles, match predictions, points ledger, rewards, and staff insights) is on `khoi/staff-dashboard` awaiting merge into `web/`. The earlier standalone [frontend/](frontend/README.md) is preserved for reference only and does not sync with `web/`.

For real-time call integration work, the starter FaceTime/Chert video agent lives in [agent/](agent/README.md) (Node 22.23.2+, 24, or 26 with LiveKit/Chert). The backend's `npm run worker` currently runs synthetic `mode: "fixture"` interviews.

## Team assignments — current 10-hour sprint

**No SerpAPI.** Current roster, CS2 statistics, matches and tournament facts are manually collected from identified sources and imported into PostgreSQL. AI explains those stored facts; numerical statistics are never invented. Data is current as of its displayed import/check timestamp, not a real-time telemetry feed.

| Owner | Scope | Detailed plan |
|---|---|---|
| Johnny | Manual roster/stat/match imports, provenance, validation and player-data APIs | [Minh.md](Minh.md) |
| Jason | Predictions, settlement, points ledger, rewards, verified engagement and event eligibility | [Jason.md](Jason.md) |
| Khoi | All fan and staff frontend: player pages, schedule, highlights, predictions, points, rewards and event review | [Khoi.md](Khoi.md) |
| Minh | YouTube API, analytical AI provider, source-grounded insights, existing AI interview; Tuong supports calls | [Johnny.md](Johnny.md) |

Johnny and Minh's filenames remain swapped as requested earlier. Each document's heading identifies the actual owner. All four include planning steps, proposed contracts, dependencies, a ten-hour schedule, acceptance criteria and scope limits.

Current backend integration status (see [backend/README.md](backend/README.md)):

- **Implemented in `backend/`:** Magic-link auth (`@example.test` via Mailpit), community events, interview draft/versioning/ingestion, staff application review/analytics/insights (`GET /admin/insights`), player follows (`/me/follows`), free prediction markets and staff settlement (`/predictions/markets`, `/admin/prediction-markets`), append-only points ledger and staff adjustments (`/me/points`, `/admin/users/:id/points`), rewards and atomic redemptions (`/rewards`, `/admin/rewards`, `/me/redemptions`, `/admin/redemptions`), minimum-points event eligibility, and `+25` points for staff-confirmed attendance (`POST /admin/applications/:id/attendance`). Content QR claims (`POST /engagement/claims`) are not implemented.
- **Pending external dependencies:** Johnny's SQL views (`engagement_players`, `engagement_matches`, `engagement_tournaments`) and player/match endpoints (`/players*`, `/esports/matches`), plus Minh's highlights and AI-insight routes (`/players/:id/highlights`, `/players/:id/insights`). Until Johnny publishes those views, `PUT /me/follows/:playerId` and sourced `POST /admin/prediction-markets` return `503 ESPORTS_DATA_UNAVAILABLE` (custom/direct market payloads with `title` and `options` work without the views).

Muse Spark is a candidate analytical provider; Minh verifies actual API access and capabilities before committing the implementation. Player pages display analytics first, then matches/calendar/tournament activity, then videos. Coach and non-active roster statuses are presented appropriately.

## Shared demo journey

Choose a current CS2 player → inspect sourced stats and AI explanation → follow a match → submit a free prediction → staff confirms the result → receive a persisted points award → redeem a sample proposed reward or apply for an eligible exclusive event → AI interview → staff invitation.

Points unlock eligibility for selected experiences; applying or taking the interview does not deduct points. Merchandise, raffle-entry, priority and early-access benefits are proposed for the pitch, not fulfilled FaZe commitments. Event attendance requires staff confirmation on an accepted application (confirmed-attendance award is once per attendance).

## Sprint milestones

1. Hour 0–1: agree contracts/IDs, migration ownership, data sources, point rules and one demo player/market/reward/event.
2. Hours 1–3: make real sourced stats, YouTube results, first AI insight and backend prediction/ledger paths available to Khoi.
3. Hours 3–7: connect player UI, predictions, staff settlement, points, one redemption and the existing exclusive-event interview flow.
4. Hours 7–8: test the complete fan/staff loop, duplicate requests, eligibility and provider failures.
5. Hours 8–10: freeze scope, run checks, deploy within the agreed target and rehearse.

Use the existing shared app and real backend. Existing backend migrations are `001_auth.sql`, `002_applications.sql`, `003_interviews.sql`, `004_event_timezone.sql`, `006_engagement.sql`, `007_engagement_compat.sql`, and `008_engagement_ui_compat.sql`; coordinate additive migrations and central route registration with Jason, and do not overwrite applied migrations or duplicate the app/database. Show honest unavailable states when sources/providers fail.

## Earlier standalone fan frontend (reference only)

Run from the repository root (or `python3 frontend/serve.py` on macOS):

```sh
python frontend/serve.py
```

Open http://127.0.0.1:5187. Default mode is an explicitly labeled in-memory simulation, not a real account or phone call. See [frontend setup and backend handoff](frontend/README.md). This older standalone prototype is reference-only and is not kept in sync with `web/` or the current `backend/` routes.

In that archived prototype only, the profile view keeps its legacy `applicationHistory` and `activityHistory` `config.js` feature flags (`GET /api/me/applications`, `GET /api/me/activity`) disabled against its old contract in [the legacy API handoff](frontend/API-HANDOFF.md). The active `web/` app already reads persisted `/me/applications` and `/me/activity` directly from `backend/` in live mode.
