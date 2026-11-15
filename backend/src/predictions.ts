import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { Auth } from './auth.ts'
import { transaction } from './db.ts'
import { fail } from './errors.ts'
import { pageQuery, pointAmount } from './points.ts'
import { idParams } from './views.ts'

const externalId = z.string().trim().min(1).max(128)
const optionsSchema = z.array(z.object({ id: externalId, label: z.string().trim().min(1).max(200) }))
  .refine(options => new Set(options.map(option => option.id)).size === options.length)
const createSourcedMarket = z.strictObject({
  kind: z.enum(['match_winner', 'tournament_placement']),
  referenceId: externalId,
  teamId: externalId.optional(),
  locksAt: z.iso.datetime({ offset: true }),
  awardPoints: pointAmount.default(100),
}).refine(input => (input.kind === 'tournament_placement') === (input.teamId !== undefined))
const createCustomMarket = z.strictObject({
  kind: z.enum(['match_winner', 'tournament_placement']).optional(),
  type: z.enum(['match_winner', 'placement']).optional(),
  title: z.string().trim().min(1).max(200),
  referenceId: externalId.nullable().optional(),
  matchId: externalId.nullable().optional(),
  tournamentId: externalId.nullable().optional(),
  teamId: externalId.nullable().optional(),
  options: z.array(z.union([
    z.string().max(200),
    z.strictObject({ id: externalId.optional(), label: z.string().max(200) }),
  ])).min(2).max(20),
  locksAt: z.iso.datetime({ offset: true }),
  awardPoints: pointAmount.optional(),
  award: pointAmount.optional(),
  isDemo: z.boolean().default(true),
})
const pickBody = z.strictObject({ optionId: externalId })
const settlementBody = z.strictObject({
  optionId: externalId.nullable(),
  sourceUrl: z.url({ protocol: /^https?$/ }).max(2000),
})

const placementOptions = [
  { id: 'first', label: '1st' },
  { id: 'second', label: '2nd' },
  { id: 'third_fourth', label: '3rd–4th' },
  { id: 'fifth_or_lower', label: '5th or lower' },
]

// Johnny's importer owns the data behind these views. Replays install equivalent views in a disposable schema.
async function referenceRows(db: Pool, sql: string, id: string) {
  try {
    return (await db.query(sql, [id])).rows
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') throw error
    fail(503, 'ESPORTS_DATA_UNAVAILABLE', 'The esports data source is unavailable.')
  }
}

const pickColumns = `option_id AS "optionId", submitted_at AS "submittedAt"`
const resultColumns = `option_id AS "optionId", source_url AS "sourceUrl", settled_at AS "settledAt"`
const marketStatusSql = `CASE WHEN s.market_id IS NOT NULL THEN CASE WHEN s.option_id IS NULL THEN 'void' ELSE 'settled' END
    WHEN m.locks_at <= statement_timestamp() THEN 'locked' ELSE 'open' END`
const marketColumns = `m.id, m.kind,
  CASE WHEN m.kind = 'tournament_placement' THEN 'placement' ELSE 'match_winner' END AS type,
  m.reference_id AS "referenceId",
  CASE WHEN m.kind = 'match_winner' THEN m.reference_id END AS "matchId",
  CASE WHEN m.kind = 'tournament_placement' THEN m.reference_id END AS "tournamentId",
  m.team_id AS "teamId", m.title, m.options,
  m.locks_at AS "locksAt", m.award_points AS "awardPoints", m.award_points AS award, m.is_demo AS "isDemo",
  ${marketStatusSql} AS status,
  ${marketStatusSql} AS state,
  (SELECT row_to_json(r) FROM (SELECT ${resultColumns} FROM prediction_settlements WHERE market_id=m.id AND option_id IS NOT NULL) r) AS result`

function normalizeCustomOptions(rawOptions: Array<string | { id?: string; label: string }>) {
  const cleaned = rawOptions
    .map(item => (typeof item === 'string' ? { id: undefined, label: item.trim() } : { id: item.id?.trim(), label: item.label.trim() }))
    .filter(item => item.label.length > 0)
    .map((item, index) => ({ id: item.id || `opt_${index + 1}`, label: item.label }))
  const distinctIds = new Set(cleaned.map(item => item.id)).size === cleaned.length
  const distinctLabels = new Set(cleaned.map(item => item.label.toLowerCase())).size === cleaned.length
  if (cleaned.length < 2 || !distinctIds || !distinctLabels) {
    fail(400, 'VALIDATION_ERROR', 'Provide at least two distinct options.')
  }
  return cleaned
}

async function insertMarket(
  db: Pool,
  params: {
    kind: 'match_winner' | 'tournament_placement'
    referenceId: string
    teamId: string | null
    title: string
    options: Array<{ id: string; label: string }>
    locksAt: string
    awardPoints: number
    isDemo: boolean
    createdBy: string
  },
) {
  const { rows: [created] } = await db.query(`
    WITH inserted AS (
      INSERT INTO prediction_markets (kind,reference_id,team_id,title,options,locks_at,award_points,is_demo,created_by)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE $6::timestamptz > clock_timestamp()
      ON CONFLICT DO NOTHING RETURNING *
    )
    SELECT ${marketColumns} FROM inserted m LEFT JOIN prediction_settlements s ON s.market_id=m.id
  `, [
    params.kind,
    params.referenceId,
    params.teamId,
    params.title,
    JSON.stringify(params.options),
    params.locksAt,
    params.awardPoints,
    params.isDemo,
    params.createdBy,
  ])
  if (!created) {
    const { rows: [clock] } = await db.query('SELECT $1::timestamptz > clock_timestamp() AS future', [params.locksAt])
    if (!clock.future) fail(400, 'INVALID_LOCK_TIME', 'Choose a future lock time.')
    fail(409, 'MARKET_EXISTS', 'A market already exists for this match or tournament team.')
  }
  return created
}

export function registerPredictionRoutes(app: FastifyInstance, db: Pool, auth: Auth) {
  app.get('/me/follows', async request => {
    const fan = await auth.requireUser(request, 'fan')
    const { rows } = await db.query<{ player_id: string }>('SELECT player_id FROM player_follows WHERE user_id=$1 ORDER BY created_at DESC, player_id', [fan.id])
    const playerIds = rows.map(row => row.player_id)
    return { playerIds, follows: playerIds }
  })

  app.put('/me/follows/:playerId', async (request, reply) => {
    const fan = await auth.requireUser(request, 'fan')
    const { playerId } = z.object({ playerId: externalId }).parse(request.params)
    const prior = await db.query('SELECT 1 FROM player_follows WHERE user_id=$1 AND player_id=$2', [fan.id, playerId])
    if (!prior.rowCount) {
      if (!(await referenceRows(db, 'SELECT id FROM engagement_players WHERE id=$1', playerId)).length) {
        fail(404, 'PLAYER_NOT_FOUND', 'Player not found.')
      }
      await db.query('INSERT INTO player_follows (user_id,player_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [fan.id, playerId])
    }
    return reply.code(204).send()
  })

  app.delete('/me/follows/:playerId', async (request, reply) => {
    const fan = await auth.requireUser(request, 'fan')
    const { playerId } = z.object({ playerId: externalId }).parse(request.params)
    await db.query('DELETE FROM player_follows WHERE user_id=$1 AND player_id=$2', [fan.id, playerId])
    return reply.code(204).send()
  })

  app.get('/predictions/markets', async request => {
    const user = await auth.sessionUser(request)
    const fanId = user?.role === 'fan' ? user.id : null
    const { rows } = await db.query(`
      SELECT ${marketColumns},
        (SELECT row_to_json(p) FROM (SELECT ${pickColumns} FROM predictions WHERE market_id=m.id AND user_id=$1) p) AS "myPick"
      FROM prediction_markets m LEFT JOIN prediction_settlements s ON s.market_id=m.id ORDER BY m.locks_at DESC,m.id
    `, [fanId])
    return { markets: rows }
  })

  app.post('/predictions/markets/:id/pick', async (request, reply) => {
    const fan = await auth.requireUser(request, 'fan')
    const { id } = idParams.parse(request.params)
    const { optionId } = pickBody.parse(request.body)
    const pick = await transaction(db, async client => {
      const { rows: [market] } = await client.query('SELECT options FROM prediction_markets WHERE id=$1 FOR UPDATE', [id])
      if (!market) fail(404, 'MARKET_NOT_FOUND', 'Prediction market not found.')
      const validOption = market.options.some((option: { id: string }) => option.id === optionId)
      const { rows: [saved] } = await client.query(`
        WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS submitted_at),
        eligibility AS (
          SELECT submitted_at, submitted_at < locks_at AND NOT EXISTS (
            SELECT 1 FROM prediction_settlements WHERE market_id=$1
          ) AS open FROM observed CROSS JOIN prediction_markets WHERE id=$1
        ),
        inserted AS (
          INSERT INTO predictions (market_id,user_id,option_id,submitted_at)
          SELECT $1,$2,$3,submitted_at FROM eligibility WHERE open AND $4
          ON CONFLICT DO NOTHING RETURNING ${pickColumns}
        )
        SELECT eligibility.open, inserted.* FROM eligibility LEFT JOIN inserted ON true
      `, [id, fan.id, optionId, validOption])
      if (!saved.open) fail(409, 'MARKET_LOCKED', 'Predictions for this market are closed.')
      if (!validOption) fail(400, 'INVALID_OPTION', 'Select an option from this market.')
      if (saved.optionId === null) fail(409, 'DUPLICATE_PICK', 'Your first pick is final.')
      return { optionId: saved.optionId, submittedAt: saved.submittedAt }
    })
    return reply.code(201).send(pick)
  })

  app.get('/admin/prediction-markets', async request => {
    await auth.requireUser(request, 'staff')
    const { rows } = await db.query(`
      SELECT ${marketColumns}, m.created_by AS "createdBy", s.reviewer_id AS "reviewerId",
        (SELECT count(*)::int FROM predictions p WHERE p.market_id = m.id) AS "pickCount",
        COALESCE(
          (
            SELECT jsonb_object_agg(opt->>'id', COALESCE(cnt.c, 0))
            FROM jsonb_array_elements(m.options) opt
            LEFT JOIN (
              SELECT option_id, count(*)::int AS c
              FROM predictions
              WHERE market_id = m.id
              GROUP BY option_id
            ) cnt ON cnt.option_id = opt->>'id'
          ),
          '{}'::jsonb
        ) AS "picksByOption"
      FROM prediction_markets m LEFT JOIN prediction_settlements s ON s.market_id=m.id ORDER BY m.locks_at DESC,m.id
    `)
    return { markets: rows }
  })

  app.post('/admin/prediction-markets', async (request, reply) => {
    const staff = await auth.requireUser(request, 'staff')
    const raw = request.body as Record<string, unknown> | null | undefined
    if (raw && typeof raw === 'object' && ('title' in raw || 'options' in raw)) {
      const body = createCustomMarket.parse(raw)
      const kind = body.kind ?? (body.type === 'placement' ? 'tournament_placement' : 'match_winner')
      const options = normalizeCustomOptions(body.options)
      const referenceId = body.referenceId
        ?? (kind === 'match_winner' ? body.matchId : body.tournamentId)
        ?? `custom:${randomUUID()}`
      const teamId = kind === 'tournament_placement' ? (body.teamId ?? 'faze') : null
      const awardPoints = body.awardPoints ?? body.award ?? 100
      if (body.awardPoints !== undefined && body.award !== undefined && body.awardPoints !== body.award) {
        fail(400, 'INVALID_INPUT', 'Provide either awardPoints or award, not conflicting values.')
      }
      const created = await insertMarket(db, {
        kind,
        referenceId,
        teamId,
        title: body.title,
        options,
        locksAt: body.locksAt,
        awardPoints,
        isDemo: body.isDemo,
        createdBy: staff.id,
      })
      return reply.code(201).send(created)
    }

    const { kind, referenceId, teamId, locksAt, awardPoints } = createSourcedMarket.parse(request.body)
    const match = kind === 'match_winner'
    const [reference] = await referenceRows(db, match
      ? 'SELECT title, starts_at, participants, is_demo FROM engagement_matches WHERE id=$1'
      : 'SELECT title, teams, is_demo FROM engagement_tournaments WHERE id=$1', referenceId)
    if (!reference) fail(404, 'ESPORTS_REFERENCE_NOT_FOUND', 'Match or tournament not found.')
    const parsed = optionsSchema.safeParse(match ? reference.participants : reference.teams)
    if (!parsed.success || (match && parsed.data.length !== 2)) {
      fail(503, 'ESPORTS_DATA_UNAVAILABLE', 'The esports participants are unavailable.')
    }
    const team = parsed.data.find(option => option.id === teamId)
    if (!match && !team) fail(400, 'INVALID_TEAM', 'Select a team from this tournament.')
    if (match && Date.parse(locksAt) > new Date(reference.starts_at).getTime()) {
      fail(400, 'INVALID_LOCK_TIME', 'The market must lock by the match start.')
    }
    const created = await insertMarket(db, {
      kind,
      referenceId,
      teamId: teamId ?? null,
      title: team ? `${reference.title} · ${team.label}` : reference.title,
      options: match ? parsed.data : placementOptions,
      locksAt,
      awardPoints,
      isDemo: reference.is_demo,
      createdBy: staff.id,
    })
    return reply.code(201).send(created)
  })

  app.get('/admin/prediction-markets/:id/picks', async request => {
    await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const { page, pageSize } = pageQuery.parse(request.query)
    const { rows: [row] } = await db.query(`
      SELECT (SELECT count(*)::int FROM predictions WHERE market_id=m.id) AS total,
        COALESCE((SELECT json_agg(p ORDER BY p."submittedAt" DESC,p."userId") FROM (
          SELECT user_id AS "userId", ${pickColumns} FROM predictions WHERE market_id=m.id
          ORDER BY submitted_at DESC,user_id LIMIT $2 OFFSET $3
        ) p),'[]'::json) AS picks
      FROM prediction_markets m WHERE m.id=$1
    `, [id, pageSize, (page - 1) * pageSize])
    if (!row) fail(404, 'MARKET_NOT_FOUND', 'Prediction market not found.')
    return { ...row, page, pageSize }
  })

  app.post('/admin/prediction-markets/:id/settle', async request => {
    const staff = await auth.requireUser(request, 'staff')
    const { id } = idParams.parse(request.params)
    const { optionId, sourceUrl } = settlementBody.parse(request.body)
    return transaction(db, async client => {
      const { rows: [market] } = await client.query('SELECT options FROM prediction_markets WHERE id=$1 FOR UPDATE', [id])
      if (!market) fail(404, 'MARKET_NOT_FOUND', 'Prediction market not found.')
      const { rows: [prior] } = await client.query(`
        SELECT ${resultColumns}, reviewer_id AS "reviewerId" FROM prediction_settlements WHERE market_id=$1
      `, [id])
      if (prior) {
        if (prior.optionId !== optionId || prior.sourceUrl !== sourceUrl) {
          fail(409, 'SETTLEMENT_CONFLICT', 'This market already has a different confirmed result.')
        }
        return prior
      }
      if (optionId !== null && !market.options.some((option: { id: string }) => option.id === optionId)) {
        fail(400, 'INVALID_OPTION', 'Select an option from this market.')
      }
      const { rows: [saved] } = await client.query(`
        INSERT INTO prediction_settlements (market_id,option_id,source_url,reviewer_id)
        VALUES ($1,$2,$3,$4)
        RETURNING ${resultColumns}, reviewer_id AS "reviewerId"
      `, [id, optionId, sourceUrl, staff.id])
      if (optionId !== null) {
        await client.query(`
          INSERT INTO point_transactions (user_id,delta,reason,source_type,source_id,reviewer_id)
          SELECT p.user_id,m.award_points,'Correct prediction: ' || m.title,'prediction',m.id,$3
          FROM predictions p JOIN prediction_markets m ON m.id=p.market_id WHERE p.market_id=$1 AND p.option_id=$2
        `, [id, optionId, staff.id])
      }
      return saved
    })
  })
}
