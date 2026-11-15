import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, validateDraft, applicationAvailability, invitationAvailability, statusContent, shouldPoll } from './model.mjs';
import { demoProfile, scenarios } from './fixtures.mjs';
import { createDemoApi } from './api.mjs';

test('phone formatting accepts international country codes without accepting letters or local-only numbers', () => {
  assert.equal(normalizePhone('+1 (202) 555-0123'), '+12025550123');
  assert.equal(normalizePhone('+84 912 345 678'), '+84912345678');
  for (const value of ['2025550123', '+0 12345678', '+1-CALL-ME', '+123', '++12025550123', '+120255501234567890']) assert.equal(normalizePhone(value), null);
});
test('validation returns field-addressable errors and accepts the proposed demo profile', () => {
  assert.deepEqual(validateDraft(demoProfile), {});
  assert.deepEqual(Object.keys(validateDraft({ name: ' ', email: 'invalid', phone: '123', consentAccepted: false })), ['name', 'email', 'phone', 'consent']);
  assert.deepEqual(validateDraft({ consentAccepted: true }, false), {});
});
test('deadline and invitation expiry are enforced at their exact boundary', () => {
  const instant = Date.parse('2026-11-14T18:00:00Z');
  assert.match(applicationAvailability({ status: 'open', applicationDeadline: '2026-11-14T18:00:00Z' }, instant), /deadline/);
  assert.equal(applicationAvailability({ status: 'open', applicationDeadline: '2026-11-14T18:00:01Z' }, instant), null);
  assert.match(invitationAvailability({ status: 'invited', invitation: { expiresAt: '2026-11-14T18:00:00Z' } }, instant), /expired/);
  assert.match(invitationAvailability(scenarios.capacity_claimed.application), /claimed/);
});
test('processing failure overrides review-pending copy and stops polling', () => {
  assert.match(statusContent(scenarios.processing_failed.application).text, /processing needs staff attention/);
  assert.equal(shouldPoll(scenarios.processing_failed.application), false);
  assert.equal(shouldPoll(scenarios.processing.application), true);
  assert.equal(shouldPoll(scenarios.accepted.application), false);
});
test('closed, expired and capacity-full fixtures reject corresponding mutations', async () => {
  const api = createDemoApi();
  for (const name of ['closed', 'deadline_passed', 'full']) {
    await api.setScenario(name);
    await assert.rejects(api.apply(demoProfile), { status: 409 });
  }
  for (const name of ['expired', 'capacity_claimed']) {
    await api.setScenario(name);
    await assert.rejects(api.accept(), { status: 409 });
  }
});
test('failed mutation retains application and can be retried without duplicate creation', async () => {
  const api = createDemoApi();
  api.failNext('network');
  await assert.rejects(api.apply(demoProfile), TypeError);
  assert.equal(await api.getApplication(), null);
  await api.apply(demoProfile);
  api.failNext('rate');
  await assert.rejects(api.requestCall(), { status: 429 });
  assert.equal((await api.getApplication()).call, null);
  assert.equal((await api.requestCall()).call.status, 'queued');
});
test('signed-out fixture rejects writes; fixture changes are isolated from shared definitions', async () => {
  const api = createDemoApi();
  await api.setScenario('signed_out');
  assert.equal(await api.getMe(), null);
  await assert.rejects(api.apply(demoProfile), { status: 401 });
  await api.setScenario('invited');
  await api.accept();
  await api.setScenario('invited');
  assert.equal((await api.getApplication()).status, 'invited');
});
