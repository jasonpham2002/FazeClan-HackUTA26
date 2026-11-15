# Local backend

The API and interview worker run on your Mac and share the `faze` schema in the `fazeclan-hackuta` Tiger Cloud development database. The call fixture runs the interview workflow with synthetic data. `mode: "fixture"` identifies it in API responses. It generates local transcript events and never dials the phone on the fan profile.

## Run locally

Use Node.js 24 or newer and start a loopback Mailpit inbox. Install Mailpit with `brew install mailpit` if the binary is missing. If it was downloaded into `backend/.local/bin`, run `./.local/bin/mailpit` from `backend/` with the same options. [Mailpit options](https://mailpit.axllent.org/docs/configuration/runtime-options/)

```sh
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025
```

From `backend/`, install the locked dependencies and create the ignored local config.

```sh
npm ci
cp -n .env.example .env
```

In `.env`, set `DATABASE_URL` to the value of `TIMESCALE_SERVICE_URL` from the existing `tiger-cloud-fazeclan-hackuta-credentials.env` file. Generate separate values for `BETTER_AUTH_SECRET` and `AGENT_INGEST_TOKEN` with `openssl rand -hex 32`. The API and worker must use the same ingestion token. Keep the database URL, auth secrets, agent token, and captured links in local configuration and Mailpit.

The backend verifies the database certificate and hostname. If your Tiger service uses a private CA, store its verified CA certificate in `.local/tiger-cloud-ca.pem` and set `DATABASE_CA_FILE=.local/tiger-cloud-ca.pem` in `.env`. Leave the variable blank for services using a publicly trusted CA. [Tiger Cloud certificate setup](https://d1ovb29l12vjqm.cloudfront.net/use-timescale/latest/security/strict-ssl/)

```sh
npm run migrate
npm run seed
npm start
```

In a second terminal, start the worker with `npm run worker`. `GET http://127.0.0.1:3001/health` checks the database and returns `503` when unavailable. Restart the worker with the same configuration after a failure. Its database lease lets another process reclaim an incomplete fixture job after the lease expires.

To exercise the flow, sign in as `staff@example.test` or `fan@example.test` and open the one-time link in the inbox at `http://127.0.0.1:8025`. `invited@example.test` and `waitlisted@example.test` are seeded invitation examples. The seed provides one upcoming event and four published questions. `npm run cleanup` removes the seeded profiles that can safely be removed and deletes the seed event once unrelated records no longer reference it.

## Frontend contract

Use `http://127.0.0.1:3001`. The shared fan and staff frontend uses `http://127.0.0.1:5189`. The separate dev origins on ports 3000 and 3002 are also allowed by default. Use the same hostname for auth, the API, and the frontend. Browser requests send cookies with `credentials: 'include'`. App endpoints return JSON directly, with IDs as strings and timestamps in UTC ISO 8601. Errors use `{ "error": { "code": "EVENT_FULL", "message": "..." } }`. The auth routes use Better Auth's response format.

| Request | Body or response |
|---|---|
| `POST /api/auth/sign-in/magic-link` | `{email, name, callbackURL?}`. Pass a trusted frontend URL as `callbackURL` to return there after opening the link from Mailpit. |
| `POST /api/auth/sign-out` | Ends the current session. |
| `GET /me` · `PATCH /me` | Profile `{id,email,displayName,phone,role,emailVerified,phoneVerifiedAt}`. Patch `displayName` or `phone` (`null` or E.164). Updating a phone does not verify its ownership. |
| `GET /events` · `GET /events/:id` | List `{events}` and event detail `{id,title,description,location,startsAt,deadline,capacity,timezone,status,isDemo,remainingCapacity,applicationId}`. The current fan's `applicationId` is included when applicable. |
| `POST /events/:id/applications` | `{consentVersion:"ai-interview-v1",consentAccepted:true}`. First submission returns `201` and repeats return `200` with the original application. |
| `GET /applications/:id` · `GET /me/applications` | Owner's application or `{applications}` with `eventTitle` on each row for the signed-in `fan` or `staff` user. An application has `{id,userId,eventId,interviewVersionId,status,submittedAt,acceptedAt,latestAttempt,decision}`. |
| `GET /me/activity` | `{activity}` for the signed-in user. Seeded history has `isDemo: true`. |
| `POST /applications/:id/call` | `202 {callAttemptId,mode}`. While an attempt is active, repeating the request returns its original ID. Poll the application for status. |
| `POST /applications/:id/accept` | Accept the current invitation. Returns the application on success, including repeats. `409 EVENT_FULL` means no seats remain. |
| `GET /admin/events` · `GET /admin/events/:id` | `{events}` or a single event, including drafts. |
| `POST /admin/events` · `PATCH /admin/events/:id` | Create with `{title,description,location,startsAt,deadline,capacity,status?,timezone?}` or patch these fields (`capacity` in `1..100000`, `status` is `draft` or `published`). Initializes a default interview draft on create, and automatically publishes interview version 1 when `status` is `published` and no version exists yet. |
| `GET /admin/events/:id/interview` · `PUT /admin/events/:id/interview-draft` | Return `{draft,draftUpdatedAt,publishedVersion,hasUnpublishedChanges}`, falling back to the default interview draft when `events.draft` is null. Save `{intro,tone,maxDurationSeconds,questions}` where each question is `{id,prompt,purpose,required,order,maxFollowUps}`. Limit to 1–6 questions, 60–300 seconds, and 0–2 follow-ups per question. |
| `POST /admin/events/:id/interview-publish` | Creates a new version from the saved draft (or falls back to the default interview draft when `events.draft` is null) and returns `{id,version,publishedAt}`. Existing applications retain their original version. |
| `GET /admin/applications` | `{applications,total,page,pageSize}`. Filter by `eventId`, application `status`, latest `callStatus`, and `search`. Use `page` and `pageSize` for pagination. |
| `GET /admin/applications/:id` | `{application,fan,event,interview,attempts,selectedAttemptId,transcript,answers,result,activity,decisions}`. The selected attempt provides the transcript and result. |
| `POST /admin/applications/:id/decision` | `{decision:"invited"\|"waitlisted",reason?}`. Returns `{id,decision,reviewerId,reason,createdAt}`. |
| `POST /admin/applications/:id/attendance` | Marks an `accepted` application as attended (`{recorded:true}`). Repeating the request is idempotent. Returns `409 ATTENDANCE_UNAVAILABLE` if the application is not `accepted`. |
| `GET /admin/events/:id/analytics` | `{applications,callsAttempted,callsConnected,interviewsCompleted,reviewsPending,invitationsIssued,accepted,connectionRate,interviewCompletionRate}`. Connection rate divides connected attempts by attempted calls. Completion rate divides completed interviews by connected attempts. Zero denominators return `null`. |

Call status progresses from `queued` to `dialing` to `connected` to `completed`, with terminal outcomes `missed`, `failed`, and `canceled` where applicable. Processing status is independent (`pending`, `ready`, or `failed`). Show the stored transcript even if extraction failed. New fans see only activity actually recorded by this application.

## Agent ingestion contract

Send events to `POST /internal/interviews/events` with `Authorization: Bearer <agent token>`. Each payload has `type`, `eventId`, and `callAttemptId`. Reuse the exact ID and payload on retry. A duplicate succeeds with `{accepted:true,duplicate:true}`. Reusing the ID with a different payload fails. Fixture attempts also require the worker's current `X-Job-Lease` header.

| `type` | Additional fields |
|---|---|
| `call_status` | `status` (`dialing`, `connected`, `completed`, `missed`, `failed`, or `canceled`), `timestamp`, and optional `failureCode`. |
| `transcript` | `sequence` (nonnegative integer), `speaker` (`agent` or `applicant`), `text`, and `timestamp`. The `eventId` is also the transcript segment ID. |
| `result` | `schemaVersion: 1`, `interviewVersionId`, `summary`, `interests`, `answers`, `unansweredQuestionIds`, and `reviewNotes`. An answer is `{questionId,summary,transcriptSegmentIds,completeness}`. Completeness is `answered`, `partial`, `skipped`, or `not_asked`. |
| `processing_error` | `failureCode`. Retains evidence already received, so extraction can be retried using a new result event. |

Result question IDs must belong to the pinned interview version and segment IDs must belong to the same attempt. Send the transcript segments before the result that references them. The review response orders transcript entries by sequence.

The local worker runs sample interviews. Coordinate the Muse agent handoff with Minh and Tuong through the authenticated ingestion endpoint.

## Verify

`npm test` uses a disposable `faze_test_*` schema, captures the email delivery in memory, and exercises the real magic-link and worker ingestion routes. It drops the disposable schema after the run. To test actual SMTP delivery, keep Mailpit running on the loopback ports above and use `TEST_SMTP=1 npm test`. For a development-schema rehearsal, stop the regular worker and run `TEST_SCHEMA=faze TEST_SMTP=1 npm test`. That run targets `faze`, retains the seed data, and removes the event and fan accounts created by the test. Set `TEST_PORT` if the test API cannot use port `3011`.
