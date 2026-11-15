import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { fail } from './errors.ts'

const params = z.object({
  id: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,100}$/),
})

const query = z.object({
  snapshotId: z.string().trim().regex(/^[a-f0-9]{64}$/),
})

const STATS = [
  ['rating', 'Rating'],
  ['adr', 'ADR'],
  ['kd', 'K/D'],
  ['headshotPercent', 'Headshot percentage'],
  ['kastPercent', 'KAST'],
  ['killsPerRound', 'Kills per round'],
  ['deathsPerRound', 'Deaths per round'],
] as const

type Snapshot = {
  mapsPlayed?: number | null
  metrics?: Partial<Record<(typeof STATS)[number][0], number | null>>
}

export type SnapshotInsight = {
  playerId: string
  snapshotId: string
  generatedAt: string
  status: 'ready'
  summary: string
  observations: { text: string; metricRefs: string[]; sourceIds: string[] }[]
  limitations: string[]
  isDemo: false
}

function shown(key: (typeof STATS)[number][0], value: number): string {
  return key === 'headshotPercent' || key === 'kastPercent' ? `${value}%` : String(value)
}

/** Say only the numbers in this snapshot. Missing K/D and headshot stay missing. */
export function insightFromSnapshot(playerId: string, snapshotId: string, handle: string, snapshot: Snapshot): SnapshotInsight {
  const metrics = snapshot.metrics ?? {}
  const observations = STATS.flatMap(([key, label]) => {
    const value = metrics[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return [{ text: `${label} is ${shown(key, value)}.`, metricRefs: [`metrics.${key}`], sourceIds: [] }]
    }
    if (key === 'kd' || key === 'headshotPercent') {
      return [{ text: `${label} is unavailable.`, metricRefs: [`metrics.${key}`], sourceIds: [] }]
    }
    return []
  })
  const maps = typeof snapshot.mapsPlayed === 'number' && Number.isFinite(snapshot.mapsPlayed) ? snapshot.mapsPlayed : null
  const rating = typeof metrics.rating === 'number' && Number.isFinite(metrics.rating) ? metrics.rating : null
  const name = handle.trim() || 'This player'
  const summary = maps !== null && rating !== null
    ? `${name} is at a ${rating} rating across ${maps} maps.`
    : `${name} has the totals shown on this page, and the missing ones stay blank.`
  return {
    playerId,
    snapshotId,
    generatedAt: new Date().toISOString(),
    status: 'ready',
    summary,
    observations,
    limitations: ['These are overall totals, not a match-by-match trend.'],
    isDemo: false,
  }
}

export function registerPlayerInsightRoutes(app: FastifyInstance, db: Pool) {
  app.get('/players/:id/insights', async request => {
    const { id } = params.parse(request.params)
    const { snapshotId } = query.parse(request.query)
    const { rows } = await db.query<{ handle: string; payload: Snapshot }>(
      `SELECT p.handle, s.payload
       FROM esports_stat_snapshots s
       JOIN esports_players p ON p.id = s.player_id
       WHERE s.player_id = $1 AND s.id = $2`,
      [id, snapshotId],
    )
    const row = rows[0]
    if (!row) fail(404, 'INSIGHT_UNAVAILABLE', 'No analysis is available for that statistics snapshot.')
    return insightFromSnapshot(id, snapshotId, row.handle, row.payload)
  })
}
