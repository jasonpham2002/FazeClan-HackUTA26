# FazeClan-HackUTA26

Independent FaZe Clan concept: an event application platform with an editable AI FaceTime interview and human-reviewed invitations.

## Team assignments

| Owner | Scope | Detailed plan |
|---|---|---|
| Johnny | AI host, LiveKit, FaceTime audio/video, transcripts and structured answers | [Johnny.md](Johnny.md) |
| Jason | Backend, database, authentication, call orchestration and Vultr deployment | [Jason.md](Jason.md) |
| Minh | Fan signup, event applications, call readiness and invitation acceptance | [Minh.md](Minh.md) |
| Khoi | Staff dashboard, editable questions, application review and analytics | [Khoi.md](Khoi.md) |

Each assignment includes shared contracts, implementation steps, dependencies, a 24-hour schedule and acceptance checks. These documents describe planned work; the application is not implemented yet.

## Shared demo journey

Staff publishes event questions → fan signs up and applies → fan requests an AI FaceTime interview → answers and transcript reach the dashboard → staff invites or waitlists → fan accepts an invitation.

## First milestones

1. Agree API contracts, database choice, shared styling and responsibility boundaries in the first hour.
2. Prove a real FaceTime audio/video call within two hours. If managed outbound is unavailable, label the operator-assisted fallback explicitly.
3. Complete the application-to-call-to-review flow by hour ten.
4. Freeze features for the final rehearsal and pitch preparation.

Use Jason's assignment for API and persistence coordination, Johnny's for the agent/result contract, and the linked frontend assignments for the two user journeys.
