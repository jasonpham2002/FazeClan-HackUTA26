# FazeClan-HackUTA26

Independent FaZe Clan concept: an event application platform with an editable AI FaceTime interview and human-reviewed invitations.

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

## Team assignments

| Owner | Scope | Detailed plan |
|---|---|---|
| Johnny | Fan signup, event applications, call readiness and invitation acceptance | [Minh.md](Minh.md) |
| Jason | Backend, database, authentication, call orchestration and Vultr deployment | [Jason.md](Jason.md) |
| Minh + Tuong | Muse integration, AI host, call experience, transcripts and structured answers | [Johnny.md](Johnny.md) |
| Khoi | Staff dashboard, editable questions, application review and analytics | [Khoi.md](Khoi.md) |

Each assignment includes shared contracts, implementation steps, dependencies, a 24-hour schedule and acceptance checks. The fan and staff frontend is connected in [web/](web/README.md); the [local backend](backend/README.md) provides database-backed sign-in, review, and sample interviews. Minh and Tuong own the Muse integration.

## Shared demo journey

Staff publishes event questions → fan signs up and applies → fan requests an AI FaceTime interview → answers and transcript reach the dashboard → staff invites or waitlists → fan accepts an invitation.

## First milestones

1. Agree API contracts, database choice, shared styling and responsibility boundaries in the first hour.
2. Prove a real FaceTime audio/video call within two hours. If managed outbound is unavailable, label the operator-assisted fallback explicitly.
3. Complete the application-to-call-to-review flow by hour ten.
4. Freeze features for the final rehearsal and pitch preparation.

Use Jason's assignment for API and persistence coordination, Minh and Tuong's for the agent/result contract, and the linked frontend assignments for the two user journeys.

## Earlier standalone fan frontend (reference)

Run from the repository root (or `python3 frontend/serve.py` on macOS):

    python frontend/serve.py

Open http://127.0.0.1:5187. Default mode is an explicitly labeled in-memory simulation, not a real account or phone call. See [frontend setup and backend handoff](frontend/README.md). Johnny and Khoi build the platform; Jason owns its backend. Minh and Tuong build the AI call feature.

## Fan profile and history

The fan frontend now includes My profile, application history, sourced activity, and a labeled returning-fan demo. Optional live history endpoints remain disabled until Jason implements them; see [the API handoff](frontend/API-HANDOFF.md). With application history enabled, the client can discover an existing application after signing in on a new tab. New fans start with empty history.
