import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi, createLiveApi } from './api.mjs';

const profile = { name: 'Demo', email: 'fan@example.com', phone: '+12025550123', consentAccepted: true };
test('application requires consent and rejects duplicate applications', async () => {
  const api = createDemoApi();
  await assert.rejects(api.apply({ ...profile, consentAccepted: false }));
  await api.apply(profile);
  await assert.rejects(api.apply(profile), { status: 409 });
});
test('missed calls can retry; active calls cannot duplicate; acceptance needs invitation', async () => {
  const api = createDemoApi();
  await assert.rejects(api.requestCall());
  await api.apply(profile);
  await assert.rejects(api.accept());
  await api.requestCall();
  await assert.rejects(api.requestCall());
  await api.simulate('missed');
  assert.equal((await api.requestCall()).call.status, 'queued');
  await api.simulate('review');
  await assert.rejects(api.requestCall());
  await api.simulate('invited');
  assert.equal((await api.accept()).status, 'accepted');
  await assert.rejects(api.requestCall());
});
test('returned demo data cannot mutate saved state and instances are isolated', async () => {
  const api = createDemoApi();
  const app = await api.apply(profile);
  app.status = 'invited';
  await assert.rejects(api.accept());
  assert.equal(await createDemoApi().getApplication(), null);
});
test('live API surfaces authentication failure and never falls back to demo data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Sign in required' } }), { status: 401 });
  try {
    const api = createLiveApi({ apiBase: '/api', eventId: 'evt' });
    await assert.rejects(api.getEvent(), { status: 401, message: 'Sign in required' });
    await assert.rejects(api.apply(profile), { status: 401 });
  } finally { globalThis.fetch = originalFetch; }
});

test('live restoration uses an event-scoped ID and clears inaccessible application state', async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const values = new Map([['faze.applicationId:event-a', 'app_a']]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } });
  let requests = 0;
  globalThis.fetch = async url => {
    requests++;
    assert.equal(url, '/api/applications/app_a');
    return new Response(JSON.stringify({ error: { message: 'Forbidden' } }), { status: 403 });
  };
  try {
    const otherEvent = createLiveApi({ apiBase: '/api', eventId: 'event-b' });
    assert.equal(await otherEvent.getApplication(), null);
    assert.equal(requests, 0);
    const matchingEvent = createLiveApi({ apiBase: '/api', eventId: 'event-a' });
    assert.equal(await matchingEvent.getApplication(), null);
    assert.equal(values.has('faze.applicationId:event-a'), false);
    assert.equal(await matchingEvent.getApplication(), null);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage);
    else delete globalThis.sessionStorage;
  }
});
