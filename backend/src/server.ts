import { registerCalendarRoutes } from './esports-calendar.ts'
import { pathToFileURL } from 'node:url'
import cors from '@fastify/cors'
import Fastify, { LogController } from 'fastify'
import type { Pool } from 'pg'
import { ZodError } from 'zod'
import { registerAuth, type SendMail } from './auth.ts'
import { listenHost, loadConfig, type Config } from './config.ts'
import { createPool } from './db.ts'
import { ApiError, fail } from './errors.ts'
import { registerHighlightRoutes } from './highlights.ts'
import { registerPlayerInsightRoutes } from './player-insights.ts'
import { registerInterviewRoutes } from './interviews.ts'
import { registerPointRoutes } from './points.ts'
import { registerPredictionRoutes } from './predictions.ts'
import { registerRewardRoutes } from './rewards.ts'
import { registerFanRoutes } from './fan.ts'
import { registerStaffRoutes } from './staff.ts'
import { registerPlayerRoutes } from './esports-data.ts'

export function buildApp(config: Config, db: Pool, sendMail?: SendMail) {
  const app = Fastify({
    logger: { level: 'warn' },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 512 * 1024,
  })
  app.register(cors, {
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store')
    const origin = request.headers.origin
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin && origin !== config.baseUrl && !config.origins.includes(origin)) {
      fail(403, 'UNTRUSTED_ORIGIN', 'This origin cannot make changes.')
    }
  })
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Check the request fields and try again.' } })
      return
    }
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
      return
    }
    const details = error instanceof Error ? error as Error & { statusCode?: number; code?: string } : undefined
    if (details?.statusCode && details.statusCode >= 400 && details.statusCode < 500) {
      reply.code(details.statusCode).send({ error: { code: 'INVALID_REQUEST', message: 'The server could not accept this request.' } })
      return
    }
    request.log.error({ code: details?.code }, 'Request failed')
    reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' } })
  })
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'This route does not exist.' } })
  })
  app.get('/health', async () => {
    const { rows: [schema] } = await db.query<{ ready: boolean }>(
      `SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest(ARRAY[
        'user','events','point_transactions','prediction_markets','rewards',
        'esports_players','esports_stat_snapshots','engagement_players',
        'esports_matches','esports_tournaments','engagement_matches','engagement_tournaments'
      ]) AS required(name)`,
    ).catch(() => fail(503, 'DATABASE_UNAVAILABLE', 'The database is unavailable.'))
    if (!schema.ready) fail(503, 'SCHEMA_NOT_READY', 'Run the backend migrations before using this API.')
    return { status: 'ok', apiVersion: 'faze-id-v1', capabilities: ['players', 'predictions', 'points', 'rewards'] }
  })
  const auth = registerAuth(app, db, config, sendMail)
  registerPlayerRoutes(app, db)
  registerCalendarRoutes(app, db)
  registerFanRoutes(app, db, auth)
  registerStaffRoutes(app, db, auth)
  registerPredictionRoutes(app, db, auth)
  registerPointRoutes(app, db, auth)
  registerRewardRoutes(app, db, auth)
  registerInterviewRoutes(app, db, config.agentToken)
  registerHighlightRoutes(app)
  registerPlayerInsightRoutes(app, db)
  return app
}

async function main() {
  const config = loadConfig()
  const db = createPool(config.databaseUrl, config.schema)
  const app = buildApp(config, db)
  app.addHook('onClose', async () => db.end())
  function stop() {
    void app.close().catch(() => {
      process.exitCode = 1
    })
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    const host = listenHost()
    await app.listen({ host, port: config.port })
    console.log(`FaZe API listening on ${config.baseUrl}`)
  } catch {
    await app.close()
    throw new Error('Could not start the local API')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: Error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
