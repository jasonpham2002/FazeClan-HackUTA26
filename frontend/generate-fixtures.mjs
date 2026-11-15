// Run from any directory. Only fictional data is exported.
import { writeFile } from 'node:fs/promises';
import { scenarios } from './fixtures.mjs';
const errors = {
  unauthorized: { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } } },
  forbidden: { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Application access denied.' } } },
  duplicate_call: { status: 409, body: { error: { code: 'CALL_ALREADY_ACTIVE', message: 'A call is already in progress.' } } },
  invitation_expired: { status: 409, body: { error: { code: 'INVITATION_EXPIRED', message: 'Your invitation has expired.' } } },
  capacity_claimed: { status: 409, body: { error: { code: 'CAPACITY_FULL', message: 'All available spots have been claimed.' } } },
  rate_limited: { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Please wait before trying again.' } } },
};
await writeFile(new URL('./fixtures.json', import.meta.url), JSON.stringify({ schemaVersion: 1, synthetic: true, scenarios, errors }, null, 2) + '\n');
console.log('Wrote frontend/fixtures.json (fictional API response examples).');
