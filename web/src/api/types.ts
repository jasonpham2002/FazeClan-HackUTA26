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
  /** CONFIRM (Jason): points needed before a fan may apply. Absent or 0 means open to everyone. */
  minimumPoints?: number
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

// ---------- Insights ----------

/**
 * CONFIRM (Jason): response of GET /admin/insights. Every count is people
 * (applications), not call attempts. Suggestions are not part of the response;
 * the UI derives them from these numbers (src/lib/insights.ts).
 */
export interface InsightsReport {
  generatedAt: string
  /** True when any counted record is synthetic sample data. */
  includesDemoData: boolean
  /** Newest event first. */
  events: EventInsights[]
  retention: RetentionSummary
}

export interface EventInsights {
  event: { id: string; title: string; startsAt: string; timezone: string; capacity: number }
  /** 'past' once the event's start time has passed. */
  phase: 'upcoming' | 'past'
  funnel: {
    applied: number
    /** Applicants with at least one completed interview call. */
    interviewed: number
    /** Applicants invited at some point, even if later waitlisted. */
    invited: number
    accepted: number
    /** null before the event happens. */
    attended: number | null
  }
  /** Past events only: false when nobody was marked as attended, so turnout is unknown. */
  attendanceRecorded: boolean
  /** applications / capacity */
  demand: Rate
  /** attended / accepted; null until attendance is recorded. */
  showUp: Rate | null
  /** attended / capacity; null until attendance is recorded. */
  fill: Rate | null
  /** Returning = applied to an event that started before this one. */
  audience: { newFans: number; returningFans: number }
  dropOff: {
    noInterview: number
    notInvited: number
    invitedNotAccepted: number
    /** null until attendance is recorded. */
    acceptedNotAttended: number | null
  }
  /** Stated interests from interview results, most mentioned first. */
  interests: { label: string; count: number }[]
  questions: QuestionInsight[]
}

/** Answer completeness per question, over applications that have an interview result. */
export interface QuestionInsight {
  questionId: string
  prompt: string
  answered: number
  partial: number
  skipped: number
  notAsked: number
}

export interface RetentionSummary {
  /** Distinct fans who applied to any event. */
  fans: number
  /** Fans who applied to two or more events. */
  repeatFans: number
  /** Past events that have a later event, newest first. */
  cohorts: RetentionCohort[]
}

export interface RetentionCohort {
  eventId: string
  title: string
  startsAt: string
  /** Fans marked as attended. */
  attendees: number
  /** Of those attendees, how many applied to a later event. */
  cameBack: number
}

export interface Suggestion {
  id: string
  tone: 'ok' | 'info' | 'warn'
  title: string
  detail: string
}

// ---------- FaZe ID: players, stats and matches ----------
// CONFIRM (Johnny): every shape in this block follows the proposal in Minh.md
// (Johnny's data assignment). Missing numbers are null, never 0.

export type RosterStatus = 'active' | 'benched' | 'former' | 'coach'

export interface SourceRef {
  id: string
  label?: string
  url: string
  retrievedAt: string
}

export interface Player {
  id: string
  handle: string
  displayName: string | null
  role: string | null
  rosterStatus: RosterStatus
  team: string
  imageUrl: string | null
  imageCredit: string | null
  sourceUrl: string | null
  /** When the roster entry was last checked by hand. Not a live feed. */
  checkedAt: string
  isDemo: boolean
}

export interface Metric {
  value: number | null
  /** e.g. the source's rating version. */
  definition?: string
  unit?: string
}

export type StatKey = 'rating' | 'kd' | 'adr' | 'headshotPercent'

/** CONFIRM (Johnny): one match's stat line. Optional; the chart and standout view hide without it. */
export interface MatchStatLine {
  matchId: string
  opponent: string
  tournament: string
  playedAt: string
  result: 'win' | 'loss' | null
  score: string | null
  mapsPlayed: number | null
  rating: number | null
  kd: number | null
  adr: number | null
  headshotPercent: number | null
  sourceUrl: string | null
}

export interface PlayerStats {
  playerId: string
  snapshotId: string
  period: { label: string; start: string | null; end: string | null }
  mapsPlayed: number | null
  metrics: Record<StatKey, Metric>
  recentMatches: MatchStatLine[]
  sources: SourceRef[]
  retrievedAt: string
  sourceUpdatedAt?: string | null
  limitations?: string[]
  isDemo: boolean
}

export type MatchStatus = 'upcoming' | 'live' | 'finished' | 'canceled'

export interface EsportsMatch {
  id: string
  tournament: { id: string; name: string }
  stage: string | null
  /** Team names, FaZe first when known. */
  participants: string[]
  startsAt: string
  timezone: string
  status: MatchStatus
  /** Externally reported; separate from a staff-confirmed prediction settlement. */
  result: { winner: string; score: string | null } | null
  sourceUrl: string | null
  refreshedAt: string
  isDemo: boolean
}

export interface TournamentProgress {
  id: string
  name: string
  stage: string | null
  standing: string | null
  sourceUrl: string | null
  refreshedAt: string
  isDemo: boolean
}

export interface PlayerSchedule {
  matches: EsportsMatch[]
  tournaments: TournamentProgress[]
}

// ---------- FaZe ID: highlights and AI analysis ----------
// CONFIRM (Minh): shapes follow Johnny.md (Minh's integration assignment).

export interface HighlightVideo {
  videoId: string
  title: string
  channelTitle: string
  publishedAt: string
  thumbnailUrl: string | null
  watchUrl: string
  /** CONFIRM (Minh): optional verified moment to start playback at. */
  startSeconds?: number | null
  source: string
}

export interface Highlights {
  playerId: string
  fetchedAt: string | null
  items: HighlightVideo[]
  isDemo?: boolean
}

export interface PlayerInsight {
  playerId: string
  snapshotId: string
  generatedAt: string | null
  status: 'ready' | 'pending' | 'unavailable'
  summary: string
  observations: { text: string; metricRefs: string[]; sourceIds: string[] }[]
  limitations: string[]
  isDemo?: boolean
}

// ---------- FaZe ID: follows, predictions, points and rewards ----------
// CONFIRM (Jason): shapes follow the tables in Jason.md.

export type MarketType = 'match_winner' | 'placement'
export type MarketState = 'open' | 'locked' | 'settled' | 'void'

export interface PredictionMarket {
  id: string
  type: MarketType
  title: string
  matchId: string | null
  tournamentId: string | null
  options: { id: string; label: string }[]
  /** Server time decides locking; a client countdown is informational only. */
  locksAt: string
  /** Fixed points for a correct pick. Entry is free. */
  award: number
  state: MarketState
  myPick: { optionId: string; submittedAt: string } | null
  result: { optionId: string; sourceUrl: string; settledAt: string } | null
  /** True once this fan's winning points for the market are on the ledger. */
  redeemed?: boolean
  isDemo?: boolean
}

export interface AdminMarket extends PredictionMarket {
  pickCount: number
  picksByOption: Record<string, number>
}

export interface MarketInput {
  type: MarketType
  title: string
  matchId: string | null
  tournamentId: string | null
  options: string[]
  locksAt: string
  award: number
}

export type PointSource = 'prediction' | 'attendance' | 'redemption' | 'adjustment' | 'content_claim'

export interface PointTransaction {
  id: string
  delta: number
  reason: string
  sourceType: PointSource
  createdAt: string
}

/** Balance and entries come only from the backend ledger. */
export interface PointsSummary {
  balance: number
  entries: PointTransaction[]
}

export type RewardKind = 'merch' | 'raffle' | 'early_access' | 'priority'

export interface RewardInput {
  title: string
  /** Short line shown above the gift name. Empty uses the title. */
  headline?: string
  /** https link or an uploaded /rewards/images path. */
  imageUrl?: string | null
  description: string
  kind: RewardKind
  cost: number
  /** null means not stock-limited. */
  stock: number | null
  active: boolean
  terms: string
}

export interface Reward extends RewardInput {
  id: string
  isDemo: boolean
}

export interface Redemption {
  id: string
  rewardId: string
  rewardTitle: string
  cost: number
  status: 'requested' | 'fulfilled' | 'canceled'
  createdAt: string
  /** Staff views only. */
  fan?: PersonRef
}
