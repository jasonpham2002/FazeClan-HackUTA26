import { afterEach, expect, it, vi } from 'vitest'
import { createRequestId } from './requestId'
afterEach(() => vi.unstubAllGlobals())
it('creates distinct UUID v4 keys on HTTP where randomUUID is unavailable', () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
  vi.stubGlobal('crypto', { getRandomValues })
  const ids = Array.from({ length: 32 }, createRequestId)
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
it('uses native randomUUID when available', () => {
  const randomUUID = vi.fn(() => '12345678-1234-4567-89ab-123456789abc')
  vi.stubGlobal('crypto', { randomUUID })
  expect(createRequestId()).toBe('12345678-1234-4567-89ab-123456789abc')
  expect(randomUUID).toHaveBeenCalledOnce()
})
