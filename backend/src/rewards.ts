import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { Auth } from './auth.ts'
import { transaction } from './db.ts'
import { fail } from './errors.ts'
import { lockFan, pointAmount, pointBalance } from './points.ts'
import { idParams } from './views.ts'

const imageDir = path.resolve(fileURLToPath(new URL('../data/reward-images', import.meta.url)))
const imageName = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,80}$/i)
const storedImage = z.union([z.string().trim().max(300), z.null()]).optional()

function giftImage(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  if (/^https:\/\/\S+$/.test(trimmed) || /^\/rewards\/images\/[a-z0-9][a-z0-9._-]{0,80}$/i.test(trimmed)) return trimmed
  fail(400, 'INVALID_IMAGE', 'Use an https image link or an uploaded image.')
}

const rewardKindInput = z.enum(['merchandise', 'merch', 'raffle', 'early_access', 'priority'])
  .transform(value => (value === 'merchandise' ? 'merch' : value))

const rewardFields = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  terms: z.string().trim().max(2000).optional(),
  pointCost: pointAmount.nullable().optional(),
  cost: pointAmount.nullable().optional(),
  stock: z.int().min(0).max(2_147_483_647).nullable().optional(),
  active: z.boolean().optional(),
  headline: z.string().trim().max(140).optional(),
  imageUrl: storedImage,
})
const createReward = rewardFields.extend({
  kind: rewardKindInput,
  isDemo: z.boolean().default(true),
})
const editReward = rewardFields.partial().extend({
  kind: rewardKindInput.optional(),
}).refine(input => Object.keys(input).length > 0)
const redeemBody = z.strictObject({ idempotencyKey: z.uuid().optional() })

const rewardColumns = `id, title, COALESCE(headline, '') AS headline, image_url AS "imageUrl", description, kind, terms, point_cost AS "pointCost",
  COALESCE(point_cost, 0) AS cost, stock, active, is_demo AS "isDemo",
  (active AND kind='merch' AND point_cost IS NOT NULL AND (stock IS NULL OR stock>0)) AS redeemable`
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

function imageType(bytes: Buffer): { ext: string; type: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' }
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a')) return { ext: 'gif', type: 'image/gif' }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  return null
}

const uploadBody = z.strictObject({
  contentType: z.string().trim().max(40),
  dataBase64: z.string().min(1).max(2_100_000),
})

export function registerRewardRoutes(app: FastifyInstance, db: Pool, auth: Auth) {
  app.post('/admin/rewards/images', async request => {
    await auth.requireUser(request, 'staff')
    const body = uploadBody.parse(request.body)
    const bytes = Buffer.from(body.dataBase64, 'base64')
    if (bytes.length < 16 || bytes.length > 1_500_000) fail(400, 'INVALID_IMAGE', 'Use a JPEG, PNG, GIF, or WebP image under 1.5 MB.')
    const kind = imageType(bytes)
    if (!kind) fail(400, 'INVALID_IMAGE', 'Use a JPEG, PNG, GIF, or WebP image.')
    const name = `${randomUUID()}.${kind.ext}`
    await mkdir(imageDir, { recursive: true })
    await writeFile(path.join(imageDir, name), bytes)
    return { imageUrl: `/rewards/images/${name}` }
  })

  app.get('/rewards/images/:name', async (request, reply) => {
    const { name } = z.object({ name: imageName }).parse(request.params)
    const file = path.resolve(imageDir, name)
    if (file !== path.join(imageDir, name)) fail(404, 'IMAGE_NOT_FOUND', 'Image not found.')
    let bytes: Buffer
    try {
      bytes = await readFile(file)
    } catch {
      fail(404, 'IMAGE_NOT_FOUND', 'Image not found.')
    }
    const kind = imageType(bytes)
    if (!kind) fail(404, 'IMAGE_NOT_FOUND', 'Image not found.')
    return reply.type(kind.type).header('cache-control', 'public, max-age=86400').send(bytes)
  })

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
      if (!reward.active || reward.kind !== 'merch' || reward.point_cost === null) {
        fail(409, 'REWARD_UNAVAILABLE', 'This reward is unavailable.')
      }
      if (reward.stock !== null && reward.stock <= 0) fail(409, 'REWARD_OUT_OF_STOCK', 'This reward is out of stock.')
      if (await pointBalance(client, fan.id) < reward.point_cost) {
        fail(409, 'INSUFFICIENT_POINTS', 'You need more points to claim this reward.')
      }

      const claimId = randomUUID()
      const { rows: [debit] } = await client.query(`
        INSERT INTO point_transactions (user_id,delta,reason,source_type,source_id)
        VALUES ($1,$2,$3,'redemption',$4) RETURNING id
      `, [fan.id, -reward.point_cost, `Reward claimed: ${reward.title}`, claimId])
      if (reward.stock !== null) {
        await client.query('UPDATE rewards SET stock=stock-1 WHERE id=$1', [id])
      }
      const { rows: [claim] } = await client.query(`
        INSERT INTO reward_redemptions (id,user_id,reward_id,point_transaction_id,idempotency_key,status)
        VALUES ($1,$2,$3,$4,$5,'requested')
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
    const imageUrl = giftImage(parsed.imageUrl)
    if (parsed.kind === 'merch' && (resolvedCost === null || resolvedCost === undefined)) {
      fail(400, 'INVALID_REWARD', 'Set a positive point cost for merchandise.')
    }
    const { rows: [reward] } = await db.query(`
      INSERT INTO rewards (title,headline,image_url,description,kind,terms,point_cost,stock,active,is_demo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${rewardColumns}
    `, [
      parsed.title,
      parsed.headline ?? '',
      imageUrl ?? null,
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
    const imageUrl = giftImage(parsed.imageUrl)
    const hasCost = resolvedCost !== undefined
    const hasStock = parsed.stock !== undefined
    const hasHeadline = parsed.headline !== undefined
    const hasImage = imageUrl !== undefined
    try {
      const { rows: [reward] } = await db.query(`
        UPDATE rewards SET
          title=COALESCE($2,title),
          description=COALESCE($3,description),
          kind=COALESCE($4,kind),
          terms=COALESCE($5,terms),
          point_cost=CASE WHEN $6 THEN $7::int ELSE point_cost END,
          stock=CASE WHEN $8 THEN $9::int ELSE stock END,
          active=COALESCE($10,active),
          headline=CASE WHEN $11 THEN $12 ELSE headline END,
          image_url=CASE WHEN $13 THEN $14 ELSE image_url END
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
        hasHeadline,
        parsed.headline ?? '',
        hasImage,
        imageUrl ?? null,
      ])
      if (!reward) fail(404, 'REWARD_NOT_FOUND', 'Reward not found.')
      return reward
    } catch (error) {
      if ((error as { code?: string }).code === '23514') {
        fail(400, 'INVALID_REWARD', 'Merchandise requires a positive point cost and optional non-negative stock.')
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
