import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { fail } from './errors.ts'

const file = fileURLToPath(new URL('../data/faze-player-seasons.json', import.meta.url))
const split = z.object({ rating: z.number(), maps: z.number().int().nonnegative() }).nullable()
const season = z.object({
  label: z.string(),
  kind: z.enum(['year', 'recent']),
  rating: z.number(),
  maps: z.number().int().nonnegative(),
  online: split,
  lan: split,
  majors: split,
})
const bundleSchema = z.object({
  collectedAt: z.string(),
  metric: z.string(),
  players: z.record(z.string(), z.array(season).min(1)),
})

export function registerPlayerSeasonRoutes(app: FastifyInstance) {
  app.get('/players/:id/seasons', async request => {
    const playerId = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).parse(request.params).id
    const bundle = bundleSchema.parse(JSON.parse(await readFile(file, 'utf8')))
    const seasons = bundle.players[playerId]
    if (!seasons) fail(404, 'SEASONS_UNAVAILABLE', 'No yearly statistics are available for this player.')
    return { metric: bundle.metric, collectedAt: bundle.collectedAt, seasons }
  })
}
