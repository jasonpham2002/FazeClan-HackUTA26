# Fan API handoff — Johnny to Jason

> This standalone prototype is retained for reference. The connected fan/staff app now lives in [web/](../web/README.md); its shared API contract and run instructions are in [web/INTEGRATION.md](../web/INTEGRATION.md). The two demo stores are separate.

Status: proposed contract for review. Fixtures are fictional. These endpoints are application APIs, not Muse/Chert provider endpoints.

## Authentication and transport

- Same-origin HTTPS frontend/API with cookie session authentication. Frontend uses `credentials: 'same-origin'`.
- `GET /me` returns `{id, profile: {name, email, phone}}`; unauthenticated returns HTTP 401. The UI shows sign-in rather than an application form when signed out.
- `signInUrl` is the existing server's auth/profile page. No fake authentication is implemented in live mode.
- Jason must confirm CSRF/session protections before exposing mutations. Add any required header/token in the central `request` helper rather than each component.
- Error response: `{ "error": { "code": "RATE_LIMITED", "message": "Please wait before trying again." } }` with the corresponding non-2xx HTTP status.
- Preserve ISO 8601 timestamps with timezone. Expiry is enforced by the server; browser checks are just immediate feedback.
- Requests time out after 15 seconds. Mutations are not automatically retried, since the original request might have succeeded. Users can refresh status before retrying.

## Routes and direct JSON responses

| Method and path | Request | Success |
|---|---|---|
| GET /api/events/:id | — | Event |
| GET /api/me | — | User |
| POST /api/events/:id/applications | `{consentVersion:'ai-interview-v1', consentAccepted:true}` | Application with ID |
| GET /api/applications/:id | — | Application owned by current user |
| POST /api/applications/:id/call | `{}` | 202 with callAttemptId or empty response; client refetches Application |
| POST /api/applications/:id/accept | `{}` | Success; client refetches Application |

Responses are direct objects rather than `{data: ...}` envelopes. Tell Johnny if the backend uses another shape; adapt `api.mjs` centrally.

### Event

```json
{
  "id": "evt_123",
  "title": "Off the screen.\nInto the community.",
  "name": "FaZe Community Night",
  "category": "COMMUNITY / IRL",
  "description": "Event description",
  "dateLabel": "Date to be announced",
  "location": "Venue to be confirmed",
  "status": "open",
  "applicationDeadline": null,
  "durationMinutes": 3
}
```

`status`: `open`, `closed`, or `full`. An elapsed `applicationDeadline` also disables applications. Presentation labels can later be derived from ISO event times with explicit timezone; do not silently reinterpret an event's timezone.

### Application

```json
{
  "id": "app_123",
  "eventId": "evt_123",
  "profile": { "phone": "+12025550123" },
  "status": "interview_pending",
  "call": { "status": "completed", "processingStatus": "pending" },
  "invitation": { "expiresAt": null, "capacityAvailable": true }
}
```

- Application statuses: `interview_pending`, `review_pending`, `invited`, `waitlisted`, `accepted`.
- `call` is null until an attempt exists. Call statuses: `queued`, `dialing`, `connected`, `completed`, `missed`, `failed`, `canceled`.
- `processingStatus`: `pending`, `ready`, `failed`, independent of media connection/completion.
- `profile.phone` must be an actual normalized destination supplied by the server. Missing/invalid numbers block the call button. Never substitute a placeholder as a dialable number.
- `invitation` is relevant for `invited`; expiry or `capacityAvailable:false` disables acceptance. The server must recheck capacity atomically because availability can change after rendering.

## Frontend behavior and backend requirements

1. Fetch public event and authenticated user. On 401 from `/me`, show sign-in.
2. Submit consent using the authenticated user; no client-controlled applicant ID or phone override.
3. Store only application ID in tab-scoped session storage under `faze.applicationId:<eventId>`; restore it on reload.
4. A stale application ID returning 403/404 is cleared; it must never reveal another user's profile.
5. Require destination confirmation before requesting a call. Backend independently checks consent, recipient verification/allowlist, retry eligibility, and one active call per application.
6. Poll every three seconds while application page is visible and call/processing/review is pending. Stop on terminal decisions or processing failure. Pause after errors and provide Refresh status.
7. Treat missed/failed/canceled calls as retryable while application remains interview pending. Staff decision is independent of call failure.
8. Invite/Waitlist comes from Khoi's authenticated staff UI via the backend. Fan pages cannot issue staff decisions.
9. Accept invitation only when active, unexpired, and capacity available; handle HTTP 409 if state changed.

Account-wide discovery is implemented behind the optional `applicationHistory` flag. Enable it only after the filtered applications endpoint below is ready. Session storage remains a convenience, never authorization.

## Fixtures and checks

`fixtures.json` contains `scenarios` (event, user, application response triples) and HTTP `errors`. It includes 18 states plus examples for 401, 403, 409, and 429. Use these to compare actual backend output. `fixtures.mjs` is the source; regenerate JSON after editing it.

Johnny's checks cover pure state transitions and mocked live browser requests. Real authentication, API persistence, concurrent capacity handling, and phone calls still need integration testing with the actual services.

## Optional profile/history endpoints

Default public configuration:

```js
features: { applicationHistory: false, activityHistory: false }
```

The frontend does not request these endpoints until the corresponding feature is enabled. In the meantime the profile shows its known current application and an unavailable-history message, not invented history.

| Endpoint | Purpose | JSON response |
|---|---|---|
| GET /api/me/applications | First page of current user's applications, newest first | `{items:[ApplicationSummary],nextCursor:null}` |
| GET /api/me/applications?eventId=... | Discover application for current configured event on a new tab/device | Same envelope; at most one record because user/event is unique |
| GET /api/me/applications?cursor=... | Subsequent page, opaque cursor | Same envelope |
| GET /api/me/activity | First page of current user's recorded activity, newest first | `{items:[Activity],nextCursor:null}` |
| GET /api/me/activity?cursor=... | Subsequent activity page | Same envelope |

ApplicationSummary fields: `id`, `eventId`, `eventName`, `status`, `submittedAt` (ISO timestamp). For current-event discovery, the frontend uses the ID to fetch full details at `/applications/:id` before displaying call controls. It ignores records for other event IDs. Pagination deduplicates by record ID.

Activity example:

```json
{
  "id": "activity_123",
  "type": "invitation_accepted",
  "eventName": "Community Night",
  "timestamp": "2026-11-14T18:00:00Z",
  "source": "platform",
  "synthetic": false
}
```

Recognized activity types: `application_submitted`, `call_requested`, `interview_completed`, `invitation_issued`, `invitation_accepted`, `attendance_confirmed`. Unknown types display a neutral Activity recorded label. Use `attendance_confirmed` only from explicit check-in evidence, not inferred from acceptance. Demo records have `synthetic:true`; production records should never silently inherit seeded history.

Each collection item requires a string `id`; `nextCursor` is an opaque string or null. Enforce current-user ownership server-side; never accept another user's ID as a history filter. History sections fail independently, retain previous pages on errors, and offer retry. An auth failure clears profile data and shows sign-in.
