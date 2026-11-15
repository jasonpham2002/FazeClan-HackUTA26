// Read-only public checks. Never reads local database credentials or changes server state.
export async function verifyDeployment(baseUrl: string) {
  const base = new URL(baseUrl)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Use an http(s) API base URL without credentials, query or fragment.')
  }
  const root = base.href.replace(/\/$/, '')
  async function get(path: string): Promise<Record<string, unknown>> {
    const response = await fetch(root + path, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`${path}: expected JSON; check the API URL or reverse proxy`)
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${path}: invalid JSON response`)
    return body as Record<string, unknown>
  }
  const health = await get('/health')
  if (health.status !== 'ok' || health.apiVersion !== 'faze-id-v1') throw new Error('/health: expected the current FaZe ID backend; deploy and restart the updated API')
  const roster = await get('/players')
  if (!Array.isArray(roster.players) || !roster.players.length) throw new Error('/players: no imported roster; check DATABASE_URL, DB_SCHEMA and the data import')
  for (const [path,key] of [['/esports/matches','matches'],['/rewards','rewards'],['/predictions/markets','markets'],['/events','events']]) {
    if (!Array.isArray((await get(path))[key])) throw new Error(`${path}: missing ${key} list`)
  }
  const player = roster.players.find((row: {rosterStatus?:string}) => row.rosterStatus === 'active') as {id?:unknown} | undefined
  if (!player || typeof player.id !== 'string') throw new Error('/players: no active player')
  const stats = await get(`/players/${encodeURIComponent(player.id)}/stats`)
  if (typeof stats.snapshotId !== 'string' || stats.isDemo !== false || !stats.source) throw new Error('/players/:id/stats: expected a sourced snapshot')
  return { status: 'ok', apiVersion: health.apiVersion, rosterRecords: roster.players.length, sourcedStats: true }
}
if (import.meta.main) {
  try {
    const base = process.argv[2]
    if (!base) throw new Error('Usage: npm run verify:deployment -- http://HOST:3001')
    console.log(JSON.stringify(await verifyDeployment(base)))
  } catch(error) {
    console.error(error instanceof Error ? error.message : 'Deployment verification failed')
    process.exitCode = 1
  }
}
