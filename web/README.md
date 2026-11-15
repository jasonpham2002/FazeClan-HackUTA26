# web — shared frontend

One Vite + React + TypeScript app for both audiences:

- **Staff dashboard** (Khoi) under `/admin` — built.
- **Fan pages** (Minh) under `/`, `/sign-in`, `/events/:id`, `/applications/:id`, `/profile` — not built; `src/fan/FanPlaceholder.tsx` is a stand-in to replace.

## Run it

```bash
npm ci
npm run dev -- --port 5189 --strictPort  # http://localhost:5189/ (fans), /admin (staff)
npm run test       # unit tests
npm run build      # type-check + production build
```

## Data source: fixtures or live

Set in `.env.local` (copy `.env.example`). The choice is made once at startup and there is **no fallback** between the two.

| `VITE_DATA_SOURCE` | Behavior |
|---|---|
| `fixtures` (default) | Sample data in this browser's `localStorage`. A yellow "Fixture mode" banner is always visible, with a control to simulate 401/403/409/500 and a reset link. Nothing is sent to a server. |
| `live` | Calls the API at `VITE_API_BASE_URL`. Any failure is shown as an error; fixture data is never substituted. |

Live mode has only been checked against a missing backend (it shows a network error). **It has not been run against a real API**, because none exists yet.

## Staff routes

| Route | Screen |
|---|---|
| `/admin` | Event overview: counts, funnel, rates, review queue |
| `/admin/events/new`, `/admin/events/:id` | Event editor |
| `/admin/events/:id/interview` | Interview editor: save draft, publish version |
| `/admin/events/:id/applications` | Application list with filters and pagination |
| `/admin/applications/:id` | Application detail: Q&A with evidence, transcript, activity, decision |

Fixture examples: `/admin/applications/app_maya` (clean), `app_devon` (partial call), `app_priya` (extraction failed, transcript kept), `app_luis` (missed call), `app_sam` (no call, no activity).

## Layout

```text
src/
  styles/tokens.css      shared colors and font (Tailwind theme tokens)
  components/ui/         shared presentational components
  api/types.ts           every API contract, in one place
  api/client.ts          ApiClient interface + ApiError
  api/http.ts            live adapter
  api/fixtures/          fixture adapter + seed data
  lib/                   interview validation/reordering, rates, dates
  admin/                 staff pages and components
  fan/                   Johnny's fan pages
```

### For Johnny: shared pieces

- `styles/tokens.css` — values from the FaZe brand toolkit: Black `#111111`, Red Alert `#E4002B`, white, with Anton for titles and Source Sans Pro for text (both self-hosted from `src/assets/fonts`).
  - Color utilities: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `border-border-strong`, `text-text`, `text-muted`, `text-subtle`, `bg-accent`, `text-ok|warn|danger|info`.
  - Type utilities: `title-display` (page titles, Anton uppercase), `figure` (counts), `heading-section`.
  - Red Alert is for primary actions and the current selection only. Errors use a separate orange so they never read as branding.
- `assets/brand/faze-logo-on-dark.png` — the toolkit's dark-background logo, scaled down and otherwise unmodified. Brand rules: never below 40px wide, keep clear space around it, do not recolor, outline, skew or rotate it.
- `components/ui/ui.tsx` — `Button` (with optional `icon`), `Badge` (status dot + label), `Tag`, `Card` (raised panel; never nest), `Section` (flat heading + rule), `Field`, `inputClass`, `linkClass`, `linkButtonClass`, `Notice`, `LoadingState` (skeleton), `EmptyState`, `ErrorState`.
- `components/ui/Icon.tsx` — one small stroke-icon set; add paths there rather than using emoji or arrow characters.
- `components/ui/StatusBadge.tsx` — one label per application / call / processing / decision status, so both sides word statuses the same way. The fan-facing copy in Minh.md differs for call statuses; add fan labels there rather than editing the staff ones.
- `api/` — add the fan endpoints to `ApiClient`, `http.ts` and the fixture adapter; types go in `types.ts`.
- Add fan routes in `src/App.tsx` next to the marked comment. The fixture banner is rendered once, above all routes.

## Contracts to confirm

`src/api/types.ts` marks each shape `FROM DOCS` (copied from the assignment files) or `CONFIRM` (proposed here, not agreed). Screens refetch after every write, so they do not depend on what a POST/PUT/PATCH returns.

### Jason

1. **Two endpoints the dashboard needs that are not in the endpoint tables:** `GET /admin/events` (all events including drafts) and `GET /admin/events/:id`.
2. **Session mechanism.** `http.ts` assumes a cookie session (`credentials: 'include'`), which also needs CORS with credentials if the API is on another origin.
3. **`GET /me`** fields: `id`, `email`, `displayName`, `role` (`fan` | `staff`).
4. **Event fields**: `title`, `description`, `location`, `startsAt`, `timezone`, `capacity`, `applicationDeadline`, `publicationStatus` (`draft` | `published`). `timezone` (IANA name) is not in the events table in Jason.md.
5. **`GET /admin/events/:id/interview`** → `{ eventId, draft, draftUpdatedAt, published: { versionId, versionNumber, publishedAt } | null, hasUnpublishedChanges }`. Publish takes no body and publishes the saved draft.
6. **`GET /admin/applications`**: extra query params `callStatus`, `page`, `pageSize`; response `{ items, page, pageSize, total }`; row fields in `ApplicationListItem`.
7. **`GET /admin/applications/:id`** → `ApplicationDetail`: includes the pinned version's full config, `selectedAttemptId`, `attempts`, `result`, `transcript`, `activity`, `pastApplications`, `decision`, `decisionHistory`, and `capacity: { capacity, invited, accepted }`.
8. **Processing status values**: `pending` | `ready` | `failed`, per call attempt.
9. **Decision**: body `{ decision: 'invite' | 'waitlist', reason? }`. What should happen when a decision is changed after the applicant accepted? The fixture returns 409.
10. **Analytics** → counts plus `connectionRate` and `completionRate` as `{ numerator, denominator }` so the UI can state the denominator and show an em dash on zero.
11. **Activity `type` values**: `application` | `invitation_accepted` | `attendance`.
12. **Validation limits** (also Johnny): 1–6 questions, nonempty prompts, duration 60–300 s, follow-ups 0–2. Enforced client-side in `lib/interviewConfig.ts`; the server must enforce the same.

### Minh and Tuong (AI call team)

1. **Transcript `speaker` values**: the UI expects `agent` | `applicant`.
2. **`transcriptSegmentIds`** must be the IDs of segments returned in the application's transcript. A missing ID is shown as a warning, not hidden.
3. **Result fixture** (due hour six): the seed in `api/fixtures/seed.ts` follows the shape in Johnny.md; swap in a real sample when available.
4. **Partial calls**: questions never reached should come back as `not_asked` with an empty summary and no segment IDs.

## What the UI guarantees

- A decision, draft, publication or event is shown as saved only after it is read back from the API. Failures say "not saved".
- Transcript and model text are rendered as plain text, never as HTML.
- Missing answers, missing evidence, failed extraction, partial calls and unpublished drafts each have a visible state.
- No score or ranking of applicants. Rates with a zero denominator show an em dash.

## Connected integration

Fan and staff fixture changes now synchronize in the same tab and across tabs. See [INTEGRATION.md](INTEGRATION.md) for the end-to-end demo, shared fan endpoint contracts, intentional differences from the older standalone frontend, and remaining live-backend work. The staff branch is preserved; the prior standalone `frontend/` is retained as a reference, not the connected entry point.
