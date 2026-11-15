import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { fail } from './errors.ts'
import { analyzePlayer, type InsightSnapshot } from './integrations/player-insights.ts'

const params = z.object({
  id: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,100}$/),
})

const query = z.object({
  snapshotId: z.string().trim().regex(/^[a-f0-9]{64}$/),
})

export function registerPlayerInsightRoutes(app: FastifyInstance, db: Pool) {
  app.get('/players/:id/insights', async request => {
    const { id } = params.parse(request.params)
    const { snapshotId } = query.parse(request.query)
    const { rows } = await db.query<{ handle: string; payload: InsightSnapshot }>(
      `SELECT p.handle, s.payload
       FROM esports_stat_snapshots s
       JOIN esports_players p ON p.id = s.player_id
       WHERE s.player_id = $1 AND s.id = $2`,
      [id, snapshotId],
    )
    const row = rows[0]
    if (!row) fail(404, 'INSIGHT_UNAVAILABLE', 'No analysis is available for that statistics snapshot.')
    const apiKey = process.env.MODEL_API_KEY?.trim()
    if (!apiKey) fail(503, 'ANALYSIS_UNAVAILABLE', 'Player analysis is not configured.')
    try {
      return await analyzePlayer({
        playerId: id,
        snapshotId,
        handle: row.handle,
        snapshot: row.payload,
        apiKey,
        model: process.env.MUSE_MODEL?.trim() || 'muse-spark-1.3',
      })
    } catch {
      fail(503, 'ANALYSIS_UNAVAILABLE', 'The analysis could not be generated. The statistics on this page are unaffected.')
    }
  })
}
