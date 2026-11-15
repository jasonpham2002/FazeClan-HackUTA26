# FazeClan-HackUTA26

Independent FaZe Clan concept: an event application platform with an editable AI FaceTime interview and human-reviewed invitations.

## Connected demo ? start here

The shared app is now in [web/](web/README.md). Khoi's staff dashboard and Johnny's fan pages use the same router, typed API client, and fixture database. Follow the [integration runbook](web/INTEGRATION.md) for the complete fan ? staff ? invitation walkthrough.

From this repository on Windows:

```powershell
cd web
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

Open http://127.0.0.1:5189 for fans and http://127.0.0.1:5189/admin for staff. Fixture mode is explicit; no real call, login, or backend is simulated as a live integration.

The earlier standalone [frontend/](frontend/README.md) is preserved for reference. Its separate demo store does not sync with the connected app. Use `web/` for team integration and confirm its [shared API contracts](web/INTEGRATION.md) with Jason.

## Team assignments

| Owner | Scope | Detailed plan |
|---|---|---|
| Johnny | Fan signup, event applications, call readiness and invitation acceptance | [Minh.md](Minh.md) |
| Jason | Backend, database, authentication, call orchestration and Vultr deployment | [Jason.md](Jason.md) |
| Minh + Tuong | Muse integration, AI host, call experience, transcripts and structured answers | [Johnny.md](Johnny.md) |
| Khoi | Staff dashboard, editable questions, application review and analytics | [Khoi.md](Khoi.md) |

Each assignment includes shared contracts, implementation steps, dependencies, a 24-hour schedule and acceptance checks. The fan and staff frontend is connected in [web/](web/README.md); the real backend and AI calls remain integration work.

## Shared demo journey

Staff publishes event questions → fan signs up and applies → fan requests an AI FaceTime interview → answers and transcript reach the dashboard → staff invites or waitlists → fan accepts an invitation.

## First milestones

1. Agree API contracts, database choice, shared styling and responsibility boundaries in the first hour.
2. Prove a real FaceTime audio/video call within two hours. If managed outbound is unavailable, label the operator-assisted fallback explicitly.
3. Complete the application-to-call-to-review flow by hour ten.
4. Freeze features for the final rehearsal and pitch preparation.

Use Jason's assignment for API and persistence coordination, Minh and Tuong's for the agent/result contract, and the linked frontend assignments for the two user journeys.

## Earlier standalone fan frontend (reference)

Run from the repository root:

    python frontend/serve.py

Open http://127.0.0.1:5187. Default mode is an explicitly labeled in-memory simulation, not a real account or phone call. See [frontend setup and backend handoff](frontend/README.md). Johnny and Khoi build the platform; Jason owns its backend. Minh and Tuong build the AI call feature.

## Fan profile and history

The fan frontend now includes My profile, application history, sourced activity, and a labeled returning-fan demo. Optional live history endpoints remain disabled until Jason implements them; see [the API handoff](frontend/API-HANDOFF.md). With application history enabled, the client can discover an existing application after signing in on a new tab. New fans start with empty history.
