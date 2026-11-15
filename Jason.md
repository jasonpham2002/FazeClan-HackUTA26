# Jason — Predictions, points, rewards, and shared backend integration

Owner: Jason. Time budget: the remaining 10-hour sprint.

## Outcome

Extend the existing PostgreSQL backend so following CS2 players, making free predictions, and verified participation form a persistent fan experience. Demonstrate one correct prediction awarding points, a sample reward redemption, and an exclusive event application connected to the existing AI/staff flow.

No SerpAPI. Johnny imports sourced esports facts manually. Minh owns YouTube and AI integrations. Rewards are proposed FaZe benefits for the pitch, not already fulfilled partnerships or inventory commitments.

Related assignments: [Johnny data](Minh.md), [Khoi frontend](Khoi.md), [Minh integrations](Johnny.md), [overview](README.md).

## Existing system and ownership

Reuse `backend/`, `web/`, real cookie authentication, PostgreSQL transactions, existing community events, invitation decisions, and agent ingestion. Preserve the distinction between fixture mode and database-backed operation. Never add a silent fallback from a failed live API to localStorage.

Own central server registration, migrations/deployment coordination, and the engagement domain. Johnny owns player/stat/match data modules. Minh owns provider adapters and AI routes. Agree migration numbers and shared helpers in hour one to avoid collisions.

## First-hour decisions

1. Agree stable player/match/tournament IDs with Johnny.
2. Freeze one match-winner market and one tournament-placement market for the demo. Placement options must be explicit and non-overlapping.
3. Agree fixed points awards and a single sample reward's cost/stock with Khoi.
4. Select an exclusive event with a configurable minimum-points eligibility threshold. Default zero is allowed so new fans have a route in.
5. Give Khoi and Minh endpoint examples, HTTP errors, and ownership rules by hour two.

## New persistence

Use new additive migrations, not edits to applied SQL. Proposed tables:

| Entity | Key fields/rules |
|---|---|
| player_follows | userId, playerId, createdAt; unique user/player |
| prediction_markets | match/tournament reference, type, frozen options, locksAt, fixed award, state, createdBy |
| predictions | userId, marketId, selected option, submittedAt; unique user/market |
| prediction_settlements | marketId, confirmed result/source, reviewer, timestamp; unique market |
| point_transactions | userId, signed integer delta, reason, source type/ID, idempotency key, timestamp |
| rewards | title, kind, integer point cost, stock, active state, terms, isDemo |
| reward_redemptions | userId, rewardId, points debit reference, status, createdAt; idempotent request |
| engagement_claims | campaign/token reference, userId, activity type, verifiedAt; unique user/campaign |
| event eligibility | optional minimumPoints on existing community event; default zero |

Keep an append-only points ledger. Balance is derived from it or maintained transactionally with it; never trust a client-supplied balance or award value. Staff adjustments require a reason and reviewer audit record. Do not delete transactions to hide corrections.

## Prediction rules

- Entry is free; users do not stake points or money.
- Server time determines locking. Reject late picks, including a request racing the deadline.
- One pick per user/market. If edits are allowed before lock, record them and reject edits after lock; otherwise make first submission final and say so in the UI.
- Freeze the options, award, and deadline once participation starts. An updated match schedule must not automatically reopen predictions.
- Staff confirms the result with a source reference. Do not settle based on an AI guess or an unverified imported result.
- Settlement and point awards are atomic and idempotent. Retrying or double-clicking cannot award twice.
- Settled markets cannot be casually edited in this MVP. A void market awards no points; there is no stake to refund.
- If result correction is needed, use an explicit audited reversal/replacement design; otherwise leave that workflow out of the first demo.

## Reward and event rules

For the demo, support one functional point-cost reward claim with clearly proposed/sample merchandise benefits. Record redemption status rather than pretending an item shipped. Represent raffle/early-access/priority concepts in the catalog, but avoid building all fulfillment paths at once.

Redemption must atomically check balance and stock, debit points, decrement stock, and create the claim. A retry returns the original result. Concurrent requests must not create negative balances or oversell stock.

For selected events, points unlock eligibility to apply, followed by the existing AI interview and a human Invite/Waitlist decision. Do not deduct points merely for applying or completing the interview. Eligibility does not guarantee admission. Preserve the existing consent, version pinning, and invitation-capacity checks.

## Verified participation

Reuse staff-confirmed attendance. Award its points once from the accepted attendance record, not from an application or invitation acceptance. A repeated check-in must not duplicate points.

A QR content claim is a **content check-in**, not proof of watching an entire video. Use a server-issued, expiring campaign token and one claim per user/campaign; do not accept arbitrary user-supplied point values. QR codes can be shared, so describe the evidence honestly. Choose one working attendance or content claim for the pitch rather than implementing every possible activity.

## Proposed APIs for Khoi

Confirm exact envelopes against existing shared types. Suggested additive routes:

| Endpoint | Purpose |
|---|---|
| PUT /me/follows/:playerId, DELETE same | Idempotent follow/unfollow |
| GET /me/follows | Followed players |
| GET /predictions/markets | Open/locked/settled markets and current user's pick |
| POST /predictions/markets/:id/pick | Submit a server-validated selection |
| GET /me/points | Balance plus paginated ledger/history |
| GET /rewards | Proposed benefits, costs, and availability |
| POST /rewards/:id/redeem | Atomic claim using an idempotency key |
| GET /me/redemptions | Current user's claims |
| POST /engagement/claims | Validate an expiring content token and award once |
| POST /admin/prediction-markets | Create a staff-configured market |
| POST /admin/prediction-markets/:id/settle | Confirm outcome and award points once |
| POST/PATCH /admin/rewards | Staff catalog/stock management |
| POST /admin/users/:id/point-adjustments | Audited signed adjustment with reason |

Return distinguishable errors for locked prediction, duplicate pick, invalid option, already-settled market, insufficient points, unavailable stock, expired claim, insufficient event eligibility, and unauthorized access. Backend checks apply regardless of UI state.

## Timeline

| Hours | Deliverable |
|---|---|
| 0–1 | Contracts, migration ownership, point rules and demo markets |
| 1–3 | Ledger, follows, prediction creation/picks/locking |
| 3–5 | Staff settlement, exactly-once awards, reward redemption |
| 5–7 | Eligibility plus one verified participation source; connect Khoi |
| 7–8 | Concurrency/idempotency and full journey tests |
| 8–10 | Freeze, migrate/deploy with the agreed target, rehearse and document |

## Required verification

- [ ] Predictions submitted at/after the server deadline are rejected.
- [ ] Settlement retries award exactly once; the user sees the ledger reason.
- [ ] Concurrent redemptions cannot overspend or oversell.
- [ ] Fan accounts cannot settle results, adjust balances, or read other fans' ledgers.
- [ ] Attendance/QR retries do not duplicate awards.
- [ ] Insufficient points block eligible-event applications without charging the fan.
- [ ] Existing real-auth → application → interview → review → acceptance tests still pass.
- [ ] Fixture and live clients use compatible contracts and stay explicitly separated.

Out of scope: payments, paid predictions, shipping fulfillment, a full raffle-drawing engine, point transfers, and a new database technology.
