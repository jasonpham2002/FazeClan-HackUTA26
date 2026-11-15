# Prediction -> points -> reward pitch walkthrough

This rehearsal uses persisted PostgreSQL data and the normal authenticated API. The fixture and merchandise voucher are explicitly simulated; there is no real match result or merchandise fulfillment.

## Add the demo catalog

Using the intended deployed backend configuration, from `backend/`:

```sh
npm run seed:engagement
```

This creates `pitch-fan@example.test`, `pitch-staff@example.test`, one demo prediction worth 100 points and a sample merch voucher costing 100 points with 50 demo units. The default round is `pitch-1`, open for 24 hours from initial creation. It does not preload any balance or fabricate a win.

The command is additive. Repeating the same round preserves picks, deadline, settlement, balances, redemptions and remaining stock. It never promotes an existing account with a conflicting identity. No migration or backend restart is needed just to add these records to an already current schema.

## Rehearse in two browser profiles

1. Fan browser: open `/sign-in` and use `pitch-fan@example.test`. Complete the magic link from the demo Mailpit inbox. New profiles may need their display name/phone completed first.
2. Open `/matches`. In More predictions (Tournament predictions on older frontend builds), find `[Demo] FaZe vs Practice Squad - prediction rehearsal`. Select **FaZe** and submit. Entry is free; the first pick is final.
3. Staff browser: sign in through `/sign-in?role=staff` as `pitch-staff@example.test`, using a separate browser profile so the fan session stays open.
4. Open `/admin/markets`. Settle this **demo** market with **FaZe** as the winning option. For its source link use `https://github.com/jasonpham2002/FazeClan-HackUTA26/blob/main/backend/DEMO.md`, the documented simulation, not a real match report. Staff settlement is allowed before the demo deadline and immediately closes further picks.
5. Fan browser: refresh My FaZe ID or Rewards. The persisted ledger now contains **+100 points** for the correct prediction.
6. Open `/rewards`, choose **Demo FaZe merch voucher**, click Redeem, then Confirm. The ledger records **-100 points**, the balance returns to 0, one stock unit is consumed and My FaZe ID shows a requested redemption.
7. Staff can inspect redemptions through the rewards dashboard at `/admin/rewards`.

Repeated settlement cannot award points twice. Retrying the same redemption request key returns the original redemption without charging again. These behaviors are integration-tested along with insufficient balance and fan/staff access control.

## Start a fresh rehearsal

Use a new round name instead of resetting points or deleting history:

```sh
npm run seed:engagement -- pitch-2
```

This creates another open demo market, keeping the same demo accounts and reward stock. Existing markets and ledgers stay intact. The real imported FaZe fixtures are never altered or settled by this seed.

## Verify the live catalog

`GET /predictions/markets` and `GET /rewards` should return the demo entries with `isDemo:true`. Completing the authenticated journey is still required to demonstrate the points transfer; a successful public list request alone does not test settlement or redemption.
