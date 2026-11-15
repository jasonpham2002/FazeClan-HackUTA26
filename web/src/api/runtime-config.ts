export type DataSource = 'fixtures' | 'live'

/** Real persistence is the default; browser-only samples require an explicit opt-in. */
export function runtimeConfig(env: { VITE_DATA_SOURCE?: string; VITE_API_BASE_URL?: string }, development: boolean) {
  const value = env.VITE_DATA_SOURCE?.trim() || 'live'
  if (value !== 'live' && value !== 'fixtures') {
    throw new Error('VITE_DATA_SOURCE must be live or fixtures. Refusing to silently use browser-only data.')
  }
  const apiBaseUrl = (env.VITE_API_BASE_URL?.trim() || (development ? 'http://127.0.0.1:3001' : '/api')).replace(/\/$/, '')
  return { dataSource: value as DataSource, apiBaseUrl }
}
