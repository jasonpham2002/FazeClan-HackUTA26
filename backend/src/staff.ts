import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { Auth } from './auth.ts'
import { transaction } from './db.ts'
import { fail } from './errors.ts'
import { applicationColumns, eventColumns, getActivity, getApplication, getEvent, idParams, recordActivity, type Database } from './views.ts'

const eventInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000),
  location: z.string().trim().min(1).max(200),
  startsAt: z.iso.datetime({ offset: true }),
  deadline: z.iso.datetime({ offset: true }),
  timezone: z.string().max(64).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true }
    catch { return false }
  }).optional(),
  capacity: z.number().int().min(0).max(100_000),
  status: z.enum(['draft', 'published']).optional(),
})

const draftInput = z.strictObject({
  intro: z.string().trim().min(1).max(1000),
  tone: z.string().trim().min(1).max(200),
  maxDurationSeconds: z.number().int().min(60).max(300),
  questions: z.array(z.strictObject({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    prompt: z.string().trim().min(1).max(1000),
    purpose: z.string().trim().max(500),
    order: z.number().int().min(1).max(6),
    required: z.boolean(),
    maxFollowUps: z.number().int().min(0).max(2),
  })).min(1).max(6),
}).refine(({ questions }) =>
  new Set(questions.map(question => question.id)).size === questions.length &&
  new Set(questions.map(question => question.order)).size === questions.length,
)

const reviewFilters = z.object({
  eventId: z.uuid().optional(),
  status: z.enum(['submitted', 'interview_pending', 'review_pending', 'invited', 'waitlisted', 'accepted']).optional(),
  callStatus: z.enum(['queued', 'dialing', 'connected', 'completed', 'missed', 'failed', 'canceled']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

const decisionInput = z.strictObject({
  decision: z.enum(['invited', 'waitlisted']),
  reason: z.string().trim().max(1000).optional(),
})

function validateDeadline(deadline: string | Date, startsAt: string | Date) {
  if (new Date(deadline).getTime() > new Date(startsAt).getTime()) {
    fail(400, 'INVALID_EVENT_DATES', 'The application deadline must be on or before the event starts.')
  }
}

async function getInterviewDraft(db: Database, id: string) {
  const { rows: [interview] } = await db.query(`
    SELECT e.draft,e.updated_at AS "draftUpdatedAt", latest.meta AS "publishedVersion",
      e.draft IS NOT NULL AND e.draft IS DISTINCT FROM latest.config AS "hasUnpublishedChanges"
    FROM events e LEFT JOIN LATERAL (
      SELECT json_build_object('id',v.id,'version',v.version,'publishedAt',v.published_at) AS meta,
        jsonb_build_object('intro',v.intro,'tone',v.tone,'maxDurationSeconds',v.max_duration_seconds,'questions',
          (SELECT jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'purpose',q.purpose,'order',q.position,
             'required',q.required,'maxFollowUps',q.max_follow_ups) ORDER BY q.position)
           FROM questions q WHERE q.version_id=v.id)) AS config
      FROM interview_versions v WHERE v.event_id=e.id ORDER BY v.version DESC LIMIT 1
    ) latest ON true WHERE e.id=$1
  `, [id])
  if (!interview) fail(404, 'EVENT_NOT_FOUND', 'Event not found.')
  return interview
}

export function registerStaffRoutes(app: FastifyInstance, db: Pool, auth: Auth) {
  app.get('/admin/events', async request => {
    await auth.requireUser(request, 'staff')
    const { rows } = await db.query(`SELECT ${eventColumns}, NULL AS "applicationId" FROM events e ORDER BY e.starts_at,e.id`)
    return { events: rows }
  })

  app.get('/admin/events/:id', async request => {
    await auth.requireUser(request, 'staff')
    return getEvent(db, idParams.parse(request.params).id, undefined, true)
  })

  app.post('/admin/events', async (request, reply) => {
    await auth.requireUser(request, 'staff')
    const body = eventInput.parse(request.body)
    validateDeadline(body.deadline, body.startsAt)
    const { rows: [event] } = await db.query(`
      INSERT INTO events (title,description,location,starts_at,deadline,capacity,status,timezone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `, [body.title, body.description, body.location, body.startsAt, body.deadline, body.capacity, body.status ?? 'draft', body.timezone ?? 'America/Chicago'])
    return reply.code(201).send(await getEvent(db, event.id, undefined, true))
  })

  app.patch('/admin/events/:id', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const patch = eventInput.partial().refine(value => Object.keys(value).length !== 0).parse(request.body)
    return transaction(db, async client => {
      const { rows: [event] } = await client.query('SELECT starts_at,deadline FROM events WHERE id=$1 FOR UPDATE', [id])
      if (!event) fail(404, 'EVENT_NOT_FOUND', 'Event not found.')
      validateDeadline(patch.deadline ?? event.deadline, patch.startsAt ?? event.starts_at)
      if (patch.capacity !== undefined) {
        const { rows: [seats] } = await client.query(
          "SELECT count(*)::int AS accepted FROM applications WHERE event_id=$1 AND status='accepted'", [id],
        )
        if (patch.capacity < seats.accepted) fail(409, 'CAPACITY_BELOW_ACCEPTED', 'Capacity cannot be lower than accepted invitations.')
      }
      await client.query(`
        UPDATE events SET title=COALESCE($2,title), description=COALESCE($3,description),
          location=COALESCE($4,location), starts_at=COALESCE($5,starts_at), deadline=COALESCE($6,deadline),
          capacity=COALESCE($7,capacity), status=COALESCE($8,status), timezone=COALESCE($9,timezone), updated_at=now() WHERE id=$1
      `, [id, patch.title, patch.description, patch.location, patch.startsAt, patch.deadline, patch.capacity, patch.status, patch.timezone])
      return getEvent(client, id, undefined, true)
    })
  })

  app.get('/admin/events/:id/interview', async request => {
    await auth.requireUser(request, 'staff')
    return getInterviewDraft(db, idParams.parse(request.params).id)
  })

  app.put('/admin/events/:id/interview-draft', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const draft = draftInput.parse(request.body)
    draft.questions.sort((a, b) => a.order - b.order)
    return transaction(db, async client => {
      await client.query('UPDATE events SET draft=$2,updated_at=now() WHERE id=$1', [id, JSON.stringify(draft)])
      return getInterviewDraft(client, id)
    })
  })

  app.post('/admin/events/:id/interview-publish', async (request, reply) => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const version = await transaction(db, async client => {
      const { rows: [event] } = await client.query('SELECT draft FROM events WHERE id=$1 FOR UPDATE', [id])
      if (!event) fail(404, 'EVENT_NOT_FOUND', 'Event not found.')
      if (!event.draft) fail(409, 'INTERVIEW_DRAFT_REQUIRED', 'Save an interview draft before publishing.')
      const draft = draftInput.parse(event.draft)
      const versionId = randomUUID()
      // The version insert seals its questions. The question FK is checked at commit.
      await client.query(`
        INSERT INTO questions (id,version_id,prompt,purpose,position,required,max_follow_ups)
        SELECT q.id,$1,q.prompt,q.purpose,q."order",q.required,q."maxFollowUps"
        FROM jsonb_to_recordset($2) AS q(id text,prompt text,purpose text,"order" int,required boolean,"maxFollowUps" int)
      `, [versionId, JSON.stringify(draft.questions)])
      const { rows: [published] } = await client.query(`
        INSERT INTO interview_versions (id,event_id,version,intro,tone,max_duration_seconds)
        SELECT $1,$2,COALESCE(max(version),0)+1,$3,$4,$5 FROM interview_versions WHERE event_id=$2
        RETURNING id,version,published_at AS "publishedAt"
      `, [versionId, id, draft.intro, draft.tone, draft.maxDurationSeconds])
      return published
    })
    return reply.code(201).send(version)
  })

  app.get('/admin/applications', async request => {
    await auth.requireUser(request, 'staff')
    const { eventId, status, callStatus, search, page, pageSize } = reviewFilters.parse(request.query)
    const conditions = `
      FROM applications a JOIN "user" u ON u.id=a.user_id JOIN events e ON e.id=a.event_id
      WHERE ($1::uuid IS NULL OR a.event_id=$1)
        AND ($2::text IS NULL OR a.status=$2)
        AND ($3::text IS NULL OR $3=(SELECT c.status FROM call_attempts c
             WHERE c.application_id=a.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1))
        AND ($4::text IS NULL OR strpos(lower(u.name),lower($4))>0 OR strpos(lower(u.email),lower($4))>0)
    `
    const filters = [eventId ?? null, status ?? null, callStatus ?? null, search || null]
    return transaction(db, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const { rows: [count] } = await client.query(`SELECT count(*)::int AS total ${conditions}`, filters)
      const { rows } = await client.query(`
        SELECT ${applicationColumns}, u.name AS "displayName", u.email, e.title AS "eventTitle"
        ${conditions} ORDER BY a.submitted_at DESC,a.id DESC LIMIT $5 OFFSET $6
      `, [...filters, pageSize, (page - 1) * pageSize])
      return { applications: rows, total: count.total, page, pageSize }
    })
  })

  app.get('/admin/applications/:id', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    return transaction(db, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const application = await getApplication(client, id)
      const event = await getEvent(client, application.eventId, undefined, true)
      const { rows: [fan] } = await client.query(`
        SELECT id,name AS "displayName",email,phone,"phoneVerifiedAt" FROM "user" WHERE id=$1
      `, [application.userId])
      const activity = await getActivity(client, application.userId)
      const { rows: [version] } = await client.query(`
        SELECT id,version,intro,tone,max_duration_seconds AS "maxDurationSeconds",published_at AS "publishedAt"
        FROM interview_versions WHERE id=$1
      `, [application.interviewVersionId])
      const { rows: questions } = await client.query(`
        SELECT id,prompt,purpose,position AS "order",required,max_follow_ups AS "maxFollowUps"
        FROM questions WHERE version_id=$1 ORDER BY position
      `, [application.interviewVersionId])
      const { rows: attempts } = await client.query(`
        SELECT c.id,c.mode,c.status,c.created_at AS "createdAt",c.attempted_at AS "attemptedAt",
           c.connected_at AS "connectedAt",c.ended_at AS "endedAt",c.failure_code AS "failureCode",
           COALESCE(r.processing_status,'pending') AS "processingStatus"
        FROM call_attempts c LEFT JOIN interview_results r ON r.call_attempt_id=c.id
        WHERE c.application_id=$1 ORDER BY c.created_at DESC,c.id DESC
      `, [id])
      const { rows: [selected] } = await client.query(`
        SELECT c.id FROM call_attempts c LEFT JOIN interview_results r ON r.call_attempt_id=c.id
        WHERE c.application_id=$1 AND (c.status='completed' OR EXISTS (
          SELECT 1 FROM transcript_segments s WHERE s.call_attempt_id=c.id))
        ORDER BY (c.status='completed') DESC, (r.processing_status='ready') DESC NULLS LAST,
          c.created_at DESC,c.id DESC LIMIT 1
      `, [id])
      const selectedAttemptId = selected?.id ?? null
      const { rows: transcript } = await client.query(`
        SELECT id,sequence,speaker,text,occurred_at AS timestamp FROM transcript_segments WHERE call_attempt_id=$1 ORDER BY sequence
      `, [selectedAttemptId])
      const { rows: answers } = await client.query(`
        SELECT a.question_id AS "questionId",a.summary,a.transcript_segment_ids AS "transcriptSegmentIds",a.completeness
        FROM answers a JOIN questions q ON q.id=a.question_id AND q.version_id=$2
        WHERE a.call_attempt_id=$1 ORDER BY q.position
      `, [selectedAttemptId, application.interviewVersionId])
      const { rows: [result] } = await client.query(`
        SELECT schema_version AS "schemaVersion",processing_status AS "processingStatus",summary,interests,
          unanswered_question_ids AS "unansweredQuestionIds",review_notes AS "reviewNotes",failure_code AS "failureCode"
        FROM interview_results WHERE call_attempt_id=$1
      `, [selectedAttemptId])
      const { rows: decisions } = await client.query(`
        SELECT d.id,d.decision,d.reason,d.created_at AS "createdAt",d.reviewer_id AS "reviewerId",u.name AS "reviewerName"
        FROM decisions d LEFT JOIN "user" u ON u.id=d.reviewer_id WHERE d.application_id=$1
        ORDER BY d.created_at DESC,d.id DESC
      `, [id])
      const { rows: pastApplications } = await client.query(`
        SELECT a.id,e.title AS "eventTitle",a.status,a.submitted_at AS "submittedAt"
        FROM applications a JOIN events e ON a.event_id=e.id
        WHERE a.user_id=$1 AND a.id<>$2 ORDER BY a.submitted_at DESC LIMIT 100
      `, [application.userId, id])
      const { rows: [capacity] } = await client.query(`
        SELECT count(*) FILTER (WHERE status='invited')::int AS invited,
          count(*) FILTER (WHERE status='accepted')::int AS accepted
        FROM applications WHERE event_id=$1
      `, [event.id])
      return { application, fan, event, pastApplications, capacity: { ...capacity, capacity: event.capacity }, interview: { ...version, questions }, attempts, selectedAttemptId, transcript, answers, result: result ?? null, activity, decisions }
    })
  })

  app.post('/admin/applications/:id/decision', async request => {
    const reviewer = await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const { decision, reason } = decisionInput.parse(request.body)
    return transaction(db, async client => {
      const { rows: [application] } = await client.query(`
        SELECT a.status,a.user_id,a.event_id,e.is_demo, EXISTS (
          SELECT 1 FROM call_attempts c JOIN transcript_segments s ON s.call_attempt_id=c.id
          WHERE c.application_id=a.id AND c.connected_at IS NOT NULL AND c.status IN ('failed','canceled')
        ) AND NOT EXISTS (
          SELECT 1 FROM call_attempts c WHERE c.application_id=a.id AND c.status IN ('queued','dialing','connected')
        ) AS has_partial_evidence
        FROM applications a JOIN events e ON e.id=a.event_id WHERE a.id=$1 FOR UPDATE OF a
      `, [id])
      if (!application) fail(404, 'APPLICATION_NOT_FOUND', 'Application not found.')
      const canReviewPartial = application.status === 'interview_pending' && application.has_partial_evidence
      if (!canReviewPartial && !['review_pending', 'invited', 'waitlisted'].includes(application.status)) {
        fail(409, 'DECISION_UNAVAILABLE', 'This application cannot receive a decision right now.')
      }
      const { rows: [previous] } = await client.query(`
        SELECT id,decision,reviewer_id AS "reviewerId",reason,created_at AS "createdAt"
        FROM decisions WHERE application_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1
      `, [id])
      const note = reason || null
      if (previous?.decision === decision && previous.reason === note) return previous
      const { rows: [saved] } = await client.query(`
        INSERT INTO decisions (application_id,decision,reviewer_id,reason) VALUES ($1,$2,$3,$4)
        RETURNING id,decision,reviewer_id AS "reviewerId",reason,created_at AS "createdAt"
      `, [id, decision, reviewer.id, note])
      await client.query('UPDATE applications SET status=$2 WHERE id=$1', [id, decision])
      if (application.status !== decision) await recordActivity(client, application.user_id, application.event_id, decision, application.is_demo)
      return saved
    })
  })

  app.get('/admin/events/:id/analytics', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const { rows: [counts] } = await db.query(`
      SELECT
        (SELECT count(*)::int FROM applications a WHERE a.event_id=e.id) AS applications,
        call_counts.*,
        (SELECT count(*)::int FROM applications a WHERE a.event_id=e.id AND a.status='review_pending') AS "reviewsPending",
        (SELECT count(DISTINCT d.application_id)::int FROM applications a JOIN decisions d ON d.application_id=a.id
          WHERE a.event_id=e.id AND d.decision='invited') AS "invitationsIssued",
        (SELECT count(*)::int FROM applications a WHERE a.event_id=e.id AND a.status='accepted') AS accepted
      FROM events e CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE c.attempted_at IS NOT NULL)::int AS "callsAttempted",
               count(*) FILTER (WHERE c.connected_at IS NOT NULL)::int AS "callsConnected",
               count(*) FILTER (WHERE c.status='completed' AND c.connected_at IS NOT NULL)::int AS "interviewsCompleted"
        FROM applications a JOIN call_attempts c ON c.application_id=a.id WHERE a.event_id=e.id
      ) call_counts WHERE e.id=$1
    `, [id])
    if (!counts) fail(404, 'EVENT_NOT_FOUND', 'Event not found.')
    return {
      ...counts,
      connectionRate: counts.callsAttempted ? counts.callsConnected / counts.callsAttempted : null,
      interviewCompletionRate: counts.callsConnected ? counts.interviewsCompleted / counts.callsConnected : null,
    }
  })
}
