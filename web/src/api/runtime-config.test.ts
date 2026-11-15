import { describe, expect, it } from 'vitest'
import { runtimeConfig } from './runtime-config'

describe('persistence configuration', () => {
  it('defaults development to the real local backend, not browser fixtures', () => {
    expect(runtimeConfig({}, true)).toEqual({ dataSource: 'live', apiBaseUrl: 'http://127.0.0.1:3001' })
  })
  it('uses the same-origin API in production and respects an explicit API URL', () => {
    expect(runtimeConfig({}, false)).toEqual({ dataSource: 'live', apiBaseUrl: '/api' })
    expect(runtimeConfig({ VITE_API_BASE_URL: ' http://127.0.0.1:53112/ ' }, true).apiBaseUrl).toBe('http://127.0.0.1:53112')
  })
  it('allows fixtures only when deliberately configured and rejects typos', () => {
    expect(runtimeConfig({ VITE_DATA_SOURCE: 'fixtures' }, true).dataSource).toBe('fixtures')
    expect(() => runtimeConfig({ VITE_DATA_SOURCE: 'lve' }, true)).toThrow(/Refusing/)
  })
})
