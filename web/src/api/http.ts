import { ApiError, type ApiClient } from './client'
import type { ApplicationListQuery, ErrorEnvelope } from './types'

/**
 * Live adapter for Jason's API. It never substitutes fixture data: any network
 * or HTTP failure becomes an ApiError that the screen displays.
 *
 * CONFIRM (Jason): session mechanism. This assumes a cookie session, hence
 * `credentials: 'include'`. Switch to a bearer header here if that changes.
 */
export function createHttpClient(baseUrl: string): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the API. Check that the backend is running.')
    }

    const text = await response.text()
    let json: unknown = undefined
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        // Not JSON; handled below.
      }
    }

    if (!response.ok) {
      const envelope = json as Partial<ErrorEnvelope> | undefined
      throw new ApiError(
        response.status,
        envelope?.error?.code ?? 'HTTP_ERROR',
        envelope?.error?.message ?? `Request failed with status ${response.status}.`,
      )
    }
    if (text && json === undefined) {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API returned a response that is not JSON.')
    }
    return json as T
  }

  function toQueryString(query: ApplicationListQuery): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value))
    }
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }

  const enc = encodeURIComponent

  return {
    getMe: () => request('GET', '/me'),
    listAdminEvents: () => request('GET', '/admin/events'),
    getAdminEvent: (id) => request('GET', `/admin/events/${enc(id)}`),
    createEvent: (input) => request('POST', '/admin/events', input),
    updateEvent: async (id, input) => {
      await request('PATCH', `/admin/events/${enc(id)}`, input)
    },
    getInterview: (eventId) => request('GET', `/admin/events/${enc(eventId)}/interview`),
    saveInterviewDraft: async (eventId, config) => {
      await request('PUT', `/admin/events/${enc(eventId)}/interview-draft`, config)
    },
    publishInterview: async (eventId) => {
      await request('POST', `/admin/events/${enc(eventId)}/interview-publish`)
    },
    listApplications: (query) => request('GET', `/admin/applications${toQueryString(query)}`),
    getApplication: (id) => request('GET', `/admin/applications/${enc(id)}`),
    postDecision: async (id, input) => {
      await request('POST', `/admin/applications/${enc(id)}/decision`, input)
    },
    getAnalytics: (eventId) => request('GET', `/admin/events/${enc(eventId)}/analytics`),
  }
}
