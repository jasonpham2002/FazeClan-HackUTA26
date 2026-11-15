import { defaultInterviewConfig } from '../lib/interviewConfig'
import { ApiError, type ApiClient } from './client'
import type {
  ActivityEvent, Analytics, Answer, ApplicationDetail, ApplicationListQuery, ApplicationStatus,
  CallAttempt, Decision, DecisionRecord, ErrorEnvelope, EventInput, EventRecord, FanApplication,
  InterviewConfig, InterviewResult, Me, TranscriptSegment,
} from './types'

type EventDto = Omit<EventRecord, 'applicationDeadline' | 'publicationStatus'> & {
  deadline: string; status: EventRecord['publicationStatus']; remainingCapacity: number
}
type VersionDto = { id: string; version: number; publishedAt: string }
type AttemptDto = Omit<CallAttempt, 'startedAt' | 'durationSeconds'> & {
  attemptedAt: string | null; connectedAt: string | null; mode: string
}
type DecisionDto = Omit<DecisionRecord, 'decision' | 'reviewer'> & {
  decision: 'invited' | 'waitlisted'; reviewerId: string | null; reviewerName: string | null
}
type ActivityDto = Omit<ActivityEvent, 'type'> & { type: string }
type ApplicationDto = {
  id: string; userId: string; status: ApplicationStatus; submittedAt: string; event: EventDto;
  profile: Me; pinnedVersion: VersionDto; latestAttempt: AttemptDto | null;
  decision: Pick<DecisionDto, 'decision'> | null;
}
type ReviewDto = {
  application: ApplicationDto; event: EventDto; fan: Me; interview: VersionDto & InterviewConfig;
  attempts: AttemptDto[]; selectedAttemptId: string | null; answers: Answer[];
  result: Omit<InterviewResult, 'callAttemptId' | 'interviewVersionId' | 'answers'> &
    { processingStatus: string } | null;
  transcript: Omit<TranscriptSegment, 'callAttemptId'>[]; activity: ActivityDto[];
  decisions: DecisionDto[]; pastApplications: ApplicationDetail['pastApplications']; capacity: ApplicationDetail['capacity'];
}
type AnalyticsDto = Omit<Analytics, 'eventId' | 'connectionRate' | 'completionRate' | 'invitationsAccepted'> & { accepted: number }

function eventRecord({ deadline, status, ...event }: EventDto): EventRecord {
  return { ...event, applicationDeadline: deadline, publicationStatus: status }
}
function eventBody({ applicationDeadline, publicationStatus, ...event }: EventInput) {
  return { ...event, deadline: applicationDeadline, status: publicationStatus }
}
function version({ id, version, publishedAt }: VersionDto) {
  return { versionId: id, versionNumber: version, publishedAt }
}
function attempt(call: AttemptDto): CallAttempt {
  const startedAt = call.connectedAt ?? call.attemptedAt
  const durationSeconds = startedAt && call.endedAt
    ? Math.max(0, Math.round((Date.parse(call.endedAt) - Date.parse(startedAt)) / 1000)) : null
  return { ...call, startedAt, durationSeconds }
}
function decision(value: DecisionDto['decision']): Decision {
  return value === 'invited' ? 'invite' : 'waitlist'
}
function activity(rows: ActivityDto[]): ActivityEvent[] {
  return rows.flatMap((row): ActivityEvent[] => {
    if (row.type === 'application_submitted') return [{ ...row, type: 'application' }]
    if (row.type === 'invitation_accepted' || row.type === 'attendance') return [{ ...row, type: row.type }]
    return []
  })
}
function fanApplication(row: ApplicationDto): FanApplication {
  return {
    id: row.id, userId: row.userId, submittedAt: row.submittedAt, status: row.status,
    event: eventRecord(row.event), profile: row.profile, interviewVersion: version(row.pinnedVersion),
    call: row.latestAttempt && attempt(row.latestAttempt),
    invitation: row.status === 'invited' ? {
      expiresAt: row.event.startsAt,
      capacityAvailable: row.event.status === 'published' && row.event.remainingCapacity > 0,
    } : null,
  }
}
function review(row: ReviewDto): ApplicationDetail {
  const { intro, tone, maxDurationSeconds, questions } = row.interview
  const decisionHistory = row.decisions.map(item => ({
    id: item.id, decision: decision(item.decision), reason: item.reason, createdAt: item.createdAt,
    reviewer: { id: item.reviewerId ?? '', displayName: item.reviewerName },
  }))
  return {
    id: row.application.id, status: row.application.status, submittedAt: row.application.submittedAt,
    applicant: { ...row.fan, displayName: row.fan.displayName || null }, event: row.event, interviewVersion: {
      ...version(row.interview), config: { intro, tone, maxDurationSeconds, questions },
    },
    selectedAttemptId: row.selectedAttemptId, attempts: row.attempts.map(attempt),
    result: row.result?.processingStatus === 'ready' && row.selectedAttemptId ? {
      ...row.result, callAttemptId: row.selectedAttemptId, interviewVersionId: row.interview.id, answers: row.answers,
    } : null,
    transcript: row.selectedAttemptId
      ? row.transcript.map(item => ({ ...item, callAttemptId: row.selectedAttemptId! })) : [],
    activity: activity(row.activity), pastApplications: row.pastApplications, capacity: row.capacity,
    decision: decisionHistory[0] ?? null, decisionHistory,
  }
}

/**
 * Live adapter for Jason's API. It never substitutes fixture data: any network
 * or HTTP failure becomes an ApiError that the screen displays.
 *
 * CONFIRM (Jason): session mechanism. This assumes a cookie session, hence
 * `credentials: 'include'`. Switch to a bearer header here if that changes.
 */
export function createHttpClient(baseUrl: string): ApiClient {
  const authPath = baseUrl.endsWith('/api') ? '/auth' : '/api/auth'
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
    requestMagicLink: async input => {
      await request('POST', `${authPath}/sign-in/magic-link`, {
        ...input,
        name: input.email.split('@')[0].slice(0, 80),
      })
    },
    signOut: async () => { await request('POST', `${authPath}/sign-out`, {}) },
    signInFixture: async () => { throw new ApiError(400, 'FIXTURE_ONLY', 'Use the authentication service to sign in.') },
    signUpFixtureFan: async () => { throw new ApiError(400, 'FIXTURE_ONLY', 'Use the authentication service to sign up.') },
    getFanMe: () => request('GET', '/me'),
    updateFanProfile: async input => { await request('PATCH', '/me', input) },
    setFixtureFan: async () => { throw new ApiError(400, 'FIXTURE_ONLY', 'Use the real authentication service to change your profile.') },
    listFanEvents: async () => (await request<{ events: EventDto[] }>('GET', '/events')).events.map(eventRecord),
    getFanEvent: async id => eventRecord(await request<EventDto>('GET', `/events/${enc(id)}`)),
    listMyApplications: async () => (await request<{ applications: ApplicationDto[] }>('GET', '/me/applications')).applications.map(fanApplication),
    getMyApplication: async id => fanApplication(await request<ApplicationDto>('GET', `/applications/${enc(id)}`)),
    createFanApplication: (eventId, consent) => request('POST', `/events/${enc(eventId)}/applications`, { consentVersion: 'ai-interview-v1', consentAccepted: consent }),
    requestFanCall: async (id) => { await request('POST', `/applications/${enc(id)}/call`, {}) },
    acceptFanInvitation: async (id) => { await request('POST', `/applications/${enc(id)}/accept`, {}) },
    listMyActivity: async () => activity((await request<{ activity: ActivityDto[] }>('GET', '/me/activity')).activity),
    simulateFanCall: async () => { throw new ApiError(400, 'FIXTURE_ONLY', 'Call simulation is unavailable in live mode.') },
    getMe: () => request('GET', '/me'),
    listAdminEvents: async () => (await request<{ events: EventDto[] }>('GET', '/admin/events')).events.map(eventRecord),
    getAdminEvent: async id => eventRecord(await request<EventDto>('GET', `/admin/events/${enc(id)}`)),
    createEvent: async input => eventRecord(await request<EventDto>('POST', '/admin/events', eventBody(input))),
    updateEvent: async (id, input) => {
      await request('PATCH', `/admin/events/${enc(id)}`, eventBody(input))
    },
    async getInterview(eventId) {
      const state = await request<{
        draft: InterviewConfig | null; draftUpdatedAt: string | null;
        publishedVersion: VersionDto | null; hasUnpublishedChanges: boolean;
      }>('GET', `/admin/events/${enc(eventId)}/interview`)
      return {
        eventId, draft: state.draft ?? defaultInterviewConfig(),
        draftUpdatedAt: state.draftUpdatedAt,
        hasUnpublishedChanges: state.draft ? state.hasUnpublishedChanges : !state.publishedVersion,
        published: state.publishedVersion && version(state.publishedVersion),
      }
    },
    saveInterviewDraft: async (eventId, config) => {
      await request('PUT', `/admin/events/${enc(eventId)}/interview-draft`, config)
    },
    publishInterview: async (eventId) => {
      await request('POST', `/admin/events/${enc(eventId)}/interview-publish`)
    },
    async listApplications(query) {
      const { applications, ...page } = await request<{
        applications: ApplicationDto[]; page: number; pageSize: number; total: number;
      }>('GET', `/admin/applications${toQueryString(query)}`)
      const items = applications.map(row => ({
        id: row.id, applicant: { ...row.profile, displayName: row.profile.displayName || null }, event: row.event, submittedAt: row.submittedAt, status: row.status,
        latestCallStatus: row.latestAttempt?.status ?? null, processingStatus: row.latestAttempt?.processingStatus ?? null,
        decision: row.decision && decision(row.decision.decision),
      }))
      return { ...page, items }
    },
    getApplication: async id => review(await request<ReviewDto>('GET', `/admin/applications/${enc(id)}`)),
    postDecision: async (id, input) => {
      await request('POST', `/admin/applications/${enc(id)}/decision`, { ...input, decision: input.decision === 'invite' ? 'invited' : 'waitlisted' })
    },
    recordAttendance: async (id) => {
      await request('POST', `/admin/applications/${enc(id)}/attendance`, {})
    },
    async getAnalytics(eventId) {
      const counts = await request<AnalyticsDto>('GET', `/admin/events/${enc(eventId)}/analytics`)
      return {
        ...counts, eventId, invitationsAccepted: counts.accepted,
        connectionRate: { numerator: counts.callsConnected, denominator: counts.callsAttempted },
        completionRate: { numerator: counts.interviewsCompleted, denominator: counts.callsConnected },
      }
    },
  }
}
