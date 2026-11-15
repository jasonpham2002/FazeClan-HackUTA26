import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import type { Auth } from './auth.ts'
import { transaction } from './db.ts'
import { fail } from './errors.ts'
import type { Database } from './views.ts'

export const pointAmount = z.int().min(1).max(2_147_483_647)
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

const adjustment = z.strictObject({
  delta: z.int().min(-2_147_483_647).max(2_147_483_647).refine(value => value !== 0),
  reason: z.string().trim().min(1).max(1000),
  idempotencyKey: z.uuid().optional(),
})
const userParams = z.object({ id: z.string().min(1).max(128) })

export async function lockFan(client: PoolClient, userId: string) {
  // This lock serializes debits while allowing credits to take the foreign key's key-share lock.
  const { rowCount } = await client.query(`SELECT id FROM "user" WHERE id=$1 AND role='fan' FOR NO KEY UPDATE`, [userId])
  if (!rowCount) fail(404, 'FAN_NOT_FOUND', 'Fan account not found.')
}

export async function pointBalance(db: Database, userId: string): Promise<number> {
  const { rows: [row] } = await db.query<{ balance: string }>(
    'SELECT COALESCE(sum(delta), 0) AS balance FROM point_transactions WHERE user_id=$1', [userId],
  )
  return Number(row.balance)
}

const entryColumns = `id, delta, reason, source_type AS "sourceType", source_id AS "sourceId", created_at AS "createdAt"`

async function getLedger(db: Pool, userId: string, query: unknown, staff = false) {
  const { page, pageSize } = pageQuery.parse(query)
  const { rows: [row] } = await db.query(`
    SELECT COALESCE(sum(delta), 0) AS balance, count(*) AS total,
      COALESCE((SELECT json_agg(e ORDER BY e."createdAt" DESC, e.id DESC) FROM (
        SELECT ${entryColumns}${staff ? ', reviewer_id AS "reviewerId"' : ''}
        FROM point_transactions WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3
      ) e), '[]'::json) AS entries
    FROM point_transactions WHERE user_id=$1
  `, [userId, pageSize, (page - 1) * pageSize])
  return { balance: Number(row.balance), entries: row.entries, total: Number(row.total), page, pageSize }
}

export function registerPointRoutes(app: FastifyInstance, db: Pool, auth: Auth) {
  app.get('/me/points', async request => {
    const fan = await auth.requireUser(request, 'fan')
    return getLedger(db, fan.id, request.query)
  })

  app.get('/admin/users/:id/points', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = userParams.parse(request.params)
    const { rowCount } = await db.query(`SELECT 1 FROM "user" WHERE id=$1 AND role='fan'`, [id])
    if (!rowCount) fail(404, 'FAN_NOT_FOUND', 'Fan account not found.')
    return getLedger(db, id, request.query, true)
  })

  app.post('/admin/users/:id/point-adjustments', async (request, reply) => {
    const staff = await auth.requireUser(request, 'staff')
    const { id } = userParams.parse(request.params)
    const { delta, reason, idempotencyKey: bodyKey } = adjustment.parse(request.body)
    const headerKey = request.headers['idempotency-key']
    const idempotencyKey = bodyKey ?? (typeof headerKey === 'string' && headerKey.trim() !== '' ? z.uuid().parse(headerKey.trim()) : randomUUID())
    const result = await transaction(db, async client => {
      await lockFan(client, id)
      const { rows: [prior] } = await client.query(`
        SELECT ${entryColumns}, reviewer_id AS "reviewerId" FROM point_transactions
        WHERE user_id=$1 AND source_type='adjustment' AND source_id=$2
      `, [id, idempotencyKey])
      if (prior) {
        if (prior.delta !== delta || prior.reason !== reason || prior.reviewerId !== staff.id) {
          fail(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for another adjustment.')
        }
        return { entry: prior, created: false }
      }
      if (delta < 0 && await pointBalance(client, id) < -delta) {
        fail(409, 'INSUFFICIENT_POINTS', 'This adjustment would leave the fan with a negative balance.')
      }
      const { rows: [entry] } = await client.query(`
        INSERT INTO point_transactions (user_id,delta,reason,source_type,source_id,reviewer_id)
        VALUES ($1,$2,$3,'adjustment',$4,$5) RETURNING ${entryColumns}, reviewer_id AS "reviewerId"
      `, [id, delta, reason, idempotencyKey, staff.id])
      return { entry, created: true }
    })
    return reply.code(result.created ? 201 : 200).send(result.entry)
  })
}
