export interface Config {
  databaseUrl: string
  schema: string
  baseUrl: string
  port: number
  origins: string[]
  authSecret: string
  agentToken: string
  mailHost: string
  mailPort: number
}

function portNumber(value: string | undefined, fallback: number): number {
  const port = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port configuration')
  return port
}

export function loadConfig(): Config {
  const { DATABASE_URL, BETTER_AUTH_SECRET, AGENT_INGEST_TOKEN } = process.env
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (!BETTER_AUTH_SECRET || BETTER_AUTH_SECRET.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a random secret of at least 32 characters')
  if (!AGENT_INGEST_TOKEN || AGENT_INGEST_TOKEN.length < 32) throw new Error('Set AGENT_INGEST_TOKEN to a separate random secret of at least 32 characters')
  const port = portNumber(process.env.PORT, 3001)
  const mailHost = process.env.MAIL_HOST ?? '127.0.0.1'
  if (mailHost !== '127.0.0.1' && mailHost !== 'localhost') throw new Error('The local mail inbox must use a loopback address')
  return {
    databaseUrl: DATABASE_URL,
    schema: process.env.DB_SCHEMA ?? 'faze',
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    origins: (process.env.APP_ORIGINS ?? 'http://127.0.0.1:3000,http://127.0.0.1:3002,http://127.0.0.1:5189').split(',').map(origin => origin.trim()),
    authSecret: BETTER_AUTH_SECRET,
    agentToken: AGENT_INGEST_TOKEN,
    mailHost,
    mailPort: portNumber(process.env.MAIL_PORT, 1025),
  }
}
