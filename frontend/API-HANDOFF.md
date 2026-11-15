# Fan API handoff — Johnny to Jason

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

Account-wide application discovery on a new device/tab is not implemented. Coordinate a future `GET /me/applications` endpoint if needed; session storage is only a convenience, never authorization.

## Fixtures and checks

`fixtures.json` contains `scenarios` (event, user, application response triples) and HTTP `errors`. It includes 17 states plus examples for 401, 403, 409, and 429. Use these to compare actual backend output. `fixtures.mjs` is the source; regenerate JSON after editing it.

Johnny's checks cover pure state transitions and mocked live browser requests. Real authentication, API persistence, concurrent capacity handling, and phone calls still need integration testing with the actual services.
