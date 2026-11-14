# Jason — Backend, database, call orchestration, and Vultr deployment

## Assignment

Own the application backbone: secure authentication, persistent records, published question versions, reliable call orchestration, review decisions, and the deployed environment.

Collaborators: Johnny owns the real-time AI agent; Minh owns fan pages; Khoi owns staff pages. Deadline: 24 hours.

Repository: https://github.com/jasonpham2002/FazeClan-HackUTA26

Repository checked: the remote currently contains only README.md. The architecture, routes, and interfaces below are implementation proposals. Check for new code and applicable AGENTS.md instructions before starting; coordinate shared contract changes with affected teammates.

## Architecture and database decision

Use the repository's backend framework if one exists. Otherwise, a TypeScript API and worker are a reasonable default. Keep API requests short; an HTTP request must not stay open for the duration of a FaceTime call.

Recommended database: Tiger Data/PostgreSQL as the only datastore. Use relational tables for applications and decisions, JSONB for flexible metadata. Basic SQL is sufficient; do not add time-series optimization during the sprint. If existing code already depends on MongoDB, agree to retain it rather than introducing a second database. Equivalent uniqueness, authorization, and idempotency requirements still apply.

Deploy frontend, API, and worker to Vultr using the repository's deployment conventions or Docker Compose. Use managed LiveKit for media. Tiger Cloud is hosted outside Vultr; if all storage must be on Vultr, deploy PostgreSQL/TimescaleDB privately there instead. Confirm this choice in the first hour.

## First-hour shared contract

Agree with all teammates on:

- Base API URL and local development ports.
- Authentication/session mechanism and fan/staff roles.
- JSON field names, timestamp format (UTC ISO 8601), and ID representation.
- Response and error envelopes.
- Application/call statuses below.
- Who initiates Chert calls: your worker, with Johnny supplying agent integration.
- How frontend contributors obtain safe fixtures before APIs are ready.

Suggested errors: `{ "error": { "code": "CALL_ALREADY_ACTIVE", "message": "A call is already in progress." } }`. Never expose provider credentials or internal stack traces.

## Data model

| Table | Required contents |
|---|---|
| users | ID, email, normalized E.164 phone, display name, role, verification timestamps |
| events | ID, title, description, location, starts_at, capacity, deadline, publication status |
| interview_versions | ID, event ID, version number, draft/published state, intro, tone, duration, published_at |
| questions | Stable ID within version, version ID, prompt, purpose, order, required, max_follow_ups |
| applications | ID, user ID, event ID, pinned interview version ID, status, submitted_at |
| call_attempts | ID, application ID, provider call ID, room ID, status, timestamps, failure code |
| transcript_segments | ID, call ID, provider/agent event ID, sequence, speaker, text, timestamp |
| answers | Call ID, question ID, summary, supporting segment IDs, completeness |
| interview_results | Call ID, schema version, summary, interests, unanswered IDs, review notes, processing status |
| activity_events | User ID, optional event ID, type, timestamp, source, metadata, is_demo |
| decisions | Application ID, decision, reviewer ID, reason, created_at |
| consents | User ID, application ID, consent-text version, accepted_at |
| jobs | Job ID, kind, payload, attempts, available_at, lease expiry, status |
| processed_provider_events | Provider event ID, received_at; unique for deduplication |

Constraints/indexes:

- Unique normalized email and `(user_id, event_id)` application.
- Unique provider call ID and ingested event ID where present.
- Index applications by event/status and activity by user/time.
- Published interview versions cannot be mutated. Publish a new version after edits.
- Apply pins the currently published version; later staff edits affect future applications.
- Only one active call attempt per application. Enforce atomically, not only in UI.
- Decisions and audit history persist; acceptance checks capacity atomically.

Do not overwrite a completed interview when another attempt fails. Return an explicitly selected completed/partial attempt to the review UI and retain attempt history.

## API contracts

All paths are proposed application endpoints, not Chert API endpoints.

| Method/path | Behavior |
|---|---|
| GET /me | Current user and role |
| GET /events | Published events |
| GET /events/:id | Event and public availability |
| POST /events/:id/applications | Create once; pin interview version and save consent |
| GET /applications/:id | Owner's application, call status, decision |
| POST /applications/:id/call | Verify ownership/consent/recipient; enqueue once; return 202 with callAttemptId |
| POST /applications/:id/accept | Accept valid invitation subject to capacity |
| GET /me/activity | Owner's recorded activity |
| POST /admin/events | Create event |
| PATCH /admin/events/:id | Update event details |
| GET /admin/events/:id/interview | Current draft plus published version metadata |
| PUT /admin/events/:id/interview-draft | Validate and save ordered question configuration |
| POST /admin/events/:id/interview-publish | Create immutable published version |
| GET /admin/applications?eventId=&status=&search= | Paginated review list |
| GET /admin/applications/:id | Fan profile, activity, attempts, configured questions, answers, transcript, decision |
| POST /admin/applications/:id/decision | Staff-only invite/waitlist with optional reason |
| GET /admin/events/:id/analytics | Counts and rates with explicit denominators |
| POST /internal/interviews/events | Authenticated agent transcript/result ingestion |

Wire auth routes using the selected auth library rather than inventing an incomplete verification system. Email magic-link login is sufficient for fan authentication. Collect phone separately; for the demo restrict dialing to verified or preapproved consenting teammates. Do not claim unverified phone ownership.

Question configuration shape shared with Johnny and Khoi:

```json
{
  "intro": "Thanks for applying!",
  "tone": "friendly and casual",
  "maxDurationSeconds": 180,
  "questions": [
    {"id": "q_1", "prompt": "What FaZe content do you enjoy?", "purpose": "Understand interests", "required": true, "order": 1, "maxFollowUps": 1}
  ]
}
```

## Call worker

1. Claim a persisted job using a lease so restarts do not lose it.
2. Recheck application eligibility and create/load the intended attempt.
3. Create an isolated LiveKit room and short-lived credentials.
4. Supply Johnny's agent the pinned interview configuration and correlation IDs.
5. Invoke documented Chert outbound behavior through a provider adapter.
6. Persist the provider call ID and consume available lifecycle events; use documented polling if necessary.
7. Persist incremental transcript events and validated final results.
8. Clean up resources on completion, timeout, or cancellation.

Use provider idempotency support when available. If a network timeout leaves call initiation uncertain, reconcile provider state before redialing; never blindly retry an operation that may already have placed a call. Keep a hard call-duration limit and a small retry budget.

```text
call: queued → dialing → connected → completed
                    ↘ missed / failed / canceled

application: submitted → interview_pending → review_pending
                                         → invited / waitlisted → accepted
```

Call outcome and result-processing status are separate. Completed media with failed extraction should show processing failure, preserve transcript, and allow reprocessing. A missed call must not change the application to waitlisted.

## Deployment and data handling

- HTTPS reverse proxy; database port stays private.
- Server-only secrets supplied through environment configuration; commit an example with names and blank values.
- Staff routes enforce role checks on the server; fans can only access their own applications.
- Validate payload sizes, question count, duration bounds, IDs, and phone formatting.
- Rate-limit call initiation and restrict allowed demo recipients.
- Authenticate internal agent requests and verify provider callbacks using the provider's documented mechanism; do not invent a signature format.
- Avoid logging full transcripts, tokens, or phone numbers. Keep correlation IDs for debugging.
- Store transcripts with limited access. Raw audio/video recording is out of scope.
- Provide a script/command to remove demo participants' personal data after the pitch.
- Health checks and worker restart behavior must be documented.

## Analytics and seeds

Return applications, connected calls, completed interviews, review backlog, invited count, and accepted count. Define connection rate as connected attempts / attempted calls and interview completion rate as completed interviews / connected calls; label zero-denominator results as unavailable.

Seed one upcoming event, four questions, several demo profiles with clearly marked synthetic history, and invited/waitlisted examples. Never manufacture historical activity for a real newly registered fan. Attendance must come from a separate attendance record, not application submission.

## Schedule

| Hours | Deliverable |
|---|---|
| 0–2 | Contracts, database/auth choice, deployed health endpoint |
| 2–6 | Schema, seeds, auth, events, applications, question versions |
| 6–10 | Persistent call jobs and Johnny's transcript/result integration |
| 10–14 | Review details, decisions, invitation acceptance |
| 14–18 | Analytics, retries, access controls, restart behavior |
| 18–21 | End-to-end checks with all contributors |
| 21–24 | Freeze, deployment runbook, backup/export of demo state |

## Acceptance checks

- [ ] Another fan cannot read or modify an application's data; a fan cannot invoke staff endpoints.
- [ ] Duplicate application/call submissions do not create duplicate active work.
- [ ] Publishing new questions does not change a previous application's interview.
- [ ] Duplicate transcript/provider events are harmless.
- [ ] Worker restart does not silently lose pending jobs or redial uncertain calls.
- [ ] Invite/waitlist persists and acceptance respects capacity.
- [ ] Dashboard counts match persisted records.
- [ ] A clean deployment starts from documented environment variables and commands.

Out of scope: multiple databases, microservice orchestration, complex permissions, broad notification campaigns, rewards fulfillment, and production-scale load engineering.

## Related assignments

[Project overview](README.md) | [Johnny](Johnny.md) | [Jason](Jason.md) | [Minh](Minh.md) | [Khoi](Khoi.md)
