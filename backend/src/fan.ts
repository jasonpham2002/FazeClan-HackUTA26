import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { Auth } from './auth.ts'
import { transaction } from './db.ts'
import { fail } from './errors.ts'
import { applicationColumns, consentVersion, eventColumns, getActivity, getApplication, getEvent, idParams, recordActivity } from './views.ts'

const profileBody = z.strictObject({
  displayName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
}).refine(value => value.displayName !== undefined || value.phone !== undefined)

const applyBody = z.strictObject({
  consentVersion: z.literal(consentVersion),
  consentAccepted: z.literal(true),
})

const emptyBody = z.strictObject({}).optional()

export function registerFanRoutes(app: FastifyInstance, db: Pool, auth: Auth) {
  app.get('/me', async request => {
    const user = await auth.requireUser(request)
    return {
      id: user.id, email: user.email, displayName: user.name, role: user.role, emailVerified: user.emailVerified,
      phone: user.phone ?? null, phoneVerifiedAt: user.phoneVerifiedAt ?? null,
    }
  })

  app.patch('/me', async request => {
    const user = await auth.requireUser(request)
    const body = profileBody.parse(request.body)
    const { rows: [profile] } = await db.query(`
      UPDATE "user" SET name=COALESCE($2,name),
        "phoneVerifiedAt"=CASE WHEN $3 AND phone IS DISTINCT FROM $4 THEN null ELSE "phoneVerifiedAt" END,
        phone=CASE WHEN $3 THEN $4 ELSE phone END, "updatedAt"=now()
      WHERE id=$1
      RETURNING id,email,name AS "displayName",role,"emailVerified",phone,"phoneVerifiedAt"
    `, [user.id, body.displayName ?? null, body.phone !== undefined, body.phone ?? null])
    return profile
  })

  app.get('/me/activity', async request => {
    const user = await auth.requireUser(request)
    return { activity: await getActivity(db, user.id) }
  })

  app.get('/me/applications', async request => {
    const user = await auth.requireUser(request)
    const { rows } = await db.query(`
      SELECT ${applicationColumns}, e.title AS "eventTitle"
      FROM applications a JOIN events e ON e.id=a.event_id
      WHERE a.user_id=$1 ORDER BY a.submitted_at DESC, a.id DESC
    `, [user.id])
    return { applications: rows }
  })

  app.get('/events', async request => {
    const user = await auth.sessionUser(request)
    const { rows } = await db.query(`
      SELECT ${eventColumns},
         (SELECT a.id FROM applications a WHERE a.event_id=e.id AND a.user_id=$1) AS "applicationId"
      FROM events e WHERE e.status='published' ORDER BY e.starts_at, e.id
    `, [user?.id ?? null])
    return { events: rows }
  })

  app.get('/events/:id', async request => {
    const { id } = idParams.parse(request.params)
    const user = await auth.sessionUser(request)
    return getEvent(db, id, user?.id)
  })

  app.post('/events/:id/applications', async (request, reply) => {
    const user = await auth.requireUser(request, 'fan')
    const { id } = idParams.parse(request.params)
    const consent = applyBody.parse(request.body)
    const result = await transaction(db, async client => {
      const { rows: [event] } = await client.query(`
        SELECT status, deadline > now() AND starts_at > now() AS open, is_demo
        FROM events WHERE id=$1 FOR UPDATE
      `, [id])
      const { rows: [existing] } = await client.query('SELECT id FROM applications WHERE user_id=$1 AND event_id=$2', [user.id, id])
      if (existing) return { id: existing.id, created: false }
      if (!event || event.status !== 'published') fail(404, 'EVENT_NOT_FOUND', 'Event not found.')
      if (!event.open) fail(409, 'APPLICATIONS_CLOSED', 'Applications for this event are closed.')
      const { rows: [version] } = await client.query(
        'SELECT id FROM interview_versions WHERE event_id=$1 ORDER BY version DESC LIMIT 1', [id],
      )
      if (!version) fail(409, 'INTERVIEW_UNPUBLISHED', 'The event interview is still being prepared.')
      const { rows: [application] } = await client.query(`
        INSERT INTO applications (user_id,event_id,interview_version_id,status)
        VALUES ($1,$2,$3,'submitted') RETURNING id
      `, [user.id, id, version.id])
      await client.query(`
        INSERT INTO consents (application_id,user_id,consent_version) VALUES ($1,$2,$3)
      `, [application.id, user.id, consent.consentVersion])
      await recordActivity(client, user.id, id, 'application_submitted', event.is_demo)
      return { id: application.id, created: true }
    })
    return reply.code(result.created ? 201 : 200).send(await getApplication(db, result.id, user.id))
  })

  app.get('/applications/:id', async request => {
    const user = await auth.requireUser(request, 'fan')
    return getApplication(db, idParams.parse(request.params).id, user.id)
  })

  app.post('/applications/:id/call', async (request, reply) => {
    const user = await auth.requireUser(request, 'fan')
    const { id } = idParams.parse(request.params)
    emptyBody.parse(request.body)
    if (!user.emailVerified || !user.email.endsWith('@example.test')) {
      fail(403, 'CALL_UNAVAILABLE', 'Fixture interviews are available to verified demo accounts.')
    }
    const attempt = await transaction(db, async client => {
      const { rows: [application] } = await client.query(`
        SELECT a.status, e.status AS event_status, e.starts_at > now() AS upcoming,
          EXISTS (SELECT 1 FROM consents s WHERE s.application_id=a.id AND s.user_id=a.user_id AND s.consent_version=$3) AS consented
        FROM applications a JOIN events e ON e.id=a.event_id
        WHERE a.id=$1 AND a.user_id=$2 FOR UPDATE OF a
      `, [id, user.id, consentVersion])
      if (!application) fail(404, 'APPLICATION_NOT_FOUND', 'Application not found.')
      const { rows: [active] } = await client.query(`
        SELECT id,mode FROM call_attempts WHERE application_id=$1 AND status IN ('queued','dialing','connected')
      `, [id])
      if (active) return active
      if (!application.consented) fail(409, 'CONSENT_REQUIRED', 'Interview consent is required.')
      if (!['submitted', 'interview_pending'].includes(application.status) || application.event_status !== 'published' || !application.upcoming) {
        fail(409, 'CALL_UNAVAILABLE', 'This application is not eligible for another interview.')
      }
      const { rows: [recent] } = await client.query(`
        SELECT id FROM call_attempts WHERE application_id=$1 AND created_at > now() - interval '60 seconds' LIMIT 1
      `, [id])
      if (recent) fail(429, 'CALL_RATE_LIMIT', 'Wait 60 seconds between interview requests.')
      const { rows: [queued] } = await client.query(`
        INSERT INTO call_attempts (application_id,status,mode) VALUES ($1,'queued','fixture') RETURNING id,mode
      `, [id])
      await client.query(`
        INSERT INTO jobs (call_attempt_id,kind,status) VALUES ($1,'start_call','pending')
      `, [queued.id])
      await client.query('INSERT INTO interview_results (call_attempt_id,processing_status) VALUES ($1,\'pending\')', [queued.id])
      await client.query('UPDATE applications SET status=\'interview_pending\' WHERE id=$1', [id])
      return queued
    })
    return reply.code(202).send({ callAttemptId: attempt.id, mode: attempt.mode })
  })

  app.post('/applications/:id/accept', async request => {
    const user = await auth.requireUser(request, 'fan')
    const { id } = idParams.parse(request.params)
    emptyBody.parse(request.body)
    await transaction(db, async client => {
      const { rows: [owned] } = await client.query('SELECT event_id FROM applications WHERE id=$1 AND user_id=$2', [id, user.id])
      if (!owned) fail(404, 'APPLICATION_NOT_FOUND', 'Application not found.')
      const { rows: [event] } = await client.query(`
        SELECT capacity, status, starts_at > now() AS upcoming, is_demo FROM events WHERE id=$1 FOR UPDATE
      `, [owned.event_id])
      const { rows: [application] } = await client.query('SELECT status FROM applications WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, user.id])
      if (!event || !application) fail(404, 'APPLICATION_NOT_FOUND', 'Application not found.')
      if (application.status === 'accepted') return
      if (application.status !== 'invited' || event.status !== 'published' || !event.upcoming) {
        fail(409, 'INVITATION_UNAVAILABLE', 'This invitation is no longer available.')
      }
      const { rows: [seats] } = await client.query(
        "SELECT count(*)::int AS accepted FROM applications WHERE event_id=$1 AND status='accepted'", [owned.event_id],
      )
      if (seats.accepted >= event.capacity) fail(409, 'EVENT_FULL', 'This event is full.')
      await client.query("UPDATE applications SET status='accepted', accepted_at=now() WHERE id=$1", [id])
      await recordActivity(client, user.id, owned.event_id, 'invitation_accepted', event.is_demo)
    })
    return getApplication(db, id, user.id)
  })
}
