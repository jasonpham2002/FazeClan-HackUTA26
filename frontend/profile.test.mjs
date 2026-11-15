import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi, createLiveApi } from './api.mjs';
import { demoProfile, demoEvent } from './fixtures.mjs';
import { profileView } from './profile.mjs';

test('a new fan has empty history; application and accepted invitation never create attendance', async () => {
  const api = createDemoApi();
  assert.deepEqual((await api.getActivity()).items, []);
  assert.deepEqual((await api.getApplications()).items, []);
  await api.apply(demoProfile);
  assert.equal((await api.getApplications()).items.length, 1);
  await api.requestCall();
  await api.simulate('review');
  await api.simulate('invited');
  await api.accept();
  const events = (await api.getActivity()).items;
  assert.ok(events.some(item => item.type === 'invitation_accepted'));
  assert.ok(events.every(item => item.type !== 'attendance_confirmed'));
  assert.ok(events.every(item => item.synthetic && item.source === 'demo_platform'));
});

test('seeded history is explicitly fictional and reset clears session activity', async () => {
  const api = createDemoApi();
  await api.setScenario('returning_fan');
  assert.equal((await api.getApplications()).items.length, 2);
  const activity = (await api.getActivity()).items;
  assert.ok(activity.some(item => item.type === 'attendance_confirmed' && item.synthetic));
  activity[0].source = 'tampered';
  assert.notEqual((await api.getActivity()).items[0].source, 'tampered');
  await api.setScenario('fresh');
  assert.deepEqual((await api.getActivity()).items, []);
});

test('profile escapes untrusted text and keeps accepted invitation distinct from attendance', () => {
  const section = { state: 'loaded', available: true, items: [], nextCursor: null };
  const html = profileView({ user: { profile: { name: '<img src=x onerror=alert(1)>', email: 'fake@example.com' } },
    currentApplication: { id: 'app', eventId: demoEvent.id, status: 'accepted' }, event: demoEvent,
    history: { applications: section, activity: section }, isDemo: true });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('Invitation accepted'));
  assert.ok(html.includes('No activity recorded yet.'));
  assert.ok(!html.includes('<h3>Attendance confirmed</h3>'));
});

test('live optional history does not call unfinished endpoints', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected request'); };
  try {
    const api = createLiveApi({ apiBase: '/api', eventId: 'evt' });
    assert.equal((await api.getApplications()).available, false);
    assert.equal((await api.getActivity()).available, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('enabled history discovers current event application on a new tab and refetches its details', async () => {
  const originalFetch = globalThis.fetch;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  } });
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    const body = url.includes('/me/applications')
      ? { items: [{ id: 'wrong_event', eventId: 'another' }, { id: 'app_restored', eventId: 'evt' }], nextCursor: null }
      : { id: 'app_restored', eventId: 'evt', status: 'review_pending' };
    return new Response(JSON.stringify(body));
  };
  try {
    const api = createLiveApi({ apiBase: '/api', eventId: 'evt', features: { applicationHistory: true } });
    assert.equal((await api.getApplication()).id, 'app_restored');
    assert.equal(values.get('faze.applicationId:evt'), 'app_restored');
    assert.deepEqual(urls, ['/api/me/applications?eventId=evt', '/api/applications/app_restored']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage); else delete globalThis.sessionStorage;
  }
});

test('enabled history encodes cursors and rejects a malformed collection response', async () => {
  const originalFetch = globalThis.fetch;
  let actualUrl;
  globalThis.fetch = async url => { actualUrl = url; return new Response(JSON.stringify({ items: 'not an array' })); };
  try {
    const api = createLiveApi({ apiBase: '/api', eventId: 'evt', features: { activityHistory: true } });
    await assert.rejects(api.getActivity({ cursor: 'a/b?x=1' }), { code: 'INVALID_RESPONSE' });
    assert.equal(actualUrl, '/api/me/activity?cursor=a%2Fb%3Fx%3D1');
  } finally { globalThis.fetch = originalFetch; }
});
