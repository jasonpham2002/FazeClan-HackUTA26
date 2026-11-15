import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { Auth } from './auth.ts'
import { transaction } from './db.ts'
import { fail } from './errors.ts'
import { lockFan, pointAmount, pointBalance } from './points.ts'
import { idParams } from './views.ts'

const rewardKindInput = z.enum(['merchandise', 'merch', 'raffle', 'early_access', 'priority'])
  .transform(value => (value === 'merch' ? 'merchandise' : value))

const rewardFields = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  terms: z.string().trim().max(2000).optional(),
  pointCost: pointAmount.nullable().optional(),
  cost: pointAmount.nullable().optional(),
  stock: z.int().min(0).max(2_147_483_647).nullable().optional(),
  active: z.boolean().optional(),
})
const createReward = rewardFields.extend({
  kind: rewardKindInput,
  isDemo: z.boolean().default(true),
})
const editReward = rewardFields.extend({
  kind: rewardKindInput.optional(),
}).refine(input => Object.keys(input).length > 0)
const redeemBody = z.strictObject({ idempotencyKey: z.uuid().optional() })

const rewardColumns = `id, title, description, kind, terms, point_cost AS "pointCost",
  COALESCE(point_cost, 0) AS cost, stock, active, is_demo AS "isDemo",
  (active AND kind='merchandise' AND stock>0) AS redeemable`
const claimColumns = `r.id, r.reward_id AS "rewardId", rw.title AS "rewardTitle", -p.delta AS "pointCost",
  -p.delta AS cost, r.status, r.created_at AS "createdAt"`
const fanJson = `jsonb_build_object(
  'id', u.id,
  'displayName', COALESCE(NULLIF(btrim(u.name), ''), split_part(u.email, '@', 1)),
  'email', u.email
) AS fan`

function resolvePointCost(pointCost: number | null | undefined, cost: number | null | undefined) {
  if (pointCost !== undefined && cost !== undefined && pointCost !== cost) {
    fail(400, 'INVALID_REWARD', 'Provide either pointCost or cost, not conflicting values.')
  }
  return pointCost !== undefined ? pointCost : cost
}

export function registerRewardRoutes(app: FastifyInstance, db: Pool, auth: Auth) {
  app.get('/rewards', async () => {
    const { rows } = await db.query(`SELECT ${rewardColumns} FROM rewards WHERE active ORDER BY title,id`)
    return { rewards: rows }
  })

  app.get('/me/redemptions', async request => {
    const fan = await auth.requireUser(request, 'fan')
    const { rows } = await db.query(`
      SELECT ${claimColumns}
      FROM reward_redemptions r
      JOIN point_transactions p ON p.id=r.point_transaction_id
      JOIN rewards rw ON rw.id=r.reward_id
      WHERE r.user_id=$1 ORDER BY r.created_at DESC,r.id DESC
    `, [fan.id])
    return { redemptions: rows }
  })

  app.post('/rewards/:id/redeem', async (request, reply) => {
    const fan = await auth.requireUser(request, 'fan')
    const { id } = idParams.parse(request.params)
    const parsedBody = request.body == null ? {} : redeemBody.parse(request.body)
    const rawHeader = request.headers['idempotency-key']
    const headerKey = typeof rawHeader === 'string' && rawHeader.trim() !== '' ? rawHeader.trim() : undefined
    if (parsedBody.idempotencyKey && headerKey && parsedBody.idempotencyKey !== headerKey) {
      fail(400, 'INVALID_INPUT', 'Conflicting idempotency keys.')
    }
    const idempotencyKey = z.uuid().parse(parsedBody.idempotencyKey ?? headerKey)
    const result = await transaction(db, async client => {
      await lockFan(client, fan.id)
      const { rows: [prior] } = await client.query(`
        SELECT ${claimColumns}
        FROM reward_redemptions r
        JOIN point_transactions p ON p.id=r.point_transaction_id
        JOIN rewards rw ON rw.id=r.reward_id
        WHERE r.user_id=$1 AND r.idempotency_key=$2
      `, [fan.id, idempotencyKey])
      if (prior) {
        if (prior.rewardId !== id.toLowerCase()) fail(409, 'IDEMPOTENCY_CONFLICT', 'This request key was used for a different reward.')
        return { claim: prior, created: false }
      }
      const { rows: [reward] } = await client.query('SELECT * FROM rewards WHERE id=$1 FOR UPDATE', [id])
      if (!reward) fail(404, 'REWARD_NOT_FOUND', 'Reward not found.')
      if (!reward.active || reward.kind !== 'merchandise') fail(409, 'REWARD_UNAVAILABLE', 'This reward is unavailable.')
      if (reward.stock === null || reward.stock <= 0) fail(409, 'REWARD_OUT_OF_STOCK', 'This reward is out of stock.')
      if (await pointBalance(client, fan.id) < reward.point_cost) {
        fail(409, 'INSUFFICIENT_POINTS', 'You need more points to claim this reward.')
      }

      const claimId = randomUUID()
      const { rows: [debit] } = await client.query(`
        INSERT INTO point_transactions (user_id,delta,reason,source_type,source_id)
        VALUES ($1,$2,$3,'redemption',$4) RETURNING id
      `, [fan.id, -reward.point_cost, `Reward claimed: ${reward.title}`, claimId])
      await client.query('UPDATE rewards SET stock=stock-1 WHERE id=$1', [id])
      const { rows: [claim] } = await client.query(`
        INSERT INTO reward_redemptions (id,user_id,reward_id,point_transaction_id,idempotency_key)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id, reward_id AS "rewardId", $7::text AS "rewardTitle", $6::int AS "pointCost",
          $6::int AS cost, status, created_at AS "createdAt"
      `, [claimId, fan.id, id, debit.id, idempotencyKey, reward.point_cost, reward.title])
      return { claim, created: true }
    })
    return reply.code(result.created ? 201 : 200).send(result.claim)
  })

  app.get('/admin/rewards', async request => {
    await auth.requireUser(request, 'staff')
    const { rows } = await db.query(`SELECT ${rewardColumns} FROM rewards ORDER BY title,id`)
    return { rewards: rows }
  })

  app.post('/admin/rewards', async (request, reply) => {
    await auth.requireUser(request, 'staff')
    const parsed = createReward.parse(request.body)
    const resolvedCost = resolvePointCost(parsed.pointCost, parsed.cost)
    if (parsed.kind === 'merchandise' && (resolvedCost === null || resolvedCost === undefined || parsed.stock === null || parsed.stock === undefined)) {
      fail(400, 'INVALID_REWARD', 'Set a point cost and stock for merchandise.')
    }
    const { rows: [reward] } = await db.query(`
      INSERT INTO rewards (title,description,kind,terms,point_cost,stock,active,is_demo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${rewardColumns}
    `, [
      parsed.title,
      parsed.description ?? '',
      parsed.kind,
      parsed.terms ?? '',
      resolvedCost ?? null,
      parsed.stock ?? null,
      parsed.active ?? true,
      parsed.isDemo,
    ])
    return reply.code(201).send(reward)
  })

  app.patch('/admin/rewards/:id', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const parsed = editReward.parse(request.body)
    const resolvedCost = resolvePointCost(parsed.pointCost, parsed.cost)
    const hasCost = resolvedCost !== undefined
    const hasStock = parsed.stock !== undefined
    try {
      const { rows: [reward] } = await db.query(`
        UPDATE rewards SET
          title=COALESCE($2,title),
          description=COALESCE($3,description),
          kind=COALESCE($4,kind),
          terms=COALESCE($5,terms),
          point_cost=CASE WHEN $6 THEN $7::int ELSE point_cost END,
          stock=CASE WHEN $8 THEN $9::int ELSE stock END,
          active=COALESCE($10,active)
        WHERE id=$1
        RETURNING ${rewardColumns}
      `, [
        id,
        parsed.title ?? null,
        parsed.description ?? null,
        parsed.kind ?? null,
        parsed.terms ?? null,
        hasCost,
        resolvedCost ?? null,
        hasStock,
        parsed.stock ?? null,
        parsed.active ?? null,
      ])
      if (!reward) fail(404, 'REWARD_NOT_FOUND', 'Reward not found.')
      return reward
    } catch (error) {
      if ((error as { code?: string }).code === '23514') {
        fail(400, 'INVALID_REWARD', 'Merchandise requires a positive point cost and non-negative stock.')
      }
      throw error
    }
  })

  app.get('/admin/redemptions', async request => {
    await auth.requireUser(request, 'staff')
    return { redemptions: await listAdminRedemptions(db) }
  })

  app.get('/admin/rewards/:id/redemptions', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const { rowCount } = await db.query('SELECT 1 FROM rewards WHERE id=$1', [id])
    if (!rowCount) fail(404, 'REWARD_NOT_FOUND', 'Reward not found.')
    return { redemptions: await listAdminRedemptions(db, id) }
  })
}

async function listAdminRedemptions(db: Pool, rewardId?: string) {
  const where = rewardId ? 'WHERE r.reward_id=$1 ' : ''
  const { rows } = await db.query(`
    SELECT ${claimColumns}, r.user_id AS "userId", ${fanJson}
    FROM reward_redemptions r
    JOIN point_transactions p ON p.id=r.point_transaction_id
    JOIN rewards rw ON rw.id=r.reward_id
    JOIN "user" u ON u.id=r.user_id
    ${where}ORDER BY r.created_at DESC,r.id DESC
  `, rewardId ? [rewardId] : [])
  return rows
}
