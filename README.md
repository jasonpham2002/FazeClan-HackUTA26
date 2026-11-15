# FazeClan-HackUTA26

Independent FaZe Clan concept: an event application platform with an editable AI FaceTime interview and human-reviewed invitations.

## Team assignments

| Owner | Scope | Detailed plan |
|---|---|---|
| Johnny | Fan signup, event applications, call readiness and invitation acceptance | [Minh.md](Minh.md) |
| Jason | Backend, database, authentication, call orchestration and Vultr deployment | [Jason.md](Jason.md) |
| Minh + Tuong | Muse integration, AI host, call experience, transcripts and structured answers | [Johnny.md](Johnny.md) |
| Khoi | Staff dashboard, editable questions, application review and analytics | [Khoi.md](Khoi.md) |

Each assignment includes shared contracts, implementation steps, dependencies, a 24-hour schedule and acceptance checks. The fan frontend starter is available in [frontend/](frontend/README.md); backend, staff dashboard and live calls remain integration work.

## Shared demo journey

Staff publishes event questions → fan signs up and applies → fan requests an AI FaceTime interview → answers and transcript reach the dashboard → staff invites or waitlists → fan accepts an invitation.

## First milestones

1. Agree API contracts, database choice, shared styling and responsibility boundaries in the first hour.
2. Prove a real FaceTime audio/video call within two hours. If managed outbound is unavailable, label the operator-assisted fallback explicitly.
3. Complete the application-to-call-to-review flow by hour ten.
4. Freeze features for the final rehearsal and pitch preparation.

Use Jason's assignment for API and persistence coordination, Minh and Tuong's for the agent/result contract, and the linked frontend assignments for the two user journeys.

## Local fan frontend

Run from the repository root:

    python frontend/serve.py

Open http://127.0.0.1:5187. Default mode is an explicitly labeled in-memory simulation, not a real account or phone call. See [frontend setup and backend handoff](frontend/README.md). Johnny and Khoi build the platform; Jason owns its backend. Minh and Tuong build the AI call feature.

## Fan profile and history

The fan frontend now includes My profile, application history, sourced activity, and a labeled returning-fan demo. Optional live history endpoints remain disabled until Jason implements them; see [the API handoff](frontend/API-HANDOFF.md). With application history enabled, the client can discover an existing application after signing in on a new tab. New fans start with empty history.
