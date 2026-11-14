# Minh — Fan frontend and application journey

## Assignment

Build the fan-facing experience from signup through event application, AI FaceTime readiness, application tracking, and invitation acceptance. The website must make the live call feel like one coherent product flow.

Collaborators: Jason owns APIs/auth/deployment; Johnny owns the AI call; Khoi owns staff pages and shared visual conventions. Deadline: 24 hours.

Repository: https://github.com/jasonpham2002/FazeClan-HackUTA26

Repository checked: the remote currently contains only README.md. The architecture, routes, and interfaces below are implementation proposals. Check for new code and applicable AGENTS.md instructions before starting; coordinate shared contract changes with affected teammates.

## Scope and visual direction

Create a responsive fan website, prioritizing an iPhone viewport and a desktop pitch screen. Use a consistent dark palette, restrained red accents, strong event imagery if assets are available, readable text, and prominent next actions. Coordinate tokens and shared components with Khoi in the first hour.

Label the public demo as an independent concept for FaZe Clan rather than implying an official partnership. Avoid spending the sprint on a native iOS app, elaborate animation, or a large marketing homepage.

Suggested routes:

```text
/                  event discovery or featured event
/sign-in           signup/login
/events/:id        event details and apply
/applications/:id  readiness, call status, review status, invitation
/profile           applications and recorded activity
```

## Screen requirements

### 1. Sign-up and sign-in

- Email and phone are the required profile fields; display name is optional.
- Use Jason's selected authentication flow, preferably email magic link.
- Include clear loading, validation, expired-link, and retry states.
- Normalize phone through the backend; accept international input or clearly state the supported demo region.
- Distinguish saved phone number from verified phone ownership.
- Preserve the selected event across authentication.
- For presentation accounts, coordinate a safe seeded-login flow that does not weaken public authentication.

### 2. Event details

Display title, date/time with timezone, location, description, application deadline, and availability. Explain the process in three short steps: apply, speak with the AI host, receive a staff decision.

States: open, deadline passed, capacity unavailable, already applied, loading, not found, API error. An existing applicant should see their application rather than a second Apply action.

### 3. Application and consent

Keep the form short. Do not add a long questionnaire that repeats the interview. If interests are collected, confirm the corresponding persistence contract with Jason before adding fields.

Show explicit unticked consent before requesting a call. Suggested copy:

> I agree to receive an AI FaceTime interview at the number shown. My answers will be transcribed for event-staff review.

Display the destination number and a way to correct it before the call. Save the consent version and timestamp through the backend. Do not claim video recording; raw audio/video recording is outside scope.

Submitting the application creates one application. Starting a call is a separate, intentional action.

### 4. Call readiness and live status

- Show the confirmed destination and expected duration, approximately two to three minutes.
- Show a prominent **Call me now** button only when eligible.
- Explain that the call opens in the iPhone's FaceTime app; the website displays progress.
- Disable duplicate submissions while the request is pending or a call is active.
- Poll Jason's application endpoint about every three seconds while active; stop polling on terminal states, unmount, and prolonged errors.
- Do not attempt to place FaceTime calls directly from browser code or expose provider keys.

Status copy mapping:

| Backend state | Fan display |
|---|---|
| queued | Preparing your AI host |
| dialing | Your FaceTime call is on its way |
| connected | Interview in progress |
| completed + processing | Preparing your interview for review |
| completed + result ready | Interview received; awaiting staff review |
| missed | We couldn't reach you; try again when ready |
| failed | The call couldn't connect; retry when available |
| canceled | Call canceled |

The server controls retry eligibility. A missed call does not mean the application was denied. Do not show a completed interview until result readiness is confirmed.

If the team uses Johnny's manual FaceTime-link fallback, change the instructions and label to **Demo FaceTime session — operator assisted**. If browser calling is used, say **Browser interview**. Coordinate supported modes with Jason instead of displaying a fake dialing animation.

### 5. Application decision and invitation

Show review pending, invited, waitlisted, and accepted as distinct states. For an invitation, show event details and **Accept invitation**. Persist acceptance through the backend before displaying success.

Handle expired/withdrawn invitations and full capacity based on API response. A waitlist message should be neutral and must not claim the AI determined the person was not a real fan.

### 6. Profile and history

Display the user's applications and recorded history. New accounts show **No activity recorded yet**. Clearly identify seeded demo activity; do not imply imported FaZe social or purchase history exists.

## Shared API contract

Jason's proposed endpoints:

| Endpoint | Use |
|---|---|
| GET /me | Authenticated profile and role |
| GET /events | Discovery |
| GET /events/:id | Details |
| POST /events/:id/applications | Apply and persist consent |
| GET /applications/:id | Status, current attempt, processing state, decision |
| POST /applications/:id/call | Request call; 202 returns callAttemptId |
| POST /applications/:id/accept | Accept invitation |
| GET /me/activity | Recorded activity |

Agree exact request/response shapes in hour one. Suggested application creation payload: `{ "consentVersion": "ai-interview-v1", "consentAccepted": true }`; the authenticated user determines ownership. Do not send a client-controlled user ID to select the applicant.

Use one typed API client module. Handle 401 by signing in, 403 with access denied, 409 with refreshed state, 429 with retry guidance, and other failures with a useful retry action. Keep fixtures behind an explicit development/demo flag; do not silently fall back to fake success when live requests fail.

## Components and implementation sequence

Suggested components: EventCard, EventDetails, AuthForm, ConsentPanel, PhoneConfirmation, CallStatusPanel, ApplicationTimeline, InvitationCard, ActivityList, LoadingState, EmptyState, ErrorState.

1. Agree design tokens with Khoi and API shapes with Jason.
2. Build routes against typed fixtures while backend work proceeds.
3. Implement authentication and preserve intended navigation.
4. Connect event/application APIs.
5. Connect readiness, call request, and status polling.
6. Connect decisions and invitation acceptance.
7. Replace temporary fixtures in the live flow and verify all error states.

## Accessibility and usability

- Labels on inputs, visible keyboard focus, sufficient contrast.
- Buttons have clear text and disabled/loading states.
- Announce meaningful status changes without repeatedly interrupting screen readers.
- Display dates in the user's locale with an explicit event timezone.
- Avoid relying on red/green alone for status.
- Keep touch targets usable and avoid horizontal overflow on iPhone.
- Refreshing the application page must reconstruct progress from the backend.

## Schedule

| Hours | Deliverable |
|---|---|
| 0–2 | Repo inspection, shared styling, API fixtures, routes |
| 2–6 | Auth, event details, application and consent UI |
| 6–10 | Live apply → call request → status flow |
| 10–14 | Decision, acceptance, profile/history |
| 14–18 | Errors, retries, responsive polish |
| 18–21 | Real iPhone full-flow rehearsal |
| 21–24 | Freeze and pitch polish |

## Acceptance checks

- [ ] A fan can authenticate, apply, and request a call from an iPhone-sized viewport.
- [ ] Call consent is explicit and destination number is visible before dialing.
- [ ] Double-clicking does not trigger duplicate UI requests; server also enforces this.
- [ ] Reloading restores application and call state.
- [ ] A missed call offers the supported retry path without implying rejection.
- [ ] A live decision appears and invitation acceptance persists.
- [ ] New users have honest empty history; seeded records are labeled.
- [ ] Staff data and other fans' details never appear in fan pages.
- [ ] All live paths use real API responses, with clear labels for any fallback mode.

Out of scope: native iOS app, merchandise checkout, rewards fulfillment, social-account linking, complex discovery, and notifications beyond the demonstrated call and website status.

## Related assignments

[Project overview](README.md) | [Johnny](Johnny.md) | [Jason](Jason.md) | [Minh](Minh.md) | [Khoi](Khoi.md)
