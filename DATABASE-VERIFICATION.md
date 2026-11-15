# Database and application verification

Reviewed latest main at `984059f` in the Windows checkout. Fixes below are local and not pushed.

## Account persistence finding

The frontend previously defaulted to fixture mode, including when the environment setting was absent or misspelled. Fixture sign-up writes only to browser localStorage, so those accounts never reach PostgreSQL. The runtime now defaults to the real API, requires explicit `fixtures` mode for browser-only samples, and rejects invalid mode names. Development defaults to `http://127.0.0.1:3001`; production defaults to `/api`. Existing `.env.local` values still take precedence and require a Vite restart/rebuild after changes.

This checkout has no populated `backend/.env` and no Tiger credential file; `backend/.env.example` is blank. Therefore the team's shared Tiger connection could not be verified. Provide the real service's connection settings locally, run migrations/seed, and check `/health`. Database tables live under the configured `faze` schema, not necessarily `public`.

Fixture accounts are not automatically imported as real verified accounts. In live mode, complete the email magic link and first-login profile setup. The current local auth service accepts `@example.test` addresses and uses Mailpit.

## Reproduced migration defect

All four migration files check out as CRLF on Windows, while Git stores them as LF. Previously raw-content checksums made identical SQL appear changed after switching platforms. A real PostgreSQL regression reproduced `Applied migration 001_auth.sql has changed` with equivalent LF/CRLF contents.

The runner now accepts recognized historical LF/CRLF hashes and normalizes the ledger to LF. Genuinely different SQL still fails. No existing migration SQL was edited, and no shared database was modified.

## Checks and results

| Check | Result |
|---|---|
| Shared frontend unit tests | 42 passed |
| Frontend TypeScript/production build | Passed |
| Backend TypeScript | Passed |
| Real PostgreSQL backend integration flow | Passed |
| Cross-platform migration compatibility and changed-SQL rejection | Passed |
| Live Chrome account persistence | Verified exactly one verified PostgreSQL user after magic-link verification; profile survived reload |
| Live Chrome full fan/staff flow | Passed: publish → apply → sample worker → review → invite → accept → persisted analytics |
| Standalone legacy frontend tests | 18 passed |
| FaceTime agent JavaScript syntax | Passed |

Database verification used an isolated PostgreSQL 18 instance on loopback, with verified TLS and disposable `faze_test_*` schemas. Email links were captured in memory; the Mailpit-shaped test inbox adapter exercised the browser smoke test without actual SMTP delivery. Interview jobs used synthetic sample results, not real calls. The updated smoke test handles current email field labels and waits for the first-login profile redirect before applying.

## Remaining limits

- Shared Tiger service connectivity, service permissions, and existing data require the missing local credentials.
- SMTP/Mailpit delivery and real FaceTime/provider behavior were not exercised.
- Agent dependency installation reports 7 existing advisories (3 moderate, 4 high); no forced dependency upgrades were made as part of the database fix.
- The unrelated untracked `a.out` file was preserved.
