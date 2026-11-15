import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { loadConfig } from './config.ts';
import { createPool, transaction } from './db.ts';
import type { InterviewEvent } from './interviews.ts';
import { consentVersion } from './views.ts';

type WorkerOptions = { baseUrl: string; agentToken: string; leaseSeconds?: number };
type Job = { id: string; call_attempt_id: string; attempts: number };
type FixtureAttempt = {
  status: 'queued' | 'dialing' | 'connected' | 'completed' | 'missed' | 'failed' | 'canceled';
  connected_at: Date | null;
  interview_version_id: string;
  eligible: boolean;
};
type FixtureEvent = InterviewEvent extends infer Event
  ? Event extends InterviewEvent ? Omit<Event, 'eventId' | 'callAttemptId'> : never
  : never;

const maxAttempts = 3;
const failureCode = 'FIXTURE_RETRY_EXHAUSTED';

async function runFixture(db: Pool, options: WorkerOptions, job: Job, leaseToken: string): Promise<void> {
  const callAttemptId = job.call_attempt_id;
  const { rows } = await db.query<FixtureAttempt>(`
    SELECT c.status, c.connected_at, a.interview_version_id,
      (a.status IN ('submitted', 'interview_pending') AND e.status = 'published'
        AND e.starts_at > now() AND u."emailVerified" AND u.email LIKE '%@example.test' AND EXISTS (
          SELECT 1 FROM consents s WHERE s.application_id = a.id AND s.user_id = a.user_id
            AND s.consent_version = $2
        )) AS eligible
    FROM call_attempts c JOIN applications a ON a.id = c.application_id JOIN events e ON e.id = a.event_id
    JOIN "user" u ON u.id = a.user_id
    WHERE c.id = $1 AND c.mode = 'fixture'
  `, [callAttemptId, consentVersion]);
  const attempt = rows[0];
  if (!attempt || ['missed', 'failed', 'canceled'].includes(attempt.status)) return;

  const send = async (key: string, event: FixtureEvent): Promise<void> => {
    const response = await fetch(new URL('/internal/interviews/events', options.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.agentToken}`,
        'content-type': 'application/json',
        'x-job-lease': leaseToken,
      },
      body: JSON.stringify({ ...event, eventId: `${callAttemptId}:${key}`, callAttemptId }),
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Fixture event failed with HTTP ${response.status}`);
  };

  if (attempt.status === 'queued' && !attempt.eligible) {
    await send('canceled', { type: 'call_status', status: 'canceled', failureCode: 'CALL_INELIGIBLE' });
    return;
  }

  if (attempt.status === 'queued') await send('dialing', { type: 'call_status', status: 'dialing' });

  let connectedAt = attempt.connected_at;
  if (!connectedAt) {
    await send('connected', { type: 'call_status', status: 'connected' });
    const connected = await db.query<{ connected_at: Date | null }>(`
      SELECT connected_at FROM call_attempts WHERE id = $1
    `, [callAttemptId]);
    connectedAt = connected.rows[0]?.connected_at ?? null;
  }
  if (!connectedAt) throw new Error('Fixture connection timestamp missing');

  const questions = await db.query<{ id: string; prompt: string }>(`
    SELECT id, prompt FROM questions WHERE version_id = $1 ORDER BY position
  `, [attempt.interview_version_id]);

  const answers: Extract<InterviewEvent, { type: 'result' }>['answers'] = [];
  const timestamp = connectedAt.toISOString();
  for (const [index, question] of questions.rows.entries()) {
    const agentSequence = 2 * index;
    const fanSequence = agentSequence + 1;
    const sample = 'For this demo, I am interested in community events and meeting other fans.';
    await send(`segment:${agentSequence}`, {
      type: 'transcript', sequence: agentSequence, speaker: 'agent', text: question.prompt, timestamp,
    });
    await send(`segment:${fanSequence}`, {
      type: 'transcript', sequence: fanSequence, speaker: 'applicant', text: sample, timestamp,
    });
    answers.push({
      questionId: question.id,
      summary: sample,
      transcriptSegmentIds: [`${callAttemptId}:segment:${fanSequence}`],
      completeness: 'answered',
    });
  }

  if (attempt.status !== 'completed') await send('completed', { type: 'call_status', status: 'completed' });
  await send('result', {
    type: 'result', schemaVersion: 1, interviewVersionId: attempt.interview_version_id,
    summary: 'Synthetic interview about community events and meeting fans.', interests: ['community events'],
    answers, unansweredQuestionIds: [], reviewNotes: ['Synthetic fixture interview.'],
  });
}

async function exhaust(db: Pool, job: Job, leaseToken: string): Promise<void> {
  await transaction(db, async (client) => {
    await client.query(`
      SELECT a.id FROM applications a JOIN call_attempts c ON c.application_id = a.id
      WHERE c.id = $1 FOR UPDATE OF a
    `, [job.call_attempt_id]);
    const settled = await client.query<{ status: 'done' | 'failed' }>(`
      UPDATE jobs SET lease_token = NULL, lease_expires_at = NULL,
        status = CASE WHEN EXISTS (
          SELECT 1 FROM call_attempts c JOIN interview_results r ON r.call_attempt_id = c.id
          WHERE c.id = jobs.call_attempt_id AND c.status = 'completed' AND r.processing_status = 'ready'
        ) THEN 'done' ELSE 'failed' END
      WHERE id = $1 AND lease_token = $2 AND lease_expires_at > clock_timestamp()
      RETURNING status
    `, [job.id, leaseToken]);
    if (settled.rows[0]?.status !== 'failed') return;

    await client.query(`
      UPDATE call_attempts SET status = 'failed', ended_at = now(), failure_code = $2
      WHERE id = $1 AND status IN ('queued', 'dialing', 'connected')
    `, [job.call_attempt_id, failureCode]);
    await client.query(`
      UPDATE interview_results SET processing_status = 'failed', failure_code = $2, updated_at = now()
      WHERE call_attempt_id = $1 AND processing_status = 'pending'
    `, [job.call_attempt_id, failureCode]);
  });
}

export async function runOne(db: Pool, options: WorkerOptions): Promise<boolean> {
  const leaseToken = randomUUID();
  const { rows } = await db.query<Job>(`
    WITH next_job AS (
      SELECT id FROM jobs
      WHERE kind = 'start_call' AND EXISTS (
        SELECT 1 FROM call_attempts c WHERE c.id = jobs.call_attempt_id AND c.mode = 'fixture'
      ) AND (
        (status = 'pending' AND available_at <= clock_timestamp()) OR
        (status = 'leased' AND lease_expires_at <= clock_timestamp())
      )
      ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs j SET status = 'leased', attempts = j.attempts + 1, lease_token = $1,
      lease_expires_at = clock_timestamp() + $2::integer * interval '1 second'
    FROM next_job WHERE j.id = next_job.id
    RETURNING j.id, j.call_attempt_id, j.attempts
  `, [leaseToken, options.leaseSeconds ?? 90]);
  const job = rows[0];
  if (!job) return false;

  if (job.attempts > maxAttempts) {
    await exhaust(db, job, leaseToken);
    return true;
  }

  try {
    await runFixture(db, options, job, leaseToken);
  } catch {
    if (job.attempts >= maxAttempts) {
      await exhaust(db, job, leaseToken);
    } else {
      await db.query(`
        UPDATE jobs SET status = 'pending', lease_token = NULL, lease_expires_at = NULL,
          available_at = clock_timestamp() + $3::integer * interval '1 second'
        WHERE id = $1 AND lease_token = $2 AND lease_expires_at > clock_timestamp()
      `, [job.id, leaseToken, job.attempts]);
    }
    return true;
  }

  await db.query(`
    UPDATE jobs SET status = 'done', lease_token = NULL, lease_expires_at = NULL
    WHERE id = $1 AND lease_token = $2 AND lease_expires_at > clock_timestamp()
  `, [job.id, leaseToken]);
  return true;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPool(config.databaseUrl, config.schema);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log('Fixture interview worker started.');

  try {
    while (!stopping) {
      try {
        if (!(await runOne(db, config))) await pause(500);
      } catch {
        console.error('Fixture worker database operation failed. Retrying.');
        await pause(2000);
      }
    }
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(() => {
    console.error('Fixture worker could not start. Check local configuration.');
    process.exitCode = 1;
  });
}
