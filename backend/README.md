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

In a second terminal, start the worker with `npm run worker`. `GET http://127.0.0.1:3001/health` checks database connectivity and engagement schema readiness. Restart the worker with the same configuration after a failure. Its database lease lets another process reclaim an incomplete fixture job after the lease expires.

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
| `POST /admin/events` · `PATCH /admin/events/:id` | Create with `{title,description,location,startsAt,deadline,capacity,status?,timezone?,minimumPoints?}` or patch these fields (`capacity` in `1..100000`, `status` is `draft` or `published`). Initializes a default interview draft on create, and automatically publishes interview version 1 when `status` is `published` and no version exists yet. |
| `GET /admin/events/:id/interview` · `PUT /admin/events/:id/interview-draft` | Return `{draft,draftUpdatedAt,publishedVersion,hasUnpublishedChanges}`, falling back to the default interview draft when `events.draft` is null. Save `{intro,tone,maxDurationSeconds,questions}` where each question is `{id,prompt,purpose,required,order,maxFollowUps}`. Limit to 1–6 questions, 60–300 seconds, and 0–2 follow-ups per question. |
| `POST /admin/events/:id/interview-publish` | Creates a new version from the saved draft (or falls back to the default interview draft when `events.draft` is null) and returns `{id,version,publishedAt}`. Existing applications retain their original version. |
| `GET /admin/applications` | `{applications,total,page,pageSize}`. Filter by `eventId`, application `status`, latest `callStatus`, and `search`. Use `page` and `pageSize` for pagination. |
| `GET /admin/applications/:id` | `{application,fan,event,interview,attempts,selectedAttemptId,transcript,answers,result,activity,decisions}`. The selected attempt provides the transcript and result. |
| `POST /admin/applications/:id/decision` | `{decision:"invited"\|"waitlisted",reason?}`. Returns `{id,decision,reviewerId,reason,createdAt}`. |
| `POST /admin/applications/:id/attendance` | Marks an `accepted` application as attended (`{recorded:true}`). Repeating the request is idempotent. Returns `409 ATTENDANCE_UNAVAILABLE` if the application is not `accepted`. |
| `GET /admin/events/:id/analytics` | `{applications,callsAttempted,callsConnected,interviewsCompleted,reviewsPending,invitationsIssued,accepted,connectionRate,interviewCompletionRate}`. Connection rate divides connected attempts by attempted calls. Completion rate divides completed interviews by connected attempts. Zero denominators return `null`. |
| `GET /admin/insights` | `{generatedAt,includesDemoData,events,retention}`. Group-level funnel, demand, show-up, fill, new/returning audience, drop-off, top interview interests, question completeness, and attendance cohorts across events. |

Call status progresses from `queued` to `dialing` to `connected` to `completed`, with terminal outcomes `missed`, `failed`, and `canceled` where applicable. Processing status is independent (`pending`, `ready`, or `failed`). Show the stored transcript even if extraction failed. New fans see only activity actually recorded by this application.

## Predictions, points, and rewards

Migrations `006_engagement.sql`, `007_engagement_compat.sql`, and `008_engagement_ui_compat.sql` add the engagement tables, reward compatibility fields (`description`, concept reward costs, `merch` kind, optional `stock`, and `requested` redemption status), and a zero-default `minimumPoints` field for events. `npm run seed` seeds `Sample FaZe merch` alongside the demo users and `Community Night` event. Apply migrations with the normal runner. Use the existing development connection to rehearse in a disposable `faze_test_*` schema. The backend test suite creates a labeled CS2 replay and a 50-point event there, then drops the schema.

### Esports data handoff

Publish these views in the app schema over Johnny's imported records. Cast IDs to text and keep them stable across reimports. The team arrays are JSONB arrays of `{ id, label }` objects with distinct team IDs. Match winner requires exactly two participants.

| View | Columns |
| --- | --- |
| `engagement_players` | `id text` |
| `engagement_matches` | `id text`, `title text`, `starts_at timestamptz`, `participants jsonb`, `is_demo boolean` |
| `engagement_tournaments` | `id text`, `title text`, `teams jsonb`, `is_demo boolean` |

Johnny's migration and these views must be available before creating sourced markets or new follows. Those operations return `503 ESPORTS_DATA_UNAVAILABLE` if the corresponding view is missing. Existing markets carry their own title, options, and deadline. They continue to work across import refreshes. Adjusting a match start in the import leaves its existing market deadline in place.

### Fan and staff API

| Endpoint | Request or response |
| --- | --- |
| `GET /me/follows` | `{ playerIds, follows }` for the signed-in fan. |
| `PUT /me/follows/:playerId`, `DELETE /me/follows/:playerId` | No body. Both return `204` and are idempotent. |
| `GET /predictions/markets` | Public catalog `{ markets }` (sets `myPick` when signed in as a fan). Each market includes `id`, `kind`, `type`, `referenceId`, `matchId`, `tournamentId`, `teamId`, `title`, `options`, `locksAt`, `awardPoints`, `award`, `isDemo`, `status`/`state` (`open`, `locked`, `settled`, `void`), `myPick`, and `result`. Pick and result are null before they exist (and `result` is null when voided). |
| `POST /predictions/markets/:id/pick` | `{ "optionId": "first" }`. Returns `201` with `{ optionId, submittedAt }`. The first pick is final. |
| `POST /admin/prediction-markets` | Sourced (`{ kind, referenceId, teamId?, locksAt, awardPoints? }`) or direct (`{ type, title, matchId, tournamentId, options, locksAt, award }`). `awardPoints` / `award` defaults to 100. `locksAt` is ISO 8601 with a time zone and must be in the future. Match winner sourced markets must lock by match start. |
| `GET /admin/prediction-markets`, `GET /admin/prediction-markets/:id/picks` | `{ markets }` (with `pickCount`, `picksByOption`, `createdBy`, and `reviewerId`) and `{ picks, total, page, pageSize }`. |
| `POST /admin/prediction-markets/:id/settle` | `{ optionId, sourceUrl }`. Set `optionId` to null for a void. Staff submits an HTTP(S) result source to settle an open or locked market (settling an open market closes picks immediately). Returns `{ optionId, sourceUrl, settledAt, reviewerId }`. Identical retries return the saved result. |
| `GET /me/points`, `GET /admin/users/:id/points` | `{ balance, entries, total, page, pageSize }`. Entries include `id`, `delta`, `reason`, `sourceType`, `sourceId`, and `createdAt`. Staff also sees `reviewerId`. Pagination defaults to page 1 and size 25, maximum size 100. |
| `POST /admin/users/:id/point-adjustments` | `{ delta, reason, idempotencyKey? }` (or `Idempotency-Key` header; generates a key if omitted). The key is a UUID. Returns the saved entry, with `201` on creation and `200` on replay. |
| `GET /rewards`, `GET /admin/rewards` | Public catalog (`GET /rewards`) or full admin catalog (`GET /admin/rewards`) with `id`, `title`, `description`, `kind`, `terms`, `pointCost`, `cost`, `stock`, `active`, `isDemo`, and `redeemable`. |
| `POST /admin/rewards`, `PATCH /admin/rewards/:id` | Create with `kind` (`merch` / `merchandise`, normalized to `merch`, `raffle`, `early_access`, `priority`), `title`, optional `description` & `terms`, plus `pointCost`/`cost` (required for `merch`) and optional `stock` (`null` means not stock-limited). `active` and `isDemo` default to true on creation. Patch any of these fields. Returns the saved reward. |
| `POST /rewards/:id/redeem` | `{ idempotencyKey }` or `Idempotency-Key` HTTP header with a UUID. Returns `{ id, rewardId, rewardTitle, pointCost, cost, status, createdAt }` (`status` starts as `'requested'`) with `201` on creation and `200` on replay. Reuse the same key for retries of one claim. |
| `GET /me/redemptions`, `GET /admin/redemptions`, `GET /admin/rewards/:id/redemptions` | `{ redemptions }` with saved claims (`rewardTitle`, `pointCost`, `cost`, `status` in `'requested' \| 'fulfilled' \| 'canceled'`). Staff routes include `userId` and `fan: { id, displayName, email }`. |

For the demo, create `{ "kind": "merch", "title": "Sample FaZe merch", "terms": "Proposed demo benefit", "pointCost": 50, "stock": 10 }`. Set `minimumPoints: 50` on a published demo event. A 100-point win funds the claim and leaves 50 points for eligibility. Successful applications and interviews leave the balance alone. Staff-confirmed new attendance adds 25 points.

Errors use `{ error: { code, message } }`. Handle `400 INVALID_OPTION`, `409 MARKET_LOCKED`, `409 DUPLICATE_PICK`, `409 SETTLEMENT_CONFLICT`, `409 INSUFFICIENT_POINTS`, `409 REWARD_OUT_OF_STOCK`, `409 REWARD_UNAVAILABLE`, `409 IDEMPOTENCY_CONFLICT`, and `409 INSUFFICIENT_EVENT_POINTS` distinctly. After a successful write, refetch the affected resources. Web fixture and live clients should return the same shapes. A live request failure should display its error.

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

## Database troubleshooting

- The real API requires a populated `backend/.env`; `.env.example` contains blank placeholders, not credentials. Supply `DATABASE_URL`, separate auth/ingestion secrets, and any required CA file using your local credential source. Never commit these values.
- A yellow Fixture mode banner means the frontend uses browser localStorage and will not send sign-ups to PostgreSQL. Use `VITE_DATA_SOURCE=live`, the API base URL, and restart Vite. Complete the email magic link before expecting a verified user account. The local auth service permits `@example.test` accounts.
- `GET /health` returns `503 DATABASE_UNAVAILABLE` if the database query fails and `503 SCHEMA_NOT_READY` if the engagement tables are missing. Run `npm run migrate` before starting a new release. An empty development database also needs `npm run seed` to add the demo reviewer and event.
- Database objects are in the `faze` schema, not necessarily `public`. Query `SELECT id,email,role FROM faze."user"` in your database console after verifying sign-in. Confirm the console and API use the same service/database/schema.
- Migration checksums now normalize LF/CRLF line endings and accept historical checksums from either platform. The migration runner updates only recognized line-ending variants to the canonical hash; actual SQL changes still fail. Do not edit applied migration SQL to bypass an error.
- Backend tests default to disposable `faze_test_*` schemas. They are not expected to add accounts to the shared `faze` schema. Do not set `TEST_SCHEMA=faze` for a routine test run.

## Sourced CS2 player data

The first real, source-attributed roster/stat bundle and dry-run/import instructions are in [data/README.md](data/README.md). Migration 010 adds the player/snapshot tables. Public read endpoints are `/players`, `/players/:id`, and `/players/:id/stats`. Source snapshots may be cached and are not a live feed; keep their period/freshness metadata visible.
