import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../src/config.ts';
import { createPool, transaction } from '../src/db.ts';
import { dropTestSchema, migrate } from '../src/migrate.ts';
import { seed } from '../src/seed.ts';
import { buildApp } from '../src/server.ts';
import { runOne } from '../src/worker.ts';

type Response = { statusCode: number; json<T>(): T };
type Application = { id: string; interviewVersionId: string; status: string };
type Review = {
  selectedAttemptId: string | null;
  transcript: Array<{ id: string; sequence: number }>;
  answers: Array<{ questionId: string }>;
  decisions: Array<{ decision: string }>;
  attempts: Array<{ id: string; status: string; processingStatus: string }>;
};
type Analytics = {
  applications: number;
  callsAttempted: number;
  callsConnected: number;
  interviewsCompleted: number;
  reviewsPending: number;
  invitationsIssued: number;
  accepted: number;
  connectionRate: number | null;
  interviewCompletionRate: number | null;
};

function read<T>(response: Response, ...expected: number[]): T {
  assert.ok(expected.includes(response.statusCode), `Expected HTTP ${expected.join(' or ')}, got ${response.statusCode}`);
  return response.json<T>();
}

async function latestMailpitLink(email: string, origin: string) {
  const url = new URL('/view/latest.txt', 'http://127.0.0.1:8025');
  url.searchParams.set('query', `to:${email}`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.status === 404) {
      await delay(100);
      continue;
    }
    assert.ok(response.ok, `Mailpit returned ${response.status}`);
    const link = (await response.text()).match(/https?:\/\/[^\s<>]+/)?.[0];
    if (link && new URL(link).origin === origin) return link;
    await delay(100);
  }
  assert.fail('No magic link received in Mailpit');
}

test('staff publication through fan acceptance with a reclaimed interview job', { timeout: 120_000 }, async (context) => {
  const runId = randomUUID().replaceAll('-', '');
  const schema = process.env.TEST_SCHEMA === 'faze' ? 'faze' : `faze_test_${runId}`;
  const testEmails = [`first-${runId}@example.test`, `second-${runId}@example.test`];
  const eventTitle = `Fixture integration ${runId}`;
  const port = Number(process.env.TEST_PORT ?? 3011);
  const baseUrl = `http://127.0.0.1:${port}`;
  const config = { ...loadConfig(), schema, port, baseUrl };
  const db = createPool(config.databaseUrl, schema);
  let app: ReturnType<typeof buildApp> | undefined;
  let eventId: string | undefined;
  let migrated = false;
  context.after(async () => {
    try {
      await app?.close();
      if (schema !== 'faze') {
        await dropTestSchema(db, schema);
      } else if (migrated) {
        await transaction(db, async client => {
          if (eventId) await client.query('DELETE FROM events WHERE id = $1 AND title = $2', [eventId, eventTitle]);
          await client.query('DELETE FROM "user" WHERE email = ANY($1::text[])', [testEmails]);
        });
      }
    } finally {
      await db.end();
    }
  });

  await migrate(db, schema);
  migrated = true;
  await seed(db);
  const inbox = new Map<string, string>();
  const useSmtp = process.env.TEST_SMTP === '1';
  const api = app = buildApp(config, db, useSmtp ? undefined : async (to, url) => { inbox.set(to, url); });
  await api.listen({ host: '127.0.0.1', port });

  function request(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, cookie?: string, payload?: object) {
    return api.inject({ method, url, headers: cookie ? { cookie } : {}, payload });
  }

  async function signIn(email: string, verifySingleUse = false) {
    const start = await request('POST', '/api/auth/sign-in/magic-link', undefined, { email, name: email.split('@')[0] });
    assert.equal(start.statusCode, 200);
    const link = useSmtp ? await latestMailpitLink(email, baseUrl) : inbox.get(email);
    assert.ok(link, 'Expected sign-in email');
    const verification = new URL(link);
    assert.equal(verification.origin, baseUrl);
    assert.equal(verification.pathname, '/api/auth/magic-link/verify');
    const path = `${verification.pathname}${verification.search}`;
    const accepted = await request('GET', path);
    const cookies = accepted.cookies.filter(({ value }) => value).map(({ name, value }) => `${name}=${value}`).join('; ');
    assert.ok(cookies, 'Magic link should set a session cookie');
    if (verifySingleUse) {
      const replay = await request('GET', path);
      assert.ok(replay.statusCode >= 400 || replay.headers.location?.includes('error='));
      assert.equal(replay.cookies.some(({ name, value }) => Boolean(value) && name.endsWith('session_token')), false);
    }
    return cookies;
  }

  assert.equal((await request('GET', '/health')).statusCode, 200);
  assert.equal((await request('GET', '/me')).statusCode, 401);
  const staff = await signIn('staff@example.test');
  const firstFan = await signIn(testEmails[0], true);
  const secondFan = await signIn(testEmails[1]);
  assert.equal(read<{ role: string }>(await request('GET', '/me', staff), 200).role, 'staff');
  assert.equal(read<{ role: string }>(await request('GET', '/me', firstFan), 200).role, 'fan');
  assert.deepEqual(read(await request('GET', '/me/activity', firstFan), 200), { activity: [] });
  assert.equal((await request('PATCH', '/me', firstFan, { phone: '+12025550100' })).statusCode, 200);
  assert.equal((await request('PATCH', '/me', secondFan, { phone: '+12025550101' })).statusCode, 200);

  const eventInput = {
    title: eventTitle,
    description: 'Synthetic integration event',
    location: 'Arlington',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'draft',
    capacity: 1,
  };
  assert.equal((await request('POST', '/admin/events', firstFan, eventInput)).statusCode, 403);
  const event = read<{ id: string }>(await request('POST', '/admin/events', staff, eventInput), 201);
  eventId = event.id;
  assert.equal((await request('GET', `/events/${event.id}`)).statusCode, 404);
  const staffEvents = read<{ events: Array<{ id: string; status: string }> }>(await request('GET', '/admin/events', staff), 200);
  assert.ok(staffEvents.events.some(row => row.id === event.id && row.status === 'draft'));
  read(await request('PATCH', `/admin/events/${event.id}`, staff, { status: 'published' }), 200);
  await db.query('UPDATE events SET is_demo = true WHERE id = $1', [event.id]);
  const statsUrl = `/admin/events/${event.id}/analytics`;
  const initial = read<Analytics>(await request('GET', statsUrl, staff), 200);
  assert.equal(initial.connectionRate, null);
  assert.equal(initial.interviewCompletionRate, null);

  async function publish(questionId: string, prompt: string) {
    const endpoint = `/admin/events/${event.id}`;
    const draft = { intro: 'Hello', tone: 'friendly', maxDurationSeconds: 180,
      questions: [{ id: questionId, prompt, purpose: 'Interests', required: true, order: 1, maxFollowUps: 1 }] };
    assert.equal((await request('PUT', `${endpoint}/interview-draft`, staff, draft)).statusCode, 200);
    return read<{ id: string }>(await request('POST', `${endpoint}/interview-publish`, staff), 200, 201);
  }

  const firstVersion = await publish('q_1', 'What made you interested in the event?');
  await assert.rejects(db.query(
    `UPDATE questions SET prompt = 'Mutation' WHERE version_id = $1`, [firstVersion.id],
  ), { code: '23514' });
  const applyUrl = `/events/${event.id}/applications`;
  const consent = { consentVersion: 'ai-interview-v1', consentAccepted: true };
  assert.equal((await request('POST', applyUrl, firstFan, { ...consent, consentAccepted: false })).statusCode, 400);
  const submissions = await Promise.all([
    request('POST', applyUrl, firstFan, consent),
    request('POST', applyUrl, firstFan, consent),
  ]);
  assert.deepEqual(submissions.map(({ statusCode }) => statusCode).sort(), [200, 201]);
  const first = read<Application>(submissions[0], 200, 201);
  assert.equal(read<Application>(submissions[1], 200, 201).id, first.id);
  assert.equal(first.interviewVersionId, firstVersion.id);
  assert.equal(read<{ applicationId: string }>(await request('GET', `/events/${event.id}`, firstFan), 200).applicationId, first.id);
  const firstPath = `/applications/${first.id}`;
  assert.equal((await request('GET', firstPath, secondFan)).statusCode, 404);
  assert.equal((await request('POST', `${firstPath}/call`, secondFan)).statusCode, 404);
  assert.equal((await request('GET', `/admin${firstPath}`, firstFan)).statusCode, 403);

  const secondVersion = await publish('q_2', 'What would you like to do at the event?');
  assert.notEqual(secondVersion.id, firstVersion.id);
  assert.equal(read<Application>(await request('GET', firstPath, firstFan), 200).interviewVersionId, firstVersion.id);
  const second = read<Application>(await request('POST', applyUrl, secondFan, consent), 201);
  assert.equal(second.interviewVersionId, secondVersion.id);
  const secondPath = `/applications/${second.id}`;

  const callRequests = await Promise.all([
    request('POST', `${firstPath}/call`, firstFan),
    request('POST', `${firstPath}/call`, firstFan),
  ]);
  const firstCall = read<{ callAttemptId: string; mode: string }>(callRequests[0], 202);
  assert.equal(firstCall.mode, 'fixture');
  assert.equal(read<typeof firstCall>(callRequests[1], 202).callAttemptId, firstCall.callAttemptId);
  const staleLease = randomUUID();
  const expired = await db.query(
    `UPDATE jobs SET status = 'leased', lease_token = $2, lease_expires_at = now() - interval '1 minute', attempts = 1
     WHERE call_attempt_id = $1`, [firstCall.callAttemptId, staleLease],
  );
  assert.equal(expired.rowCount, 1);
  assert.equal(await runOne(db, { baseUrl, agentToken: config.agentToken }), true);
  const reclaimed = await db.query<{ status: string; attempts: number }>(
    'SELECT status, attempts FROM jobs WHERE call_attempt_id = $1', [firstCall.callAttemptId],
  );
  assert.deepEqual(reclaimed.rows, [{ status: 'done', attempts: 2 }]);
  const firstReview = read<Review>(await request('GET', `/admin${firstPath}`, staff), 200);
  assert.equal(firstReview.selectedAttemptId, firstCall.callAttemptId);
  assert.ok(firstReview.answers.some(({ questionId }) => questionId === 'q_1'));
  const evidenceFromOtherAttempt = firstReview.transcript[0].id;

  const secondCall = read<typeof firstCall>(await request('POST', `${secondPath}/call`, secondFan), 202);
  const lease = randomUUID();
  await db.query(
    `UPDATE jobs SET status = 'leased', lease_token = $2, lease_expires_at = now() + interval '2 minutes', attempts = 1
     WHERE call_attempt_id = $1`, [secondCall.callAttemptId, lease],
  );
  const ingestUrl = '/internal/interviews/events';
  const timestamp = new Date().toISOString();
  function ingest(eventId: string, fields: object, leaseToken = lease) {
    return api.inject({ method: 'POST', url: ingestUrl,
      headers: { authorization: `Bearer ${config.agentToken}`, 'x-job-lease': leaseToken },
      payload: { eventId: `${runId}:${eventId}`, callAttemptId: secondCall.callAttemptId, ...fields } });
  }

  const dialing = { type: 'call_status', status: 'dialing', timestamp };
  assert.equal((await api.inject({ method: 'POST', url: ingestUrl, payload: dialing })).statusCode, 401);
  assert.equal((await ingest('dialing', dialing, staleLease)).statusCode, 409);
  read(await ingest('dialing', dialing), 200);
  read(await ingest('connected', { type: 'call_status', status: 'connected', timestamp }), 200);
  const answerSegment = { type: 'transcript', sequence: 1, speaker: 'applicant', text: 'Meet other fans.', timestamp };
  const stored = read<{ duplicate: boolean }>(await ingest('answer', answerSegment), 200);
  assert.equal(stored.duplicate, false);
  assert.equal(read<typeof stored>(await ingest('answer', answerSegment), 200).duplicate, true);
  assert.equal((await ingest('answer', { ...answerSegment, text: 'Different text' })).statusCode, 409);
  read(await ingest('opening', { type: 'transcript', sequence: 0, speaker: 'agent', text: 'What would you like to do?', timestamp }), 200);
  read(await ingest('completed', { type: 'call_status', status: 'completed', timestamp }), 200);
  read(await ingest('extract-failed', { type: 'processing_error', failureCode: 'FIXTURE_EXTRACTION_FAILED' }), 200);
  const failed = read<Review>(await request('GET', `/admin${secondPath}`, staff), 200);
  assert.equal(failed.attempts[0].status, 'completed');
  assert.equal(failed.attempts[0].processingStatus, 'failed');
  assert.deepEqual(failed.transcript.map(({ sequence }) => sequence), [0, 1]);

  const result = {
    type: 'result', schemaVersion: 1, interviewVersionId: secondVersion.id, summary: 'Wants to meet fans.', interests: [],
    unansweredQuestionIds: [], reviewNotes: [],
    answers: [{ questionId: 'q_2', summary: 'Meet other fans.', transcriptSegmentIds: [`${runId}:answer`], completeness: 'answered' }],
  };
  assert.equal((await ingest('invalid-version', { ...result, interviewVersionId: firstVersion.id })).statusCode, 409);
  const invalidAnswer = { ...result.answers[0], transcriptSegmentIds: [evidenceFromOtherAttempt] };
  assert.equal((await ingest('result', { ...result, answers: [invalidAnswer] })).statusCode, 409);
  assert.equal(read<{ duplicate: boolean }>(await ingest('result', result), 200).duplicate, false);
  assert.equal(read<{ duplicate: boolean }>(await ingest('result', result), 200).duplicate, true);
  const processed = read<Review>(await request('GET', `/admin${secondPath}`, staff), 200);
  assert.equal(processed.attempts[0].processingStatus, 'ready');
  assert.equal(processed.answers[0].questionId, 'q_2');
  await db.query(
    `UPDATE jobs SET status = 'done', lease_token = NULL, lease_expires_at = NULL
     WHERE call_attempt_id = $1 AND lease_token = $2`, [secondCall.callAttemptId, lease],
  );

  await db.query(
    `INSERT INTO call_attempts (application_id, mode, status, ended_at, failure_code)
     VALUES ($1, 'fixture', 'failed', now(), 'FIXTURE_LATER_FAILURE')`, [first.id],
  );
  const afterLaterFailure = read<Review>(await request('GET', `/admin${firstPath}`, staff), 200);
  assert.equal(afterLaterFailure.attempts[0].status, 'failed');
  assert.equal(afterLaterFailure.selectedAttemptId, firstCall.callAttemptId);
  assert.deepEqual(afterLaterFailure.transcript, firstReview.transcript);

  const pending = read<Analytics>(await request('GET', statsUrl, staff), 200);
  assert.equal(pending.reviewsPending, 2);
  const list = read<{ total: number; applications: Application[] }>(await request('GET',
    `/admin/applications?eventId=${event.id}&callStatus=completed&pageSize=1`, staff), 200);
  assert.equal(list.total, 1);
  assert.equal(list.applications[0].id, second.id);
  read(await request('POST', `/admin${firstPath}/decision`, staff, { decision: 'waitlisted' }), 200, 201);
  assert.equal(read<Application>(await request('GET', firstPath, firstFan), 200).status, 'waitlisted');
  for (const path of [firstPath, secondPath]) {
    read(await request('POST', `/admin${path}/decision`, staff, { decision: 'invited', reason: 'Synthetic review' }), 200, 201);
  }
  const decisions = read<Review>(await request('GET', `/admin${firstPath}`, staff), 200).decisions;
  assert.deepEqual(decisions.map(({ decision }) => decision), ['invited', 'waitlisted']);

  const acceptances = await Promise.all([
    request('POST', `${firstPath}/accept`, firstFan),
    request('POST', `${secondPath}/accept`, secondFan),
  ]);
  assert.deepEqual(acceptances.map(({ statusCode }) => statusCode).sort(), [200, 409]);
  const winner = acceptances[0].statusCode === 200 ? 0 : 1;
  assert.equal(read<Application>(acceptances[winner], 200).status, 'accepted');
  assert.equal(read<{ error: { code: string } }>(acceptances[1 - winner], 409).error.code, 'EVENT_FULL');
  const [winningFan, winningPath] = winner === 0 ? [firstFan, firstPath] : [secondFan, secondPath];
  assert.equal(read<Application>(await request('POST', `${winningPath}/accept`, winningFan), 200).status, 'accepted');

  const stats = read<Analytics>(await request('GET', statsUrl, staff), 200);
  assert.deepEqual(stats, { applications: 2, callsAttempted: 2, callsConnected: 2, interviewsCompleted: 2,
    reviewsPending: 0, invitationsIssued: 2, accepted: 1, connectionRate: 1, interviewCompletionRate: 1 });
});
