import type { ApiClient } from './client'
import { createFixtureClient, FIXTURE_DB_KEY } from './fixtures/client'
import { createHttpClient } from './http'
import { runtimeConfig } from './runtime-config'

export { ApiError } from './client'
export type { ApiClient } from './client'

export type { DataSource } from './runtime-config'

/**
 * The data source is chosen once, from configuration. There is no automatic
 * fallback: in live mode a failing API shows an error, never fixture data.
 */
const runtime = runtimeConfig({ VITE_DATA_SOURCE: import.meta.env.VITE_DATA_SOURCE, VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL }, import.meta.env.DEV)
export const dataSource = runtime.dataSource

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
  ? createHttpClient(runtime.apiBaseUrl)
  : createFixtureClient({ storage: localStorage, simulatedFailure: getSimulatedFailure })
