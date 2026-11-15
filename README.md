# FazeClan-HackUTA26

FaZe ID: a connected CS2 fan platform with sourced player analytics, YouTube highlights, free predictions, points, proposed rewards, and AI interviews for limited-access events.

## Connected demo — start here

The shared app is now in [web/](web/README.md). Khoi's staff dashboard and Johnny's fan pages use the same router, typed API client, and fixture database. Follow the [integration runbook](web/INTEGRATION.md) for the complete fan → staff → invitation walkthrough.

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

Open http://127.0.0.1:5189 for fans and http://127.0.0.1:5189/admin for staff. The frontend now defaults to the live API at `http://127.0.0.1:3001`; browser-only fixture mode requires an explicit `VITE_DATA_SOURCE=fixtures` setting. Fixture accounts do not write to PostgreSQL. To configure the backend on macOS (Node.js 24+, Mailpit via `brew install mailpit` or `backend/.local/bin/mailpit`, and Tiger Cloud), follow [backend/README.md](backend/README.md) and set `VITE_DATA_SOURCE=live` and `VITE_API_BASE_URL=http://127.0.0.1:3001` in `web/.env.local` per [web/INTEGRATION.md](web/INTEGRATION.md#run-with-the-local-backend).

The earlier standalone [frontend/](frontend/README.md) is preserved for reference. Its separate demo store does not sync with the connected app. Use `web/` for team integration and confirm its [shared API contracts](web/INTEGRATION.md) with Jason.

## Team assignments ? current 10-hour sprint

**No SerpAPI.** Current roster, CS2 statistics, matches and tournament facts are manually collected from identified sources and imported into PostgreSQL. AI explains those stored facts; numerical statistics are never invented. Data is current as of its displayed import/check timestamp, not a real-time telemetry feed.

| Owner | Scope | Detailed plan |
|---|---|---|
| Johnny | Manual roster/stat/match imports, provenance, validation and player-data APIs | [Minh.md](Minh.md) |
| Jason | Predictions, settlement, points ledger, rewards, verified engagement and event eligibility | [Jason.md](Jason.md) |
| Khoi | All fan and staff frontend: player pages, schedule, highlights, predictions, points, rewards and event review | [Khoi.md](Khoi.md) |
| Minh | YouTube API, analytical AI provider, source-grounded insights, existing AI interview; Tuong supports calls | [Johnny.md](Johnny.md) |

Johnny and Minh's filenames remain swapped as requested earlier. Each document's heading identifies the actual owner. All four include implementation steps, proposed contracts, dependencies, a ten-hour schedule, acceptance criteria and scope limits.

Muse Spark is a candidate analytical provider; Minh verifies actual API access and capabilities before committing the implementation. Player pages display analytics first, then matches/calendar/tournament activity, then videos. Coach and non-active roster statuses are presented appropriately.

## Shared demo journey

Choose a current CS2 player ? inspect sourced stats and AI explanation ? follow a match ? submit a free prediction ? staff confirms the result ? receive a persisted points award ? redeem a sample proposed reward or apply for an eligible exclusive event ? AI interview ? staff invitation.

Points unlock eligibility for selected experiences; applying or taking the interview does not deduct points. Merchandise, raffle-entry, priority and early-access benefits are proposed for the pitch, not fulfilled FaZe commitments. A content QR claim is a content check-in; event attendance requires an actual confirmed check-in.

## Sprint milestones

1. Hour 0?1: agree contracts/IDs, migration ownership, data sources, point rules and one demo player/market/reward/event.
2. Hours 1?3: make real sourced stats, YouTube results, first AI insight and backend prediction/ledger paths available to Khoi.
3. Hours 3?7: connect player UI, predictions, staff settlement, points, one redemption and the existing exclusive-event interview flow.
4. Hours 7?8: test the complete fan/staff loop, duplicate requests, eligibility and provider failures.
5. Hours 8?10: freeze scope, run checks, deploy within the agreed target and rehearse.

Use the existing shared app and real backend. Coordinate additive migrations and central route registration with Jason; do not overwrite applied migrations or duplicate the app/database. Show honest unavailable states when sources/providers fail.

## Earlier standalone fan frontend (reference)

Run from the repository root (or `python3 frontend/serve.py` on macOS):

    python frontend/serve.py

Open http://127.0.0.1:5187. Default mode is an explicitly labeled in-memory simulation, not a real account or phone call. See [frontend setup and backend handoff](frontend/README.md). This older standalone prototype is reference-only. Current ownership is in the assignment table above.

## Fan profile and history

The fan frontend now includes My profile, application history, sourced activity, and a labeled returning-fan demo. Optional live history endpoints remain disabled until Jason implements them; see [the API handoff](frontend/API-HANDOFF.md). With application history enabled, the client can discover an existing application after signing in on a new tab. New fans start with empty history.
