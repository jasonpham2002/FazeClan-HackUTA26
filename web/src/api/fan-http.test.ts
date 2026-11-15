import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './http'

afterEach(() => vi.restoreAllMocks())
describe('live fan adapter', () => {
  it('requests an email sign-in link without sending a staff role to the backend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const input = {
      email: 'staff@example.test',
      callbackURL: 'https://app.example.test/admin',
      errorCallbackURL: 'https://app.example.test/sign-in?role=staff',
    }
    await createHttpClient('/api').requestMagicLink(input)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-in/magic-link', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ ...input, name: 'staff' }),
    }))
  })

  it.each(['https://backend.example.test', '/api'])('ends the cookie session with the auth endpoint at %s', async baseUrl => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
    const api = createHttpClient(baseUrl)
    await api.signOut('fan')
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl.replace(/\/api$/, '')}/api/auth/sign-out`, expect.objectContaining({
      method: 'POST', credentials: 'include',
    }))
    await expect(api.signOut('staff')).rejects.toMatchObject({ status: 500 })
  })

  it('sends authenticated consent to the event endpoint and never a caller-controlled applicant ID', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'app_live' })))
    const api = createHttpClient('/api')
    expect(await api.createFanApplication('event/one', true)).toEqual({ id: 'app_live' })
    expect(fetchMock).toHaveBeenCalledWith('/api/events/event%2Fone/applications', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ consentVersion: 'ai-interview-v1', consentAccepted: true }),
    }))
  })
  it('surfaces forbidden application and missing-session errors without fixture fallback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not your application' } }), { status: 403 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }), { status: 401 }))
    const api = createHttpClient('/api')
    await expect(api.getMyApplication('other')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(api.getFanMe()).rejects.toMatchObject({ status: 401 })
  })
  it('refuses fixture-only persona and synthetic-call operations without sending requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const api = createHttpClient('/api')
    await expect(api.setFixtureFan({ displayName: 'Demo', email: 'fan@example.com', phone: '+12025550123' })).rejects.toMatchObject({ code: 'FIXTURE_ONLY' })
    await expect(api.simulateFanCall('app', 'completed')).rejects.toMatchObject({ code: 'FIXTURE_ONLY' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
