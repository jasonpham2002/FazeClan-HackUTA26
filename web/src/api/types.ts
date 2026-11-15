/*
 * Single source of truth for API contracts used by the frontend.
 *
 * Shapes marked "FROM DOCS" are copied from Khoi.md / Jason.md / Johnny.md.
 * Shapes marked "CONFIRM" are proposals nobody has agreed yet; they are listed
 * in web/README.md under "Contracts to confirm". Change them here first.
 *
 * All timestamps are UTC ISO 8601 strings. All IDs are opaque strings.
 */

// ---------- Errors ----------

/** FROM DOCS (Jason.md): { "error": { "code": "...", "message": "..." } } */
export interface ErrorEnvelope {
  error: { code: string; message: string }
}

// ---------- Session ----------

export type Role = 'fan' | 'staff'
export type DemoSignInContact = { kind: 'gmail' | 'phone'; value: string }

/** CONFIRM (Jason): fields returned by GET /me. */
export interface Me {
  id: string
  email: string
  displayName: string | null
  role: Role
  phone?: string | null
}

/** Fan-safe response; deliberately excludes staff reasons, transcripts and review notes. */
export interface FanApplication {
  id: string
  userId: string
  event: EventRecord
  profile: Me
  status: ApplicationStatus
  submittedAt: string
  call: CallAttempt | null
  interviewVersion: PublishedVersionMeta
  invitation: { expiresAt: string | null; capacityAvailable: boolean } | null
}

export interface FixtureFanInput { displayName: string; email: string; phone: string }

// ---------- Events ----------

export type PublicationStatus = 'draft' | 'published'

/** CONFIRM (Jason): field names; `timezone` is not in Jason's events table yet. */
export interface EventInput {
  title: string
  description: string
  location: string
  startsAt: string
  /** IANA timezone the event is displayed in, e.g. "America/Chicago". */
  timezone: string
  capacity: number
  applicationDeadline: string
  publicationStatus: PublicationStatus
}

export interface EventRecord extends EventInput {
  id: string
}

// ---------- Interview configuration ----------

/** FROM DOCS (Khoi.md / Jason.md / Johnny.md). */
export interface Question {
  id: string
  prompt: string
  purpose: string
  required: boolean
  order: number
  maxFollowUps: number
}

/** FROM DOCS (Khoi.md / Jason.md / Johnny.md). */
export interface InterviewConfig {
  intro: string
  tone: string
  maxDurationSeconds: number
  questions: Question[]
}

export interface PublishedVersionMeta {
  versionId: string
  versionNumber: number
  publishedAt: string
}

/** CONFIRM (Jason): response of GET /admin/events/:id/interview. */
export interface InterviewState {
  eventId: string
  draft: InterviewConfig
  draftUpdatedAt: string | null
  /** null when no version has ever been published. */
  published: PublishedVersionMeta | null
  /** true when the saved draft differs from the published version. */
  hasUnpublishedChanges: boolean
}

// ---------- Statuses ----------

/** FROM DOCS (Jason.md). */
export type ApplicationStatus =
  | 'submitted'
  | 'interview_pending'
  | 'review_pending'
  | 'invited'
  | 'waitlisted'
  | 'accepted'

/** FROM DOCS (Jason.md). */
export type CallStatus =
  | 'queued'
  | 'dialing'
  | 'connected'
  | 'completed'
  | 'missed'
  | 'failed'
  | 'canceled'

/** CONFIRM (Jason/Johnny): docs say processing is separate from call outcome but give no values. */
export type ProcessingStatus = 'pending' | 'ready' | 'failed'

/** FROM DOCS (Johnny.md). */
export type Completeness = 'answered' | 'partial' | 'skipped' | 'not_asked'

export type Decision = 'invite' | 'waitlist'

// ---------- Interview results (Johnny) ----------

/** FROM DOCS (Johnny.md): speaker values are CONFIRM (Johnny). */
export interface TranscriptSegment {
  id: string
  callAttemptId: string
  sequence: number
  speaker: 'agent' | 'applicant'
  text: string
  timestamp: string
}

/** FROM DOCS (Johnny.md). */
export interface Answer {
  questionId: string
  summary: string
  transcriptSegmentIds: string[]
  completeness: Completeness
}

/** FROM DOCS (Johnny.md). */
export interface InterviewResult {
  schemaVersion: number
  callAttemptId: string
  interviewVersionId: string
  summary: string
  interests: string[]
  answers: Answer[]
  unansweredQuestionIds: string[]
  reviewNotes: string[]
}

// ---------- Applications ----------

export interface PersonRef {
  id: string
  displayName: string | null
  email: string
}

/** CONFIRM (Jason): row shape of GET /admin/applications. */
export interface ApplicationListItem {
  id: string
  applicant: PersonRef
  event: { id: string; title: string }
  submittedAt: string
  status: ApplicationStatus
  latestCallStatus: CallStatus | null
  processingStatus: ProcessingStatus | null
  decision: Decision | null
}

/** CONFIRM (Jason): `callStatus`, `page` and `pageSize` are not in Jason's listed query. */
export interface ApplicationListQuery {
  eventId?: string
  status?: ApplicationStatus
  callStatus?: CallStatus
  search?: string
  page?: number
  pageSize?: number
}

/** CONFIRM (Jason): pagination envelope. */
export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface CallAttempt {
  id: string
  status: CallStatus
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
  failureCode: string | null
  processingStatus: ProcessingStatus | null
}

/** FROM DOCS (Jason.md activity_events): type values are CONFIRM (Jason). */
export interface ActivityEvent {
  id: string
  type: 'application' | 'invitation_accepted' | 'attendance'
  eventId?: string | null
  eventTitle: string | null
  timestamp: string
  source: string
  isDemo: boolean
}

export interface DecisionRecord {
  id: string
  decision: Decision
  reason: string | null
  reviewer: { id: string; displayName: string | null }
  createdAt: string
}

export interface CapacityContext {
  capacity: number
  invited: number
  accepted: number
}

/** CONFIRM (Jason): response of GET /admin/applications/:id. */
export interface ApplicationDetail {
  id: string
  status: ApplicationStatus
  submittedAt: string
  applicant: PersonRef
  event: { id: string; title: string }
  /** The version pinned when the fan applied, never the latest draft. */
  interviewVersion: PublishedVersionMeta & { config: InterviewConfig }
  /** The attempt whose result/transcript is shown; chosen by the backend. */
  selectedAttemptId: string | null
  attempts: CallAttempt[]
  result: InterviewResult | null
  transcript: TranscriptSegment[]
  activity: ActivityEvent[]
  pastApplications: { id: string; eventTitle: string; submittedAt: string; status: ApplicationStatus }[]
  decision: DecisionRecord | null
  decisionHistory: DecisionRecord[]
  capacity: CapacityContext
}

export interface DecisionInput {
  decision: Decision
  reason?: string
}

// ---------- Analytics ----------

/** A rate is sent as its parts so the UI can always state the denominator. */
export interface Rate {
  numerator: number
  denominator: number
}

/** CONFIRM (Jason): field names. Rate definitions are FROM DOCS (Jason.md). */
export interface Analytics {
  eventId: string
  applications: number
  callsAttempted: number
  callsConnected: number
  interviewsCompleted: number
  reviewsPending: number
  invitationsIssued: number
  invitationsAccepted: number
  /** connected attempts / attempted calls */
  connectionRate: Rate
  /** completed interviews / connected calls */
  completionRate: Rate
}
