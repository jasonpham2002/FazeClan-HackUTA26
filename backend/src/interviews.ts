import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { transaction } from './db.ts';
import { fail } from './errors.ts';

const reference = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
const failureCode = reference.max(64);
const common = { eventId: reference, callAttemptId: z.uuid() };
const answer = z.strictObject({
  questionId: reference,
  summary: z.string().max(4000),
  transcriptSegmentIds: z.array(reference).max(100),
  completeness: z.enum(['answered', 'partial', 'skipped', 'not_asked']),
});

const eventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...common,
    type: z.literal('call_status'),
    status: z.enum(['dialing', 'connected', 'completed', 'missed', 'failed', 'canceled']),
    timestamp: z.iso.datetime().optional(),
    failureCode: failureCode.optional(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('transcript'),
    sequence: z.number().int().min(0).max(2147483647),
    speaker: z.enum(['agent', 'applicant']),
    text: z.string().trim().min(1).max(8000),
    timestamp: z.iso.datetime(),
  }),
  z.strictObject({
    ...common,
    type: z.literal('result'),
    schemaVersion: z.literal(1),
    interviewVersionId: z.uuid(),
    summary: z.string().trim().min(1).max(4000),
    interests: z.array(z.string().max(500)).max(30),
    answers: z.array(answer).max(6),
    unansweredQuestionIds: z.array(reference).max(6),
    reviewNotes: z.array(z.string().max(1000)).max(30),
  }),
  z.strictObject({ ...common, type: z.literal('processing_error'), failureCode }),
]);

export type InterviewEvent = z.infer<typeof eventSchema>;
type StatusEvent = Extract<InterviewEvent, { type: 'call_status' }>;
type ResultEvent = Extract<InterviewEvent, { type: 'result' }>;
type CallStatus = 'queued' | StatusEvent['status'];

type Attempt = {
  application_id: string;
  interview_version_id: string;
  mode: string;
  status: CallStatus;
  attempted_at: Date | null;
  connected_at: Date | null;
};

const transitions: Record<CallStatus, readonly CallStatus[]> = {
  queued: ['dialing', 'failed', 'canceled'],
  dialing: ['connected', 'missed', 'failed', 'canceled'],
  connected: ['completed', 'failed', 'canceled'],
  completed: [],
  missed: [],
  failed: [],
  canceled: [],
};

async function lockAttempt(db: PoolClient, attemptId: string): Promise<Attempt> {
  const { rows: applications } = await db.query<{ id: string; interview_version_id: string }>(`
    SELECT a.id, a.interview_version_id
    FROM applications a JOIN call_attempts c ON c.application_id = a.id
    WHERE c.id = $1 FOR UPDATE OF a
  `, [attemptId]);
  const application = applications[0];
  if (!application) fail(404, 'ATTEMPT_NOT_FOUND', 'Call attempt not found.');
  const { rows } = await db.query<Omit<Attempt, 'interview_version_id'>>(`
    SELECT application_id, mode, status, attempted_at, connected_at
    FROM call_attempts WHERE id = $1 FOR UPDATE
  `, [attemptId]);
  const attempt = rows[0];
  if (!attempt) fail(404, 'ATTEMPT_NOT_FOUND', 'Call attempt not found.');
  return { ...attempt, interview_version_id: application.interview_version_id };
}

async function advanceCall(db: PoolClient, attempt: Attempt, event: StatusEvent): Promise<void> {
  if (attempt.status === event.status) return;
  if (!transitions[attempt.status].includes(event.status)) {
    fail(409, 'INVALID_CALL_TRANSITION', 'This call cannot transition to the requested status.');
  }

  const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
  const previous = attempt.connected_at ?? attempt.attempted_at;
  if (previous && timestamp < previous) {
    fail(409, 'INVALID_CALL_TIMESTAMP', 'Call status timestamps must be chronological.');
  }

  await db.query(`
    UPDATE call_attempts SET status = $2,
      attempted_at = CASE WHEN $2 = 'dialing' THEN $3::timestamptz ELSE attempted_at END,
      connected_at = CASE WHEN $2 = 'connected' THEN $3::timestamptz ELSE connected_at END,
      ended_at = CASE WHEN $2 IN ('completed', 'missed', 'failed', 'canceled') THEN $3::timestamptz ELSE ended_at END,
      failure_code = CASE WHEN $2 IN ('missed', 'failed', 'canceled') THEN $4 END
    WHERE id = $1
  `, [event.callAttemptId, event.status, timestamp, event.failureCode ?? null]);

  if (event.status === 'completed') {
    await db.query(`
      UPDATE applications SET status = 'review_pending'
      WHERE id = $1 AND status IN ('submitted', 'interview_pending')
    `, [attempt.application_id]);
  }
}

async function saveResult(db: PoolClient, attempt: Attempt, event: ResultEvent): Promise<void> {
  if (attempt.interview_version_id !== event.interviewVersionId) {
    fail(409, 'INTERVIEW_VERSION_MISMATCH', 'Use the interview version pinned to the application.');
  }

  const { rows: questions } = await db.query<{ id: string }>(`
    SELECT id FROM questions WHERE version_id = $1
  `, [attempt.interview_version_id]);
  const questionIds = new Set(questions.map((question) => question.id));
  const answeredIds = event.answers.map(({ questionId }) => questionId);
  const unanswered = new Set(event.unansweredQuestionIds);
  if (new Set(answeredIds).size !== answeredIds.length || unanswered.size !== event.unansweredQuestionIds.length ||
      [...answeredIds, ...unanswered].some((id) => !questionIds.has(id))) {
    fail(400, 'INVALID_RESULT_QUESTIONS', 'Result question IDs must be unique and belong to the pinned version.');
  }

  for (const entry of event.answers) {
    if ((entry.completeness === 'answered' || entry.completeness === 'partial') &&
        (!entry.summary.trim() || entry.transcriptSegmentIds.length === 0)) {
      fail(400, 'ANSWER_EVIDENCE_REQUIRED', 'Answered and partial questions require a summary and transcript evidence.');
    }
    if (entry.completeness === 'answered' && unanswered.has(entry.questionId)) {
      fail(400, 'INVALID_RESULT_QUESTIONS', 'An answered question cannot also be listed as unanswered.');
    }
  }

  const segmentIds = [...new Set(event.answers.flatMap((entry) => entry.transcriptSegmentIds))];
  if (segmentIds.length > 0) {
    const segments = await db.query(`
      SELECT id FROM transcript_segments WHERE call_attempt_id = $1 AND id = ANY($2::text[])
    `, [event.callAttemptId, segmentIds]);
    if (segments.rowCount !== segmentIds.length) {
      fail(409, 'RESULT_EVIDENCE_UNAVAILABLE', 'All evidence must reference transcript segments from this call.');
    }
  }

  const saved = await db.query(`
    INSERT INTO interview_results (
      call_attempt_id, processing_status, schema_version, summary, interests, unanswered_question_ids, review_notes
    ) VALUES ($1, 'ready', $2, $3, $4, $5, $6)
    ON CONFLICT (call_attempt_id) DO UPDATE SET processing_status = 'ready',
      schema_version = EXCLUDED.schema_version, summary = EXCLUDED.summary, interests = EXCLUDED.interests,
      unanswered_question_ids = EXCLUDED.unanswered_question_ids, review_notes = EXCLUDED.review_notes,
      failure_code = NULL, updated_at = now()
    WHERE interview_results.processing_status <> 'ready'
  `, [event.callAttemptId, event.schemaVersion, event.summary, JSON.stringify(event.interests),
      JSON.stringify(event.unansweredQuestionIds), JSON.stringify(event.reviewNotes)]);
  if (saved.rowCount === 0) fail(409, 'RESULT_ALREADY_READY', 'A result has already been recorded for this call.');

  for (const entry of event.answers) {
    await db.query(`
      INSERT INTO answers (call_attempt_id, question_id, summary, transcript_segment_ids, completeness)
      VALUES ($1, $2, $3, $4, $5)
    `, [event.callAttemptId, entry.questionId, entry.summary, JSON.stringify(entry.transcriptSegmentIds),
        entry.completeness]);
  }
}

export function registerInterviewRoutes(app: FastifyInstance, db: Pool, agentToken: string): void {
  const expectedAuthorization = createHash('sha256').update(`Bearer ${agentToken}`).digest();

  app.post('/internal/interviews/events', { bodyLimit: 128 * 1024 }, async (request) => {
    const authorization = createHash('sha256').update(request.headers.authorization ?? '').digest();
    if (!timingSafeEqual(authorization, expectedAuthorization)) {
      fail(401, 'AGENT_UNAUTHORIZED', 'Valid agent credentials are required.');
    }

    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) fail(400, 'INVALID_INTERVIEW_EVENT', 'Invalid interview event.');
    const event = parsed.data;
    const bodyHash = createHash('sha256').update(JSON.stringify(event)).digest('hex');

    return transaction(db, async (client) => {
      const attempt = await lockAttempt(client, event.callAttemptId);
      const inserted = await client.query(`
        INSERT INTO processed_provider_events (event_id, call_attempt_id, body_hash)
        VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING
      `, [event.eventId, event.callAttemptId, bodyHash]);

      if (inserted.rowCount === 0) {
        const { rows } = await client.query<{ body_hash: string }>(`
          SELECT body_hash FROM processed_provider_events WHERE event_id = $1
        `, [event.eventId]);
        if (rows[0]?.body_hash !== bodyHash) {
          fail(409, 'INTERVIEW_EVENT_ID_CONFLICT', 'This event ID has already been used for a different payload.');
        }
        return { accepted: true, duplicate: true };
      }

      if (attempt.mode === 'fixture') {
        const lease = z.uuid().safeParse(request.headers['x-job-lease']);
        if (!lease.success) fail(409, 'JOB_LEASE_LOST', 'An active fixture job lease is required.');
        const fenced = await client.query(`
          SELECT 1 FROM jobs WHERE call_attempt_id = $1 AND status = 'leased'
            AND lease_token = $2 AND lease_expires_at > clock_timestamp() FOR UPDATE
        `, [event.callAttemptId, lease.data]);
        if (fenced.rowCount === 0) fail(409, 'JOB_LEASE_LOST', 'An active fixture job lease is required.');
      }

      if (event.type === 'call_status') {
        await advanceCall(client, attempt, event);
        return { accepted: true, duplicate: false };
      }

      if (event.type !== 'processing_error' && !attempt.connected_at) {
        fail(409, 'INTERVIEW_NOT_CONNECTED', 'Transcript and result events require a connected call.');
      }

      if (event.type === 'transcript') {
        const segment = await client.query(`
          INSERT INTO transcript_segments (id, call_attempt_id, sequence, speaker, text, occurred_at)
          VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (call_attempt_id, sequence) DO NOTHING
        `, [event.eventId, event.callAttemptId, event.sequence, event.speaker, event.text, event.timestamp]);
        if (segment.rowCount === 0) {
          fail(409, 'TRANSCRIPT_SEQUENCE_CONFLICT', 'This call already has a segment at the given sequence.');
        }
      } else if (event.type === 'result') {
        await saveResult(client, attempt, event);
      } else {
        await client.query(`
          INSERT INTO interview_results (call_attempt_id, processing_status, failure_code)
          VALUES ($1, 'failed', $2) ON CONFLICT (call_attempt_id) DO UPDATE SET
            processing_status = 'failed', failure_code = EXCLUDED.failure_code, updated_at = now()
          WHERE interview_results.processing_status <> 'ready'
        `, [event.callAttemptId, event.failureCode]);
      }

      return { accepted: true, duplicate: false };
    });
  });
}
