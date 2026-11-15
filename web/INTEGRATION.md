# Connected fan and staff platform

`web/` is now the shared frontend. Khoi's staff dashboard and Johnny's fan pages use the same router, UI components, typed API interface, and fixture database. The earlier standalone `frontend/` remains intact as a reference; it does not synchronize with `web/` and is not the connected demo entry point.

## Run the connected demo

From the repository root on Windows:

```powershell
cd web
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

Open http://127.0.0.1:5189. On other platforms use `npm` instead of `npm.cmd`. Source mode defaults to explicitly labeled fixtures; no backend is required.

1. Open the event and submit an application with consent. Use the demo profile; `/sign-in` only changes its fictional details.
2. Confirm the destination and select **Simulate call request**.
3. Select **Simulate completed interview** to create clearly synthetic Q&A. **Simulate missed call** also supports retries.
4. Open **Review in staff dashboard**. This is the same application ID and pinned interview version, not a separate sample.
5. Choose Invite or Waitlist and save the staff decision.
6. Return to the fan application. An invitation can be accepted; staff status and acceptance counts update.

Fan and staff tabs synchronize through the shared fixture storage key and query invalidation. A page reload retains fixture state. The banner's Reset sample data control clears the store. This persistence is for fictional demonstration data, not production storage or authentication.

The fixture has two explicitly simulated personas: Demo Staff for staff pages and Demo Fan for fan pages. This is not a role-switching authentication implementation. Live sessions use `/me` and server authorization.

## Connected routes

| Fan | Staff |
|---|---|
| `/` — published events | `/admin` — event overview |
| `/events/:id` — event/application | `/admin/events/:id` — edit event |
| `/applications/:id` — call readiness and decision | `/admin/applications/:id` — Q&A and Invite/Waitlist |
| `/profile` — own applications and activity | `/admin/events/:id/applications` — review queue |
| `/sign-in` — demo profile or real-auth handoff | `/admin/events/:id/interview` — draft/publish questions |

New applications pin the latest published interview. Draft edits do not change existing applications. A simulated completion uses the application's pinned questions and writes synthetic answers with valid transcript references into the staff dashboard.

## Jason: shared API contract

Use `src/api/types.ts`, `src/api/client.ts`, and `src/api/http.ts` as the combined frontend contract. `frontend/API-HANDOFF.md` describes the older standalone prototype, whose shapes differ. Reconcile here before connecting a real server.

Set `VITE_DATA_SOURCE=live` and `VITE_API_BASE_URL` in `.env.local`. For same-origin hosting, `/api` is a suitable base if the reverse proxy forwards it. For a separate backend origin, configure credentialed CORS. Confirm CSRF/session protections before exposing authenticated writes. Use `VITE_SIGN_IN_URL` for the backend's real sign-in/profile URL. Vite variables are public; no credentials or provider keys belong in them.

Fan endpoints added to the existing staff adapter:

| Method/path (relative to API base) | Body | Direct JSON success shape |
|---|---|---|
| GET /me | — | `Me`: id, email, displayName, role, optional phone |
| GET /events | — | `EventRecord[]`, published events only |
| GET /events/:id | — | `EventRecord` |
| GET /me/applications | — | `FanApplication[]`, current user's applications |
| GET /applications/:id | — | `FanApplication`, owned by current user |
| POST /events/:id/applications | `{consentVersion:'ai-interview-v1',consentAccepted:true}` | `{id}` |
| POST /applications/:id/call | `{}` | Any successful JSON/empty response; client refetches |
| POST /applications/:id/accept | `{}` | Any successful JSON/empty response; client refetches |
| GET /me/activity | — | `ActivityEvent[]`, current user's sourced activity |

Collection responses in this shared prototype are **direct arrays**. Staff application lists retain Khoi's existing `{items,page,pageSize,total}` envelope. If fan history must be paginated, agree the response and update the central adapter/screens; the standalone cursor envelope is not silently accepted here.

Key differences from the standalone prototype:

- `Me` has top-level displayName/email/phone rather than a nested profile.
- Event uses `title`, `startsAt`, `timezone`, `publicationStatus` and `applicationDeadline` from Khoi's event editor.
- `FanApplication` embeds the event, fan-safe profile, latest call, pinned version metadata, and optional invitation state. It deliberately excludes transcripts, private staff reasons, and review notes.
- Activity uses `eventTitle`, `isDemo`, and types `application`, `invitation_accepted`, `attendance`, matching the dashboard.
- Current applications are discovered from `/me/applications`; a new tab does not rely on a remembered application ID.

Backend must independently enforce ownership, role permissions, normalized/verified or allowlisted recipients, consent, published/closed event rules, application uniqueness, one active call, invitation expiry/capacity, immutable question versions, and concurrent decision/acceptance consistency. Client-side checks and the fixture store are not security controls.

`setFixtureFan` and `simulateFanCall` are explicitly fixture-only interface methods; their live implementations reject without sending any request. Minh and Tuong's real agent integration still belongs behind the backend's call endpoint. No real FaceTime/Muse call is implemented by this merge.

## Verification

```powershell
npm.cmd test
npm.cmd run build
```

The fixture integration suite checks a new fan application appearing in the staff list, question version pinning, missed-call retry, synthetic transcript evidence, private-note exclusion, ownership, staff decisions, acceptance counts, capacity conflicts, and persistence through an older-store upgrade.

Optional browser regression (Playwright installed separately; start Vite on 5189 first):

```powershell
$env:PLAYWRIGHT_MODULE = 'absolute/path/to/playwright/index.mjs'
$env:BROWSER_CHANNEL = 'chrome'
node scripts/connected-smoke.mjs
```

Verified in headless Chrome: the complete flow across separate fan/staff tabs without manually reloading, persistence after reload, and fan layouts at 320, 390, 768, and 1440px. Live backend, real authentication, and actual iPhone calls remain unverified.
