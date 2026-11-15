import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './http'

afterEach(() => vi.restoreAllMocks())
describe('live fan adapter', () => {
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
  it('supports live sign-out, profile updates, attendance recording, and default starter questions when interview draft is null', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'user_1', email: 'fan@example.test', displayName: 'FaZe Fan', phone: '+12025550199', role: 'fan',
    })))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      draft: null, draftUpdatedAt: '2026-04-19T12:00:00.000Z', publishedVersion: null,
    })))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ recorded: true })))
    const api = createHttpClient('/api')
    await api.signOut()
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/api/auth/sign-out', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({}),
    }))
    const updated = await api.updateProfile({ displayName: 'FaZe Fan', phone: '+12025550199' })
    expect(updated.displayName).toBe('FaZe Fan')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/me', expect.objectContaining({
      method: 'PATCH', credentials: 'include', body: JSON.stringify({ displayName: 'FaZe Fan', phone: '+12025550199' }),
    }))
    const interview = await api.getInterview('evt_1')
    expect(interview.draft.questions).toHaveLength(4)
    expect(interview.hasUnpublishedChanges).toBe(true)
    await api.recordAttendance('app_1')
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/admin/applications/app_1/attendance', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({}),
    }))
  })
})
