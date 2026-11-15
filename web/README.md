# web — shared frontend

One Vite + React + TypeScript app for both audiences:

- **Staff dashboard** (Khoi) under `/admin` — built.
- **Fan pages** (Johnny) under `/`, `/sign-in`, `/events/:id`, `/applications/:id`, `/profile` — connected through the shared API adapter.

## Run it

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5189 --strictPort  # http://127.0.0.1:5189/ (fans), /admin (staff)
npm run test       # unit tests
npm run lint       # oxlint
npm run build      # type-check + production build
```

## Data source: fixtures or live

Set in `.env.local` (copy `.env.example`). The choice is made once at startup and there is **no fallback** between the two.

| `VITE_DATA_SOURCE` | Behavior |
|---|---|
| `fixtures` (explicit opt-in) | Sample data in this browser's `localStorage`. A yellow "Fixture mode" banner is always visible, with a control to simulate 401/403/409/500 and a reset link. Nothing is sent to a server. |
| `live` (default) | Calls the API at `VITE_API_BASE_URL`. Any failure is shown as an error; fixture data is never substituted. |

See the [live integration guide](INTEGRATION.md#run-with-the-local-backend) for local API setup, Mailpit sign-in, and browser verification.

## Staff routes

| Route | Screen |
|---|---|
| `/admin` | Event overview: counts, funnel, rates, review queue |
| `/admin/events/new`, `/admin/events/:id` | Event editor |
| `/admin/events/:id/interview` | Interview editor: save draft, publish version |
| `/admin/events/:id/applications` | Application list with filters and pagination |
| `/admin/applications/:id` | Application detail: Q&A with evidence, transcript, activity, decision |
| `/admin/insights` | Insights across events: turnout, show-up, returning fans, drop-off, stated interests, question skip rates, and rule-based suggestions for the next event |

Fixture examples: `/admin/applications/app_maya` (clean), `app_devon` (partial call), `app_priya` (extraction failed, transcript kept), `app_luis` (missed call), `app_sam` (no call, no activity).

Insights sample history: two past sample events, Fan Meetup Austin (Oct 2025) and Summer Watch Party Houston (Jun 2026), with attendance recorded. Maya, Jordan, Alex and Riley took part in them before applying to Community Night, so returning fans and "came back" have numbers. Because the backend lists every published event to fans, these past events also appear on the fan home page as closed. Older saved sample data gets them added automatically; "Reset sample data" also works.

Insights logic lives in `src/lib/insights.ts`: `buildInsights` produces the API report (the fixture uses it directly), and `eventSuggestions` / `retentionSuggestions` derive the suggestions in the browser. Everything is group-level; nothing scores or labels an individual fan, and no rate-based suggestion is made from fewer than 5 fans.

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
13. **New endpoint `GET /admin/insights`** (staff only, not built yet) → `InsightsReport` in `types.ts`. It is read-only and uses existing tables only:
    - per event: applied, interviewed (a completed call), ever invited (a `decisions` row with `invited`), accepted, attended (an `attendance` row in `activity_events`), plus returning applicants (applied to an event that started earlier)
    - stated interests from `interview_results.interests`, and answer completeness per question from `answers`
    - retention: for each past event followed by a later one, attendees and how many applied to a later event
    - `includesDemoData` when any counted record has `is_demo`

    Suggestions are not in the response; the UI derives them. `src/lib/insights.ts` has the reference calculation, and `api/fixtures/insights.test.ts` shows the expected numbers.

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

## Accounts are not reaching PostgreSQL

The default mode is now `live`. Development requests use `http://127.0.0.1:3001` unless overridden; production defaults to same-origin `/api`. Fixture mode must be explicitly selected with `VITE_DATA_SOURCE=fixtures` and intentionally stores accounts only in browser localStorage. Invalid mode names fail rather than silently enabling fixtures.

Check `web/.env.local` for an old `VITE_DATA_SOURCE=fixtures` setting. Change it to `live` and restart Vite (or rebuild deployed assets). Existing fixture accounts remain local and are not automatically imported as verified database accounts.

The backend requires populated `backend/.env` values from your own Tiger credentials, successful migrations, and a running API. See [backend setup](../backend/README.md). The local demo authenticates `@example.test` addresses using a magic link from Mailpit. Complete the link verification to create a verified account; then enter profile details. A disconnected backend is shown as an error, never replaced by browser-only signup.
