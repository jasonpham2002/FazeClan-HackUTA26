# Fan platform — Johnny

The fan experience covers event details, application, interview readiness, call status, staff decision, and invitation acceptance. Minh and Tuong own the real AI/call service; Jason owns authentication and persistence; Khoi owns the staff dashboard.

## Preview

From the repository root:

```powershell
python frontend/serve.py
```

Open **http://127.0.0.1:5187**. To choose another port, run `python frontend/serve.py --port 5188`.

Use this preview server instead of opening `index.html` directly. It explicitly sets JavaScript module MIME types, which Windows registry settings can otherwise override. It serves this frontend directory regardless of the working directory, binds only to loopback, and disables caching. It is for local development, not production hosting.

No npm install/build is required to run the site. Google Fonts are optional; system fallbacks work offline. Artwork is CSS.

## Demo mode

`config.js` defaults to `mode: 'demo'`. No account, real call, transcript, or real invitation is created. All data is fictional and stays in memory until reload. Use fictional details. Phone formatting is validated, but phone ownership is not verified.

Expand **Demo controls** to preview 18 states: new application, signed out, closed applications, passed deadline, full applications, interview readiness, dialing, connected, missed call, processing, processing failure, review pending, invited, invitation expired, invitation capacity claimed, waitlisted, accepted, and a returning fan with fictional history.

**Simulate network error** and **Simulate rate limit** fail the next mutation once. These let you verify draft retention and retries without Jason's backend. Scenario changes retain the form draft; Reset demo clears it. Form drafts are not written to disk or browser storage.

Calling requires explicit destination confirmation, and retries require confirmation again. Expired or full invitations cannot be accepted. Failed interview processing remains visible even when the application is marked review pending.

## Backend contract and fixtures

Read [API-HANDOFF.md](API-HANDOFF.md). Machine-readable fictional responses are in [fixtures.json](fixtures.json), generated from `fixtures.mjs`:

```powershell
node frontend/generate-fixtures.mjs
```

The live adapter is in `api.mjs`. To connect it, configure `apiBase`, `eventId`, and `signInUrl`, then set `mode: 'live'`. Live errors never fall back to demo data. Authentication/profile editing still depend on Jason's backend; this UI does not pretend to implement them.

## Shared components for Khoi

Use the CSS variables at the top of `styles.css`: `--bg`, `--surface`, `--line`, `--muted`, `--text`, `--accent`, and `--radius`. Existing reusable classes: `.panel`, `.button`, `.secondary`, `.eyebrow`, `.status-pill`, `.note`, `.error`, `.notice`, `.field-error`, `.check`, and `.sr-only`.

Keep staff-only decisions out of live fan pages. The presentation controls are explicitly demo-only and are never rendered in live mode. Demo application states and labels are shared through `fixtures.mjs` and `model.mjs` rather than copied into screen-specific logic.

## Checks

```powershell
node --test frontend/api.test.mjs frontend/model.test.mjs frontend/profile.test.mjs
node --check frontend/app.mjs
```

Optional browser regression check: start the preview server, then install Playwright into an ignored local tooling folder:

```powershell
npm install --prefix .qa --no-save --package-lock=false playwright
$env:PLAYWRIGHT_MODULE = "$PWD/.qa/node_modules/playwright/index.mjs"
$env:BROWSER_CHANNEL = 'chrome'
node frontend/browser-check.mjs
```

This uses installed Chrome and writes screenshots under `.qa/screenshots`. Alternatively install Playwright's bundled browser and omit `BROWSER_CHANNEL`. `QA_URL` and `QA_OUTPUT` can override the preview address and screenshot directory. No Playwright dependency is needed in production.

Verified in headless desktop Chrome at viewport widths **320, 390, 768, and 1440 pixels**: no horizontal page overflow in any of the 18 states; invalid-field feedback; input/consent retention after a failed submission; destination confirmation; missed-call retry; invitation acceptance; expired/full invitation buttons; keyboard error-link focus; and mocked live 429/session-expiry behavior. The browser test reports JavaScript errors. This is viewport testing, not a physical iPhone/Safari or live FaceTime test.

## Remaining integration

Real authentication, phone verification/profile editing, durable applications and history, staff decisions, and actual calls require the team services. Vultr should serve the static files with correct module MIME types behind HTTPS and reverse-proxy `/api` to Jason's backend. Do not deploy the local Python preview server as the production application.

## Profile and application discovery

Choose **My profile** to see the signed-in profile, current/past applications, and sourced activity. New demo fans start with empty history. Applying, requesting an interview, and accepting an invitation create labeled in-memory activity records. None of these implies attendance. The **Returning fan with demo history** scenario seeds separate, clearly synthetic attendance/check-in records.

History sections load independently, support pagination and retry, and retain already loaded records after errors. Signing out clears profile history from the view. Dates are displayed in America/Chicago. The current application remains visible even when optional older-history services are unavailable.

Live history is opt-in via `config.js` feature flags. Keep `applicationHistory` and `activityHistory` false until Jason implements the documented endpoints. When application history is enabled, a new tab discovers the existing application by event before showing Apply. Otherwise the existing session-storage restoration path remains in place.

The browser suite also checks profile empty states, explicit demo record labels, keyboard skip navigation, new-tab application discovery, paginated-history deduplication, and independent activity-load failure/retry. Real backend and physical iPhone checks remain outstanding.
