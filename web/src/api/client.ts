import type {
  Analytics,
  ApplicationDetail,
  ApplicationListItem,
  ApplicationListQuery,
  DecisionInput,
  EventInput,
  EventRecord,
  InterviewConfig,
  InterviewState,
  Me,
  Role,
  DemoSignInContact,
  Page,
  FanApplication,
  FixtureFanInput,
  ActivityEvent,
  InsightsReport,
} from './types'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * One method per backend endpoint. Mutations resolve with no value on purpose:
 * screens refetch the affected resource afterwards, so what staff see as
 * "saved" is always what the backend returned on a fresh read.
 */
export interface ApiClient {
  requestMagicLink(input: { email: string; callbackURL: string; errorCallbackURL: string }): Promise<void>
  signOut(role: Role): Promise<void>
  signInFixture(role: Role, contact: DemoSignInContact): Promise<void>
  signUpFixtureFan(input: FixtureFanInput): Promise<void>
  getFanMe(): Promise<Me>
  updateFanProfile(input: { displayName: string; phone: string }): Promise<void>
  /** Fixture-only persona configuration; live mode must not implement fake auth. */
  setFixtureFan(input: FixtureFanInput): Promise<void>
  listFanEvents(): Promise<EventRecord[]>
  getFanEvent(id: string): Promise<EventRecord>
  listMyApplications(): Promise<FanApplication[]>
  getMyApplication(id: string): Promise<FanApplication>
  createFanApplication(eventId: string, consent: boolean): Promise<{ id: string }>
  requestFanCall(id: string): Promise<void>
  acceptFanInvitation(id: string): Promise<void>
  listMyActivity(): Promise<ActivityEvent[]>
  /** Fixture-only lifecycle controls; no real AI result is represented. */
  simulateFanCall(id: string, outcome: 'missed' | 'completed'): Promise<void>
  /** GET /me */
  getMe(): Promise<Me>
  /** CONFIRM (Jason): GET /admin/events — not in the documented endpoint list. */
  listAdminEvents(): Promise<EventRecord[]>
  /** CONFIRM (Jason): GET /admin/events/:id — not in the documented endpoint list. */
  getAdminEvent(id: string): Promise<EventRecord>
  /** POST /admin/events */
  createEvent(input: EventInput): Promise<EventRecord>
  /** PATCH /admin/events/:id */
  updateEvent(id: string, input: EventInput): Promise<void>
  /** GET /admin/events/:id/interview */
  getInterview(eventId: string): Promise<InterviewState>
  /** PUT /admin/events/:id/interview-draft */
  saveInterviewDraft(eventId: string, config: InterviewConfig): Promise<void>
  /** POST /admin/events/:id/interview-publish */
  publishInterview(eventId: string): Promise<void>
  /** GET /admin/applications */
  listApplications(query: ApplicationListQuery): Promise<Page<ApplicationListItem>>
  /** GET /admin/applications/:id */
  getApplication(id: string): Promise<ApplicationDetail>
  /** POST /admin/applications/:id/decision */
  postDecision(id: string, input: DecisionInput): Promise<void>
  /** POST /admin/applications/:id/attendance */
  recordAttendance(id: string): Promise<void>
  /** GET /admin/events/:id/analytics */
  getAnalytics(eventId: string): Promise<Analytics>
  /** CONFIRM (Jason): GET /admin/insights — turnout, returning fans and interview patterns across all events. */
  getInsights(): Promise<InsightsReport>
}
