import type { ApiClient } from './client'
import { createFixtureClient, FIXTURE_DB_KEY } from './fixtures/client'
import { createHttpClient } from './http'

export { ApiError } from './client'
export type { ApiClient } from './client'

export type DataSource = 'fixtures' | 'live'

/**
 * The data source is chosen once, from configuration. There is no automatic
 * fallback: in live mode a failing API shows an error, never fixture data.
 */
export const dataSource: DataSource = import.meta.env.VITE_DATA_SOURCE === 'live' ? 'live' : 'fixtures'

const FAILURE_KEY = 'faze-demo-simulated-failure'

export function getSimulatedFailure(): number | null {
  const value = Number(localStorage.getItem(FAILURE_KEY))
  return value > 0 ? value : null
}

export function setSimulatedFailure(status: number | null) {
  if (status) localStorage.setItem(FAILURE_KEY, String(status))
  else localStorage.removeItem(FAILURE_KEY)
}

export function resetFixtureData() {
  localStorage.removeItem(FIXTURE_DB_KEY)
  localStorage.removeItem(FAILURE_KEY)
}

export const api: ApiClient = dataSource === 'live'
  ? createHttpClient((import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''))
  : createFixtureClient({ storage: localStorage, simulatedFailure: getSimulatedFailure })
