# Khoi — Complete fan and staff frontend expansion

Owner: Khoi. Time budget: the remaining 10-hour sprint.

## Outcome and boundaries

Own all frontend work for the expanded FaZe ID experience in the existing `web/` React app. Preserve existing authentication, profile editing, community events, application status, AI interview evidence, and staff review. Do not start a second website or move back to the standalone `frontend/` prototype.

Johnny supplies manually imported current roster/stat/match data. Jason supplies follows, predictions, points, rewards and eligibility. Minh wires YouTube, AI summaries and calls. No SerpAPI is part of the architecture.

Related assignments: [Johnny data](Minh.md), [Jason backend](Jason.md), [Minh integrations](Johnny.md), [overview](README.md).

## First-hour coordination

1. Inspect latest main and existing shared API/UI modules.
2. Agree endpoint envelopes, player IDs, stat periods, market options, reward rules, and loading/error states with the backend owners.
3. Keep `web/src/api/types.ts`, `client.ts`, `http.ts`, and fixture adapters aligned. Coordinate shared-file changes with the others; do not invent a separate client in each page.
4. Receive a real player/stats fixture from Johnny and an AI/highlight fixture from Minh by hour two.
5. Pick one complete presentation journey before polishing the entire roster.

## Fan screens, in priority order

### 1. CS2 roster and player selection

Show the verified roster with handle, role, image/placeholder, and current membership status. Preserve historical player pages after roster changes. Coach pages should show appropriate context instead of fake player metrics. Make switching players and following a player obvious.

The roster is manually refreshed. Display its checked timestamp; do not label it a live feed. The earlier list of names must not be assumed current without Johnny's source verification.

### 2. Player detail: analytics first

Page order is a product requirement:

1. Identity, role, follow control, stat period and sourced performance cards.
2. Upcoming matches, tournament progress, calendar and recent activity.
3. Related videos/highlights.

Cards: source-defined rating/version, K/D, ADR, headshot percentage and recent results. Show period, sample size where known, source links, and updated timestamp. A missing value is unavailable, never zero. A chart needs comparable observations; do not manufacture a trend from one aggregate.

Add Minh's AI interpretation near the stats, clearly labeled as generated analysis with supporting sources. Preserve numerical cards if the AI call fails. Use source and snapshot metadata to avoid showing an old insight alongside a new stat snapshot.

### 3. Match calendar and predictions

Distinguish esports fixtures from community events. Show date/time with the event's timezone, tournament stage, participants, and market deadline.

Support free match-winner and tournament-placement picks with clear fixed point awards. Render open, submitted, locked, settled, void, correct, and incorrect states. The server determines eligibility and lock time; a client countdown is informative only. Restore the saved pick on reload. A retry/error must not falsely claim a pick was saved.

### 4. My FaZe ID

Extend the existing profile with followed players, predictions/results, point balance, transaction reasons, confirmed activity, redemptions and event applications. New fans get honest empty states. An accepted invitation is distinct from attendance.

Show ledger entries such as Correct match prediction, Confirmed attendance, Reward redemption and Staff adjustment. Display only backend-recorded awards. No client-side balance increments or random engagement scores.

### 5. Rewards and exclusive access

Show proposed merchandise, raffle-entry, early-access and priority concepts, but connect one actual sample redemption first. Display cost, stock/availability, confirmation and claim status. Handle insufficient points, out of stock, and duplicate requests without fake success.

For selected experiences, show the points eligibility threshold, application action, AI interview and staff-review status. Points unlock eligibility; applying/taking the interview does not spend them. Keep event capacity and the human invitation decision visible.

### 6. Highlights and content check-ins

Use Minh's YouTube response for thumbnails, titles, channel, publication date and playable/clickable video links. If embedding is unavailable, provide a useful source link. Do not substitute unrelated videos just to fill a carousel.

If the team demonstrates QR-based engagement, call it a content check-in. Show one-time claim success/already-claimed/expired states; do not describe a QR scan as proof of complete video viewing.

## Staff screens

Extend the existing dashboard with the minimum controls necessary for the same journey:

- Create prediction markets, choose fixed award and lock deadline, review picks, confirm sourced outcomes, and view settlement status.
- Create/update a proposed reward, cost, stock and availability; inspect redemption records.
- Inspect a fan's points ledger; make an adjustment only with a required reason and saved audit record.
- Configure selected event eligibility thresholds and reuse existing interview questions, application review, Invite/Waitlist and attendance controls.
- Display data refresh/source status. Johnny owns the importer; a full roster/stat CMS is optional, not a blocker for the first demo.

Staff must see saved state read back from the API. A failed write must not appear published, settled, redeemed, or awarded. Confirm result settlement deliberately; it may award points to many users.

## Technical expectations

Reuse existing theme tokens, brand assets, shared components, routing, and query patterns. Keep fake data confined to explicit fixtures. Production/live mode must not silently fall back to localStorage accounts or rewards. Never put YouTube/AI keys in Vite public variables or browser bundles.

Invalidate/refetch the corresponding queries after follows, picks, settlement, redemption and staff decisions. Preserve partially loaded data with honest error messaging. Protect staff navigation and rely on server authorization for actual security.

Check keyboard operation, form labels, contrast, loading/empty/error states, narrow mobile layout, long handles/titles, and date/time display. Use consistent status labels on both fan and staff pages.

## Timeline

| Hours | Deliverable |
|---|---|
| 0–1 | Shared contracts, routes, selected demo player, screen hierarchy |
| 1–3 | Player selector/detail with stats and calendar against agreed fixtures |
| 3–5 | Live data/AI/highlights integration; predictions and points profile |
| 5–7 | Rewards, staff settlement/catalog, exclusive event eligibility |
| 7–8 | Complete fan/staff loop; error and mobile checks |
| 8–10 | Feature freeze, polish, build, deployment handoff and rehearsal |

## Acceptance criteria

- [ ] A sourced player page follows the required analytics → schedule/activity → highlights order.
- [ ] Current/manual refresh timestamps and source links are clear; sample data is labeled.
- [ ] A fan follows a player, submits a pick, and sees it locked at the correct state.
- [ ] Staff settles the result; the fan sees a persisted point award and reason.
- [ ] One sample redemption persists and updates balance/stock via the backend.
- [ ] An eligible fan can use the existing AI application/review journey.
- [ ] AI or YouTube failure does not blank the rest of the player page.
- [ ] No real keys, staff-only notes, or another fan's private records appear in fan responses/UI.
- [ ] Build, meaningful UI tests and the complete demo journey pass before deployment.

Out of scope: multi-game layouts, a separate native app, complex animated charts without data, full merchandise checkout/shipping, and a total redesign of existing working screens.
