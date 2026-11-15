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

  const inbox = new Map<string, string>();
  const useSmtp = process.env.TEST_SMTP === '1';
  const api = app = buildApp(config, db, useSmtp ? undefined : async (to, url) => { inbox.set(to, url); });
  if (schema !== 'faze') {
    const beforeMigration = await api.inject({ method: 'GET', url: '/health' });
    assert.equal(read<{ error: { code: string } }>(beforeMigration, 503).error.code, 'SCHEMA_NOT_READY');
  }
  await migrate(db, schema);
  migrated = true;
  await seed(db);
  await api.listen({ host: '127.0.0.1', port });

  function request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    cookie?: string,
    payload?: object,
    extraHeaders?: Record<string, string>,
  ) {
    return api.inject({
      method,
      url,
      headers: { ...(cookie ? { cookie } : {}), ...extraHeaders },
      payload,
    });
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

  const health = read<{ status: string; apiVersion: string; capabilities: string[] }>(await request('GET', '/health'), 200);
  assert.equal(health.apiVersion, 'faze-id-v1');
  assert.ok(health.capabilities.includes('players') && health.capabilities.includes('rewards'));
  if (schema !== 'faze') {
    await db.query('ALTER VIEW engagement_players RENAME TO engagement_players_not_ready');
    assert.equal(read<{ error: { code: string } }>(await request('GET', '/health'), 503).error.code, 'SCHEMA_NOT_READY');
    await db.query('ALTER VIEW engagement_players_not_ready RENAME TO engagement_players');
  }
  assert.equal((await request('GET', '/me')).statusCode, 401);
  const staff = await signIn('staff@example.test');
  const firstFan = await signIn(testEmails[0], true);
  const secondFan = await signIn(testEmails[1]);
  assert.equal(read<{ role: string }>(await request('GET', '/me', staff), 200).role, 'staff');
  assert.equal((await request('GET', '/me/applications', staff)).statusCode, 200);
  assert.equal(read<{ role: string }>(await request('GET', '/me', firstFan), 200).role, 'fan');
  assert.deepEqual(read(await request('GET', '/me/activity', firstFan), 200), { activity: [] });
  assert.equal((await request('PATCH', '/me', firstFan, { phone: '+12025550100' })).statusCode, 200);
  assert.equal((await request('PATCH', '/me', secondFan, { phone: '+12025550101' })).statusCode, 200);

  async function balance(fan: string) {
    return read<{ balance: number }>(await request('GET', '/me/points', fan), 200).balance;
  }
  function errorCode(response: Response, status: number) {
    return read<{ error: { code: string } }>(response, status).error.code;
  }
  const secondId = read<{ id: string }>(await request('GET', '/me', secondFan), 200).id;
  const adjustUrl = `/admin/users/${secondId}/point-adjustments`;
  const adjustment = (delta: number) => ({ delta, reason: 'Synthetic concurrency test', idempotencyKey: randomUUID() });
  const engagement = schema !== 'faze';
  let merchId = '';
  if (engagement) {
    assert.equal(errorCode(await request('PUT', '/me/follows/demo-player', firstFan), 404), 'PLAYER_NOT_FOUND');
    await db.query(`
      INSERT INTO esports_players(id,handle,display_name,roster_status,checked_at,profile)
      VALUES ('demo-player','Demo','Synthetic test player','active',now(),'{}');
      CREATE VIEW engagement_matches AS
        SELECT 'demo-match'::text AS id, '[Replay] CS2 match'::text AS title, now() + interval '1 day' AS starts_at,
          '[{"id":"a","label":"Demo team A"},{"id":"b","label":"Demo team B"}]'::jsonb AS participants, true AS is_demo;
      CREATE VIEW engagement_tournaments AS
        SELECT 'demo-tournament'::text AS id, '[Replay] CS2 tournament'::text AS title,
          '[{"id":"a","label":"Demo team A"}]'::jsonb AS teams, true AS is_demo;
    `);
    assert.equal(errorCode(await request('PUT', '/me/follows/unknown', firstFan), 404), 'PLAYER_NOT_FOUND');
    for (const method of ['PUT', 'DELETE', 'PUT', 'PUT'] as const) {
      assert.equal((await request(method, '/me/follows/demo-player', firstFan)).statusCode, 204);
    }
    assert.deepEqual(read(await request('GET', '/me/follows', firstFan), 200), { playerIds: ['demo-player'], follows: ['demo-player'] });
    assert.deepEqual(read(await request('GET', '/me/follows', secondFan), 200), { playerIds: [], follows: [] });

    const markets = '/admin/prediction-markets';
    const locksAt = new Date(Date.now() + 3_600_000).toISOString();
    const match = read<{ id: string; awardPoints: number; type: string; state: string }>(await request('POST', markets, staff,
      { kind: 'match_winner', referenceId: 'demo-match', locksAt }), 201);
    assert.equal(match.awardPoints, 100);
    assert.equal(match.type, 'match_winner');
    assert.equal(match.state, 'open');
    const customMarket = read<{ id: string; type: string; award: number; options: { id: string; label: string }[] }>(
      await request('POST', markets, staff, {
        type: 'match_winner',
        title: 'Custom FaZe vs OpTic',
        matchId: null,
        tournamentId: null,
        options: ['FaZe', 'OpTic', ''],
        locksAt,
        award: 100,
      }),
      201,
    );
    assert.equal(customMarket.type, 'match_winner');
    assert.equal(customMarket.award, 100);
    assert.equal(customMarket.options.length, 2);
    const placement = read<{ id: string; options: { id: string }[] }>(await request('POST', markets, staff,
      { kind: 'tournament_placement', referenceId: 'demo-tournament', teamId: 'a', locksAt }), 201);
    assert.deepEqual(placement.options.map(option => option.id), ['first', 'second', 'third_fourth', 'fifth_or_lower']);
    const pickUrl = `/predictions/markets/${match.id}/pick`;
    const settleUrl = `${markets}/${match.id}/settle`;
    const pick = { optionId: 'a' };
    const settle = { ...pick, sourceUrl: 'https://example.test/demo-result' };
    assert.equal(errorCode(await request('POST', pickUrl, firstFan, { optionId: 'invalid' }), 400), 'INVALID_OPTION');
    read(await request('POST', pickUrl, firstFan, pick), 201);
    assert.equal(errorCode(await request('POST', pickUrl, firstFan, pick), 409), 'DUPLICATE_PICK');
    assert.equal((await request('POST', settleUrl, firstFan, settle)).statusCode, 403);

    // Settling an open market before locksAt closes picks and settles immediately.
    read(await request('POST', `/predictions/markets/${customMarket.id}/pick`, secondFan, { optionId: 'opt_2' }), 201);
    read(await request('POST', `${markets}/${customMarket.id}/settle`, staff, { optionId: 'opt_1', sourceUrl: settle.sourceUrl }), 200);
    assert.equal(errorCode(await request('POST', `/predictions/markets/${customMarket.id}/pick`, firstFan, { optionId: 'opt_1' }), 409), 'MARKET_LOCKED');

    assert.equal(read<{ total: number }>(await request('GET', `${markets}/${match.id}/picks`, staff), 200).total, 1);
    const adminMarkets = read<{
      markets: { id: string; status: string; state: string; result: { optionId: string } | null; pickCount: number; picksByOption: Record<string, number> }[];
    }>(
      await request('GET', markets, staff), 200,
    ).markets;
    const matchAdmin = adminMarkets.find(row => row.id === match.id);
    assert.equal(matchAdmin?.pickCount, 1);
    assert.deepEqual(matchAdmin?.picksByOption, { a: 1, b: 0 });
    const earlySettledAdmin = adminMarkets.find(row => row.id === customMarket.id);
    assert.equal(earlySettledAdmin?.status, 'settled');
    assert.equal(earlySettledAdmin?.state, 'settled');
    assert.equal(earlySettledAdmin?.result?.optionId, 'opt_1');
    const anonMarkets = read<{ markets: { id: string; myPick: unknown }[] }>(
      await request('GET', '/predictions/markets'), 200,
    ).markets;
    assert.equal(anonMarkets.find(row => row.id === match.id)?.myPick, null);

    let delayedPick: ReturnType<typeof request> | undefined;
    await transaction(db, async client => {
      await client.query('SELECT id FROM prediction_markets WHERE id=$1 FOR UPDATE', [match.id]);
      delayedPick = request('POST', pickUrl, secondFan, pick);
      const timeoutAt = Date.now() + 5000;
      while (true) {
        const { rowCount } = await db.query(`
          SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() <> pid AND wait_event_type='Lock'
            AND query='SELECT options FROM prediction_markets WHERE id=$1 FOR UPDATE'
        `);
        if (rowCount) break;
        assert.ok(Date.now() < timeoutAt, 'Expected the second pick to be waiting on the market lock');
        await delay(25);
      }
      await client.query('UPDATE prediction_markets SET locks_at=clock_timestamp() WHERE id=$1', [match.id]);
    });
    assert.equal(errorCode(await delayedPick!, 409), 'MARKET_LOCKED');
    const resolutions = await Promise.all([request('POST', settleUrl, staff, settle), request('POST', settleUrl, staff, settle)]);
    assert.deepEqual(read(resolutions[0], 200), read(resolutions[1], 200));
    assert.equal(errorCode(await request('POST', settleUrl, staff, { ...settle, optionId: 'b' }), 409), 'SETTLEMENT_CONFLICT');

    read(await request('POST', `/predictions/markets/${placement.id}/pick`, secondFan, { optionId: 'first' }), 201);
    await db.query('UPDATE prediction_markets SET locks_at=clock_timestamp() WHERE id=$1', [placement.id]);
    read(await request('POST', `${markets}/${placement.id}/settle`, staff, { ...settle, optionId: null }), 200);
    const secondMarkets = read<{ markets: { id: string; status: string; state: string; result: unknown; myPick: unknown }[] }>(
      await request('GET', '/predictions/markets', secondFan), 200).markets;
    const voidedFanMarket = secondMarkets.find(row => row.id === placement.id);
    assert.equal(voidedFanMarket?.status, 'void');
    assert.equal(voidedFanMarket?.state, 'void');
    assert.equal(voidedFanMarket?.result, null);
    assert.equal(secondMarkets.find(row => row.id === match.id)?.myPick, null);
    const adminMarketsAfterVoid = read<{ markets: { id: string; status: string; state: string; result: unknown }[] }>(
      await request('GET', markets, staff), 200).markets;
    const voidedAdminMarket = adminMarketsAfterVoid.find(row => row.id === placement.id);
    assert.equal(voidedAdminMarket?.status, 'void');
    assert.equal(voidedAdminMarket?.state, 'void');
    assert.equal(voidedAdminMarket?.result, null);
    const winnerLedger = read<{ entries: { sourceType: string; delta: number }[]; balance: number }>(
      await request('GET', '/me/points', firstFan), 200);
    assert.equal(winnerLedger.balance, 100);
    assert.equal(winnerLedger.entries.length, 1);
    assert.equal(winnerLedger.entries[0].sourceType, 'prediction');
    assert.equal(await balance(secondFan), 0);
    assert.equal((await request('GET', `/admin/users/${secondId}/points`, firstFan)).statusCode, 403);
    assert.equal((await request('POST', adjustUrl, firstFan, adjustment(1))).statusCode, 403);

    const demoReward = { kind: 'merchandise', title: 'Sample FaZe merch', terms: 'Proposed demo benefit', pointCost: 50, stock: 10 };
    const createdDemoReward = read<{ id: string; kind: string; redeemable: boolean }>(await request('POST', '/admin/rewards', staff, demoReward), 201);
    assert.equal(createdDemoReward.kind, 'merch');
    assert.equal(createdDemoReward.redeemable, true);
    merchId = createdDemoReward.id;
    const redeemUrl = `/rewards/${merchId}/redeem`;
    const claimInput = { idempotencyKey: randomUUID() };
    const claim = read<{ status: string }>(await request('POST', redeemUrl, firstFan, claimInput), 201);
    assert.equal(claim.status, 'requested');
    assert.deepEqual(read(await request('POST', redeemUrl, firstFan, claimInput), 200), claim);
    const concept = read<{ id: string; kind: string; redeemable: boolean }>(await request('POST', '/admin/rewards', staff,
      { kind: 'raffle', title: 'Sample raffle concept', terms: 'Proposed benefit' }), 201);
    assert.equal(concept.kind, 'raffle');
    assert.equal(concept.redeemable, false);
    assert.equal(errorCode(await request('POST', `/rewards/${concept.id}/redeem`, firstFan, claimInput), 409), 'IDEMPOTENCY_CONFLICT');
    assert.equal(errorCode(await request('POST', `/rewards/${concept.id}/redeem`, firstFan, { idempotencyKey: randomUUID() }), 409), 'REWARD_UNAVAILABLE');
    assert.deepEqual(read(await request('GET', '/me/redemptions', secondFan), 200), { redemptions: [] });
    const anonRewards = read<{ rewards: { id: string; title: string; kind: string; cost: number }[] }>(await request('GET', '/rewards'), 200).rewards;
    assert.ok(anonRewards.some(row => row.title === 'Sample FaZe merch' && row.kind === 'merch' && row.cost === 50));
    const { rewards } = read<{ rewards: { id: string; stock: number }[] }>(await request('GET', '/rewards', firstFan), 200);
    assert.equal(rewards.find(row => row.id === merchId)?.stock, 9);
    assert.equal(await balance(firstFan), 50);
  }

  const eventInput = {
    title: eventTitle,
    description: 'Synthetic integration event',
    location: 'Arlington',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'draft',
    capacity: 1,
    minimumPoints: engagement ? 50 : 0,
  };
  assert.equal((await request('POST', '/admin/events', firstFan, eventInput)).statusCode, 403);
  assert.equal((await request('POST', '/admin/events', staff, { ...eventInput, capacity: 0 })).statusCode, 400);
  const event = read<{ id: string }>(await request('POST', '/admin/events', staff, eventInput), 201);
  eventId = event.id;
  assert.equal((await request('GET', `/events/${event.id}`)).statusCode, 404);
  const draftState = read<{ draft: { questions: unknown[] }; publishedVersion: unknown; hasUnpublishedChanges: boolean }>(
    await request('GET', `/admin/events/${event.id}/interview`, staff), 200,
  );
  assert.equal(draftState.draft.questions.length, 4);
  assert.equal(draftState.publishedVersion, null);
  assert.equal(draftState.hasUnpublishedChanges, true);
  await db.query('UPDATE events SET draft = NULL WHERE id = $1', [event.id]);
  const nullDraftState = read<typeof draftState>(await request('GET', `/admin/events/${event.id}/interview`, staff), 200);
  assert.equal(nullDraftState.draft.questions.length, 4);
  assert.equal(nullDraftState.hasUnpublishedChanges, true);
  const staffEvents = read<{ events: Array<{ id: string; status: string }> }>(await request('GET', '/admin/events', staff), 200);
  assert.ok(staffEvents.events.some(row => row.id === event.id && row.status === 'draft'));
  read(await request('PATCH', `/admin/events/${event.id}`, staff, {
    status: 'published', ...(engagement ? { minimumPoints: 50 } : {}),
  }), 200);
  const autoPublished = read<{ publishedVersion: { version: number } | null; hasUnpublishedChanges: boolean }>(
    await request('GET', `/admin/events/${event.id}/interview`, staff), 200,
  );
  assert.equal(autoPublished.publishedVersion?.version, 1);
  assert.equal(autoPublished.hasUnpublishedChanges, false);
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
  if (engagement) {
    assert.equal(read<{ minimumPoints: number }>(await request('GET', `/events/${event.id}`), 200).minimumPoints, 50);
    assert.equal(errorCode(await request('POST', applyUrl, secondFan, consent), 409), 'INSUFFICIENT_EVENT_POINTS');
    const credit = adjustment(50);
    const saved = read(await request('POST', adjustUrl, staff, credit), 201);
    assert.deepEqual(read(await request('POST', adjustUrl, staff, credit), 200), saved);
    assert.equal(await balance(secondFan), 50);
  }
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
  if (engagement) assert.equal(await balance(firstFan), 50);
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
  const losingPath = winner === 0 ? secondPath : firstPath;
  assert.equal((await request('POST', `/admin${losingPath}/attendance`, staff)).statusCode, 409);
  const beforeAttendance = await balance(winningFan);
  assert.deepEqual(read<{ recorded: boolean }>(await request('POST', `/admin${winningPath}/attendance`, staff), 200), { recorded: true });
  assert.deepEqual(read<{ recorded: boolean }>(await request('POST', `/admin${winningPath}/attendance`, staff), 200), { recorded: true });
  const winningActivity = read<{ activity: Array<{ type: string; eventId: string }> }>(await request('GET', '/me/activity', winningFan), 200);
  assert.equal(winningActivity.activity.filter(item => item.type === 'attendance' && item.eventId === event.id).length, 1);
  assert.equal(await balance(winningFan), beforeAttendance + 25);

  if (engagement) {
    const redeem = (id: string, fan: string) => request('POST', `/rewards/${id}/redeem`, fan, { idempotencyKey: randomUUID() });
    const sameFan = await Promise.all([redeem(merchId, secondFan), redeem(merchId, secondFan)]);
    assert.deepEqual(sameFan.map(result => result.statusCode).sort(), [201, 409]);
    assert.equal(errorCode(sameFan.find(result => result.statusCode === 409)!, 409), 'INSUFFICIENT_POINTS');
    const lastItem = read<{ id: string }>(await request('POST', '/admin/rewards', staff,
      { title: 'Last sample', kind: 'merchandise', terms: 'Proposed benefit', stock: 1, pointCost: 50 }), 201);
    const creditSecondTo50 = async () => read(await request('POST', adjustUrl, staff, adjustment(50 - await balance(secondFan))), 201);
    await creditSecondTo50();
    const stockRace = await Promise.all([redeem(lastItem.id, firstFan), redeem(lastItem.id, secondFan)]);
    assert.deepEqual(stockRace.map(result => result.statusCode).sort(), [201, 409]);
    assert.equal(errorCode(stockRace.find(result => result.statusCode === 409)!, 409), 'REWARD_OUT_OF_STOCK');
    assert.equal(read<{ redemptions: unknown[] }>(
      await request('GET', `/admin/rewards/${lastItem.id}/redemptions`, staff), 200).redemptions.length, 1);
    if (await balance(secondFan) < 50) await creditSecondTo50();
    const debitRace = await Promise.all([redeem(merchId, secondFan), request('POST', adjustUrl, staff, adjustment(-50))]);
    assert.deepEqual(debitRace.map(result => result.statusCode).sort(), [201, 409]);
    assert.equal(await balance(secondFan), 0);
    read(await request('POST', applyUrl, secondFan, consent), 200);

    // Header Idempotency-Key redemption and UI-style point adjustment without body key
    read(await request('POST', adjustUrl, staff, { delta: 50, reason: 'Header key UI credit' }), 201);
    const headerRedeemKey = randomUUID();
    const seededRewardId = read<{ rewards: { id: string }[] }>(await request('GET', '/rewards'), 200).rewards
      .find(row => row.id !== merchId && row.id !== lastItem.id)?.id;
    assert.ok(seededRewardId);
    const headerClaim = read<{ rewardTitle: string; cost: number; status: string }>(
      await request('POST', `/rewards/${seededRewardId}/redeem`, secondFan, {}, { 'Idempotency-Key': headerRedeemKey }),
      201,
    );
    assert.equal(headerClaim.rewardTitle, 'Sample FaZe merch');
    assert.equal(headerClaim.cost, 50);
    assert.equal(headerClaim.status, 'requested');
    assert.deepEqual(
      read(await request('POST', `/rewards/${seededRewardId}/redeem`, secondFan, {}, { 'Idempotency-Key': headerRedeemKey }), 200),
      headerClaim,
    );
    const secondRedemptions = read<{ redemptions: Array<{ id: string; status: string }> }>(
      await request('GET', '/me/redemptions', secondFan), 200,
    ).redemptions;
    assert.ok(secondRedemptions.some(row => row.status === 'requested'));
    const adminRedemptions = read<{
      redemptions: Array<{ id: string; rewardTitle: string; cost: number; status: string; fan: { id: string; email: string } }>;
    }>(await request('GET', '/admin/redemptions', staff), 200).redemptions;
    assert.ok(adminRedemptions.some(row =>
      row.rewardTitle === 'Sample FaZe merch' && row.cost === 50 && row.status === 'requested' && row.fan.id === secondId));

    // Unlimited-stock merch reward (stock: null) creation, patching, and redemption, plus merch cost enforcement
    const unlimitedReward = read<{ id: string; kind: string; stock: number | null; cost: number; redeemable: boolean }>(
      await request('POST', '/admin/rewards', staff, {
        title: 'Unlimited FaZe Sticker',
        description: 'Not stock-limited.',
        kind: 'merch',
        cost: 25,
        stock: null,
        active: true,
        terms: 'Proposed demo benefit',
      }),
      201,
    );
    assert.equal(unlimitedReward.kind, 'merch');
    assert.equal(unlimitedReward.stock, null);
    assert.equal(unlimitedReward.cost, 25);
    assert.equal(unlimitedReward.redeemable, true);
    assert.equal(errorCode(await request('POST', '/admin/rewards', staff, {
      title: 'Missing cost merch',
      kind: 'merch',
      stock: null,
    }), 400), 'INVALID_REWARD');
    const patchedUnlimited = read<{ id: string; stock: number | null; redeemable: boolean }>(
      await request('PATCH', `/admin/rewards/${merchId}`, staff, { stock: null }),
      200,
    );
    assert.equal(patchedUnlimited.stock, null);
    assert.equal(patchedUnlimited.redeemable, true);
    assert.equal(errorCode(await request('PATCH', `/admin/rewards/${merchId}`, staff, { cost: null }), 400), 'INVALID_REWARD');
    const patchedFinite = read<{ stock: number | null; redeemable: boolean }>(
      await request('PATCH', `/admin/rewards/${merchId}`, staff, { stock: 0 }),
      200,
    );
    assert.equal(patchedFinite.stock, 0);
    assert.equal(patchedFinite.redeemable, false);
    assert.equal(errorCode(await request('POST', `/rewards/${merchId}/redeem`, firstFan, { idempotencyKey: randomUUID() }), 409), 'REWARD_OUT_OF_STOCK');
    assert.equal(read<{ stock: number | null; redeemable: boolean }>(
      await request('PATCH', `/admin/rewards/${merchId}`, staff, { stock: null }), 200).redeemable, true);
    const zeroCostConcept = read<{ id: string }>(await request('POST', '/admin/rewards', staff, {
      kind: 'raffle',
      title: 'Costless concept',
      terms: 'Proposed',
    }), 201);
    assert.equal(errorCode(await request('PATCH', `/admin/rewards/${zeroCostConcept.id}`, staff, { kind: 'merch' }), 400), 'INVALID_REWARD');
    const promotedConcept = read<{ kind: string; cost: number; redeemable: boolean }>(
      await request('PATCH', `/admin/rewards/${zeroCostConcept.id}`, staff, { kind: 'merch', cost: 25 }),
      200,
    );
    assert.equal(promotedConcept.kind, 'merch');
    assert.equal(promotedConcept.cost, 25);
    assert.equal(promotedConcept.redeemable, true);
    assert.equal(read<{ active: boolean; redeemable: boolean }>(
      await request('PATCH', `/admin/rewards/${zeroCostConcept.id}`, staff, { active: false }), 200).redeemable, false);
    const balanceBeforeUnlimited = await balance(secondFan);
    read(await request('POST', adjustUrl, staff, { delta: 50, reason: 'Unlimited merch test credit' }), 201);
    const unlimitedClaim = read<{ status: string; cost: number }>(
      await request('POST', `/rewards/${unlimitedReward.id}/redeem`, secondFan, { idempotencyKey: randomUUID() }),
      201,
    );
    assert.equal(unlimitedClaim.status, 'requested');
    assert.equal(unlimitedClaim.cost, 25);
    const secondUnlimitedClaim = read<{ status: string; cost: number }>(
      await request('POST', `/rewards/${unlimitedReward.id}/redeem`, secondFan, { idempotencyKey: randomUUID() }),
      201,
    );
    assert.equal(secondUnlimitedClaim.status, 'requested');
    assert.equal(await balance(secondFan), balanceBeforeUnlimited);
    const publicAfterUnlimited = read<{ rewards: Array<{ id: string; kind: string; stock: number | null; redeemable: boolean }> }>(
      await request('GET', '/rewards'), 200,
    ).rewards;
    assert.deepEqual(
      publicAfterUnlimited.find(row => row.id === unlimitedReward.id),
      {
        id: unlimitedReward.id,
        title: 'Unlimited FaZe Sticker',
        description: 'Not stock-limited.',
        kind: 'merch',
        terms: 'Proposed demo benefit',
        pointCost: 25,
        cost: 25,
        stock: null,
        active: true,
        isDemo: true,
        redeemable: true,
      },
    );

    // Settling and voiding open prediction markets before locksAt awards winners and keeps void result null.
    const futureLock = new Date(Date.now() + 3_600_000).toISOString();
    const earlyWinMarket = read<{ id: string }>(await request('POST', '/admin/prediction-markets', staff, {
      type: 'match_winner',
      title: 'Early Settle Open Match',
      matchId: null,
      tournamentId: null,
      options: ['FaZe', 'Vitality'],
      locksAt: futureLock,
      award: 25,
    }), 201);
    const secondBalanceBeforeEarly = await balance(secondFan);
    read(await request('POST', `/predictions/markets/${earlyWinMarket.id}/pick`, secondFan, { optionId: 'opt_1' }), 201);
    read(await request('POST', `/admin/prediction-markets/${earlyWinMarket.id}/settle`, staff, {
      optionId: 'opt_1',
      sourceUrl: 'https://example.test/early-result',
    }), 200);
    assert.equal(await balance(secondFan), secondBalanceBeforeEarly + 25);
    const earlyVoidMarket = read<{ id: string }>(await request('POST', '/admin/prediction-markets', staff, {
      type: 'placement',
      title: 'Early Void Open Placement',
      matchId: null,
      tournamentId: null,
      options: ['1st', '2nd'],
      locksAt: futureLock,
      award: 50,
    }), 201);
    const voidedPayload = { optionId: null, sourceUrl: 'https://example.test/early-void' };
    const voidedEarly = read<{ optionId: string | null; sourceUrl: string }>(
      await request('POST', `/admin/prediction-markets/${earlyVoidMarket.id}/settle`, staff, voidedPayload), 200);
    assert.equal(voidedEarly.optionId, null);
    assert.deepEqual(
      read(await request('POST', `/admin/prediction-markets/${earlyVoidMarket.id}/settle`, staff, voidedPayload), 200),
      voidedEarly,
    );
    assert.equal(errorCode(
      await request('POST', `/admin/prediction-markets/${earlyVoidMarket.id}/settle`, staff, { ...voidedPayload, optionId: 'opt_1' }),
      409,
    ), 'SETTLEMENT_CONFLICT');
    assert.equal(errorCode(
      await request('POST', `/predictions/markets/${earlyVoidMarket.id}/pick`, secondFan, { optionId: 'opt_1' }),
      409,
    ), 'MARKET_LOCKED');

    const raceMarket = read<{ id: string }>(await request('POST', '/admin/prediction-markets', staff, {
      type: 'match_winner',
      title: 'Concurrent Early Settle Race',
      matchId: null,
      tournamentId: null,
      options: ['FaZe', 'NAVI'],
      locksAt: futureLock,
      award: 25,
    }), 201);
    let racedPick: ReturnType<typeof request> | undefined;
    await transaction(db, async client => {
      await client.query('SELECT id FROM prediction_markets WHERE id=$1 FOR UPDATE', [raceMarket.id]);
      racedPick = request('POST', `/predictions/markets/${raceMarket.id}/pick`, secondFan, { optionId: 'opt_1' });
      const timeoutAt = Date.now() + 5000;
      while (true) {
        const { rowCount } = await db.query(`
          SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() <> pid AND wait_event_type='Lock'
            AND query='SELECT options FROM prediction_markets WHERE id=$1 FOR UPDATE'
        `);
        if (rowCount) break;
        assert.ok(Date.now() < timeoutAt, 'Expected the pick to be waiting on the open market lock');
        await delay(25);
      }
      await client.query(`
        INSERT INTO prediction_settlements (market_id, option_id, source_url, reviewer_id)
        VALUES ($1, 'opt_1', 'https://example.test/race-result', 'demo-staff')
      `, [raceMarket.id]);
    });
    assert.equal(errorCode(await racedPick!, 409), 'MARKET_LOCKED');

    const publicMarketsAfterEarly = read<{ markets: Array<{ id: string; state: string; result: unknown }> }>(
      await request('GET', '/predictions/markets', secondFan), 200,
    ).markets;
    assert.equal(publicMarketsAfterEarly.find(row => row.id === earlyWinMarket.id)?.state, 'settled');
    assert.equal(publicMarketsAfterEarly.find(row => row.id === earlyVoidMarket.id)?.state, 'void');
    assert.equal(publicMarketsAfterEarly.find(row => row.id === earlyVoidMarket.id)?.result, null);
    const adminMarketsAfterEarly = read<{ markets: Array<{ id: string; state: string; result: unknown }> }>(
      await request('GET', '/admin/prediction-markets', staff), 200,
    ).markets;
    assert.equal(adminMarketsAfterEarly.find(row => row.id === earlyVoidMarket.id)?.state, 'void');
    assert.equal(adminMarketsAfterEarly.find(row => row.id === earlyVoidMarket.id)?.result, null);
  }

  assert.equal((await request('GET', '/admin/insights', firstFan)).statusCode, 403);
  const insights = read<{
    includesDemoData: boolean;
    events: Array<{
      event: { id: string };
      phase: string;
      funnel: { applied: number; interviewed: number; invited: number; accepted: number; attended: number | null };
      demand: { numerator: number; denominator: number };
      questions: Array<{ questionId: string; answered: number }>;
    }>;
    retention: { fans: number };
  }>(await request('GET', '/admin/insights', staff), 200);
  assert.equal(insights.includesDemoData, true);
  assert.ok(insights.retention.fans >= 2);
  const eventInsights = insights.events.find(row => row.event.id === event.id);
  assert.deepEqual(eventInsights?.funnel, { applied: 2, interviewed: 2, invited: 2, accepted: 1, attended: null });
  assert.deepEqual(eventInsights?.demand, { numerator: 2, denominator: 1 });
  assert.ok(eventInsights?.questions.some(q => q.questionId === 'q_1' && q.answered === 1));
  assert.ok(eventInsights?.questions.some(q => q.questionId === 'q_2' && q.answered === 1));

  const stats = read<Analytics>(await request('GET', statsUrl, staff), 200);
  assert.deepEqual(stats, { applications: 2, callsAttempted: 2, callsConnected: 2, interviewsCompleted: 2,
    reviewsPending: 0, invitationsIssued: 2, accepted: 1, connectionRate: 1, interviewCompletionRate: 1 });
});
