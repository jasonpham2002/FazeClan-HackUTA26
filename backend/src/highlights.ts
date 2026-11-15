import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { fail } from './errors.ts'
import { highlightsForPlayer } from './integrations/youtube.ts'

const playerParams = z.object({
  id: z.string().trim().regex(/^[a-z0-9_-]{1,80}$/),
})

export function registerHighlightRoutes(app: FastifyInstance) {
  app.get('/players/:id/highlights', async request => {
    const { id } = playerParams.parse(request.params)
    const apiKey = process.env.YOUTUBE_API_KEY?.trim()
    if (!apiKey) fail(503, 'YOUTUBE_UNAVAILABLE', 'YouTube highlights are not configured.')
    return highlightsForPlayer(id, apiKey)
  })
}
