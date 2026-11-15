import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { fail } from './errors.ts'

export type Database = Pool | PoolClient
export const idParams = z.object({ id: z.uuid() })
export const consentVersion = 'ai-interview-v1'

export const eventColumns = `
  e.id, e.title, e.description, e.location, e.starts_at AS "startsAt",
  e.deadline, e.timezone, e.capacity, e.status, e.is_demo AS "isDemo",
  e.capacity - (SELECT count(*)::int FROM applications a WHERE a.event_id=e.id AND a.status='accepted') AS "remainingCapacity"
`

export const applicationColumns = `
  a.id, a.user_id AS "userId", a.event_id AS "eventId", a.interview_version_id AS "interviewVersionId",
  a.status, a.submitted_at AS "submittedAt", a.accepted_at AS "acceptedAt",
  (SELECT row_to_json(venue) FROM (SELECT ${eventColumns} FROM events e WHERE e.id=a.event_id) venue) AS event,
  (SELECT json_build_object('id', u.id, 'displayName', u.name, 'email', u.email, 'role', u.role, 'phone', u.phone)
   FROM "user" u WHERE u.id=a.user_id) AS profile,
  (SELECT json_build_object('id', v.id, 'version', v.version, 'publishedAt', v.published_at)
   FROM interview_versions v WHERE v.id=a.interview_version_id) AS "pinnedVersion",
  (SELECT json_build_object(
     'id', c.id, 'mode', c.mode, 'status', c.status, 'processingStatus', COALESCE(r.processing_status, 'pending'),
     'createdAt', c.created_at, 'attemptedAt', c.attempted_at, 'connectedAt', c.connected_at, 'endedAt', c.ended_at, 'failureCode', c.failure_code
   ) FROM call_attempts c LEFT JOIN interview_results r ON r.call_attempt_id=c.id
   WHERE c.application_id=a.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS "latestAttempt",
  (SELECT json_build_object('decision', d.decision, 'createdAt', d.created_at)
   FROM decisions d WHERE d.application_id=a.id ORDER BY d.created_at DESC, d.id DESC LIMIT 1) AS decision
`

export async function getApplication(db: Database, id: string, ownerId?: string) {
  const { rows: [application] } = await db.query(`
    SELECT ${applicationColumns}
    FROM applications a WHERE a.id=$1 AND ($2::text IS NULL OR a.user_id=$2)
  `, [id, ownerId ?? null])
  if (!application) fail(404, 'APPLICATION_NOT_FOUND', 'Application not found.')
  return application
}

export async function getActivity(db: Database, userId: string) {
  const { rows } = await db.query(`
    SELECT a.id, a.event_id AS "eventId", e.title AS "eventTitle", a.type, a.occurred_at AS timestamp,
      a.source, a.metadata, a.is_demo AS "isDemo"
    FROM activity_events a LEFT JOIN events e ON e.id=a.event_id WHERE a.user_id=$1
    ORDER BY a.occurred_at DESC, a.id DESC LIMIT 100
  `, [userId])
  return rows
}

export async function recordActivity(db: PoolClient, userId: string, eventId: string, type: string, isDemo: boolean) {
  await db.query(`
    INSERT INTO activity_events (user_id,event_id,type,source,is_demo)
    VALUES ($1,$2,$3,'platform',$4)
  `, [userId, eventId, type, isDemo])
}

export async function getEvent(db: Database, id: string, userId?: string, staff = false) {
  const { rows: [event] } = await db.query(`
    SELECT ${eventColumns},
      (SELECT a.id FROM applications a WHERE a.event_id=e.id AND a.user_id=$2) AS "applicationId"
    FROM events e WHERE e.id=$1 AND ($3 OR e.status='published')
  `, [id, userId ?? null, staff])
  if (!event) fail(404, 'EVENT_NOT_FOUND', 'Event not found.')
  return event
}
