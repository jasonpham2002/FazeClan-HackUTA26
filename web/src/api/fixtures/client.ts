import { configsEqual, normalizeOrder, validateConfig, defaultInterviewConfig } from '../../lib/interviewConfig'
import { ApiError, type ApiClient } from '../client'
import type {
  Analytics,
  ApplicationDetail,
  ApplicationListItem,
  CapacityContext,
  EventInput,
  InterviewState,
  Role,
  FixtureFanInput,
} from '../types'
import { createSeed, DEMO_FAN_CONTACT, DEMO_STAFF_CONTACT, type Db, type InterviewEntry, type StoredApplication } from './seed'
import { eventUnavailable, normalizePhone } from '../../fan/logic'
import type { FanApplication, ActivityEvent } from '../types'

export const FIXTURE_DB_KEY = 'faze-demo-db-v1'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface FixtureOptions {
  storage: KeyValueStorage
  /** Returns an HTTP status to simulate, or null. 409 only affects writes. */
  simulatedFailure?: () => number | null
  delayMs?: number
  now?: () => Date
}

export function validateEventInput(input: EventInput): string | null {
  if (!input.title.trim()) return 'Title is required.'
  if (!input.location.trim()) return 'Location is required.'
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) return 'Capacity must be a positive whole number.'
  const start = Date.parse(input.startsAt)
  const deadline = Date.parse(input.applicationDeadline)
  if (Number.isNaN(start)) return 'Start date and time are required.'
  if (Number.isNaN(deadline)) return 'Application deadline is required.'
  if (deadline > start) return 'The application deadline must be before the event starts.'
  return null
}

/**
 * In-browser stand-in for Jason's API, used only when VITE_DATA_SOURCE=fixtures.
 * It mimics backend rules (immutable published versions, pinned versions,
 * decision history) so the screens can be exercised before the API exists.
 */
export function createFixtureClient(options: FixtureOptions): ApiClient {
  const { storage, simulatedFailure, delayMs = 150, now = () => new Date() } = options

  function load(): Db {
    const raw = storage.getItem(FIXTURE_DB_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Db
        if (parsed.schema === 1) {
          // Upgrade existing staff-only fixture stores without discarding edits.
          parsed.fan ??= createSeed().fan
          // Give older default demo accounts usable sign-in contacts.
          if (parsed.me.email === 'staff@example.com') parsed.me.email = DEMO_STAFF_CONTACT.email
          parsed.me.phone ??= DEMO_STAFF_CONTACT.phone
          if (parsed.fan.email === 'fan@example.com') parsed.fan.email = DEMO_FAN_CONTACT.email
          return parsed
        }
      } catch {
        // Corrupt data: fall through to a fresh seed.
      }
    }
    const seed = createSeed()
    storage.setItem(FIXTURE_DB_KEY, JSON.stringify(seed))
    return seed
  }

  function save(db: Db) {
    storage.setItem(FIXTURE_DB_KEY, JSON.stringify(db))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('faze-fixture-update'))
  }

  async function call<T>(kind: 'read' | 'write', run: (db: Db) => T, role?: Role): Promise<T> {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const status = simulatedFailure?.() ?? null
    if (status === 401) throw new ApiError(401, 'UNAUTHENTICATED', 'Simulated: you are not signed in.')
    if (status === 403) throw new ApiError(403, 'FORBIDDEN', 'Simulated: staff access is required.')
    if (status === 500) throw new ApiError(500, 'INTERNAL', 'Simulated: the server failed to handle this request.')
    if (status === 409 && kind === 'write') {
      throw new ApiError(409, 'CONFLICT', 'Simulated: this record changed on the server. Reload and try again.')
    }
    const db = load()
    if (role && db.signedOut?.[role]) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
    }
    const result = run(db)
    if (kind === 'write') save(db)
    return structuredClone(result)
  }

  function fanCall<T>(kind: 'read' | 'write', run: (db: Db) => T) {
    return call(kind, run, 'fan')
  }

  function staffCall<T>(kind: 'read' | 'write', run: (db: Db) => T) {
    return call(kind, run, 'staff')
  }

  function updateFan(db: Db, input: FixtureFanInput) {
    const phone = normalizePhone(input.phone)
    if (!input.displayName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || !phone) {
      throw new ApiError(422, 'VALIDATION_FAILED', 'Enter a name, email and phone number including its country code.')
    }
    db.fan = { ...db.fan, displayName: input.displayName.trim(), email: input.email.trim(), phone }
  }

  function requireGmail(value: string) {
    const email = value.trim().toLowerCase()
    if (!/^[^\s@]+@gmail\.com$/.test(email)) {
      throw new ApiError(422, 'INVALID_EMAIL', 'Enter a Gmail address ending in @gmail.com.')
    }
    return email
  }

  function notFound(what: string): never {
    throw new ApiError(404, 'NOT_FOUND', `${what} was not found.`)
  }

  function interviewOf(db: Db, eventId: string): InterviewEntry {
    return db.interviews[eventId] ?? notFound('Interview')
  }

  function toInterviewState(eventId: string, entry: InterviewEntry): InterviewState {
    const latest = entry.versions.at(-1) ?? null
    return {
      eventId,
      draft: entry.draft,
      draftUpdatedAt: entry.draftUpdatedAt,
      published: latest
        ? { versionId: latest.versionId, versionNumber: latest.versionNumber, publishedAt: latest.publishedAt }
        : null,
      hasUnpublishedChanges: latest ? !configsEqual(entry.draft, latest.config) : true,
    }
  }

  function capacityOf(db: Db, eventId: string): CapacityContext {
    const apps = db.applications.filter((a) => a.event.id === eventId)
    return {
      capacity: db.events.find((e) => e.id === eventId)?.capacity ?? 0,
      invited: apps.filter((a) => a.status === 'invited' || a.status === 'accepted').length,
      accepted: apps.filter((a) => a.status === 'accepted').length,
    }
  }

  function toListItem(app: StoredApplication): ApplicationListItem {
    const latest = app.attempts.at(-1) ?? null
    const selected = app.attempts.find((a) => a.id === app.selectedAttemptId) ?? latest
    return {
      id: app.id,
      applicant: app.applicant,
      event: app.event,
      submittedAt: app.submittedAt,
      status: app.status,
      latestCallStatus: latest?.status ?? null,
      processingStatus: selected?.processingStatus ?? null,
      decision: app.decision?.decision ?? null,
    }
  }

  function ownApplication(db: Db, id: string): StoredApplication {
    return db.applications.find(app => app.id === id && app.applicant.id === db.fan.id) ?? notFound('Your application')
  }
  function fanView(db: Db, app: StoredApplication): FanApplication {
    const event = db.events.find(event => event.id === app.event.id) ?? notFound('Event')
    const version = app.interviewVersion
    return {
      id: app.id, userId: app.applicant.id, event, profile: { ...db.fan, phone: app.phone || db.fan.phone },
      status: app.status, submittedAt: app.submittedAt, call: app.attempts.at(-1) ?? null,
      interviewVersion: { versionId: version.versionId, versionNumber: version.versionNumber, publishedAt: version.publishedAt },
      invitation: app.status === 'invited' ? { expiresAt: event.startsAt, capacityAvailable: capacityOf(db, event.id).accepted < event.capacity } : null,
    }
  }
  function recordActivity(app: StoredApplication, type: ActivityEvent['type']) {
    app.activity.push({ id: `act_${crypto.randomUUID()}`, type, eventId: app.event.id, eventTitle: app.event.title, timestamp: now().toISOString(), source: 'Shared fixture platform', isDemo: true })
  }

  return {
    requestMagicLink: async () => { throw new ApiError(400, 'LIVE_ONLY', 'Email sign-in is available in live mode.') },
    signOut: role => call('write', db => {
      db.signedOut = { ...db.signedOut, [role]: true }
    }),
    signInFixture: (role, contact) => call('write', db => {
      const account = role === 'staff' ? db.me : db.fan
      const value = contact.value.trim()
      let matches: boolean
      if (contact.kind === 'gmail') {
        matches = requireGmail(value) === account.email.trim().toLowerCase()
      } else {
        const digits = value.replace(/[\s().-]/g, '')
        const phone = normalizePhone(/^\d{10}$/.test(digits) ? `+1${digits}` : value)
        if (!phone) {
          throw new ApiError(422, 'INVALID_PHONE', 'Enter a US phone number or include the country code.')
        }
        matches = phone === account.phone
      }
      if (!matches) {
        throw new ApiError(401, 'DEMO_ACCOUNT_NOT_FOUND', `No demo ${role} account matches those details.`)
      }
      db.signedOut = { ...db.signedOut, [role]: false }
    }),
    signUpFixtureFan: input => call('write', db => {
      updateFan(db, { ...input, email: requireGmail(input.email) })
      db.signedOut = { ...db.signedOut, fan: false }
    }),
    getFanMe: () => fanCall('read', db => db.fan),
    setFixtureFan: input => fanCall('write', db => updateFan(db, input)),
    updateFanProfile: input => fanCall('write', db => updateFan(db, { ...input, email: db.fan.email })),
    listFanEvents: () => call('read', db => db.events.filter(event => event.publicationStatus === 'published')),
    getFanEvent: id => call('read', db => db.events.find(event => event.id === id && event.publicationStatus === 'published') ?? notFound('Event')),
    listMyApplications: () => fanCall('read', db => db.applications.filter(app => app.applicant.id === db.fan.id).sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)).map(app => fanView(db, app))),
    getMyApplication: id => fanCall('read', db => fanView(db, ownApplication(db, id))),
    listMyActivity: () => fanCall('read', db => db.applications.filter(app => app.applicant.id === db.fan.id).flatMap(app => app.activity).sort((a,b) => b.timestamp.localeCompare(a.timestamp))),
    createFanApplication: (eventId, consent) => fanCall('write', db => {
      const event = db.events.find(event => event.id === eventId) ?? notFound('Event')
      const unavailable = eventUnavailable(event, now().getTime())
      if (unavailable) throw new ApiError(409, 'APPLICATIONS_CLOSED', unavailable)
      if (!consent) throw new ApiError(422, 'CONSENT_REQUIRED', 'Agree to the AI interview before applying.')
      if (!db.fan.phone || !normalizePhone(db.fan.phone)) throw new ApiError(422, 'PHONE_REQUIRED', 'Add a phone number including its country code.')
      const duplicate = db.applications.find(app => app.applicant.id === db.fan.id && app.event.id === eventId)
      if (duplicate) throw new ApiError(409, 'ALREADY_APPLIED', 'You already have an application. Open My profile to view it.')
      const version = interviewOf(db, eventId).versions.at(-1)
      if (!version) throw new ApiError(409, 'INTERVIEW_NOT_PUBLISHED', 'The event interview is not ready yet.')
      const id = `app_${crypto.randomUUID()}`
      const app: StoredApplication = {
        id, status: 'interview_pending', submittedAt: now().toISOString(),
        applicant: { id: db.fan.id, displayName: db.fan.displayName, email: db.fan.email },
        phone: db.fan.phone, consentAcceptedAt: now().toISOString(), event: { id: event.id, title: event.title },
        interviewVersion: structuredClone(version), selectedAttemptId: null, attempts: [], result: null,
        transcript: [], activity: [], pastApplications: [], decision: null, decisionHistory: [],
      }
      recordActivity(app, 'application')
      db.applications.push(app)
      return { id }
    }),
    requestFanCall: id => fanCall('write', db => {
      const app = ownApplication(db, id)
      if (!app.consentAcceptedAt) throw new ApiError(422, 'CONSENT_REQUIRED', 'Interview consent is required.')
      if (!['submitted', 'interview_pending'].includes(app.status) || (app.attempts.at(-1) && !['missed', 'failed', 'canceled'].includes(app.attempts.at(-1)!.status))) {
        throw new ApiError(409, 'CALL_NOT_ELIGIBLE', 'A call is active or this application is no longer eligible.')
      }
      app.attempts.push({ id: `call_${crypto.randomUUID()}`, status: 'queued', startedAt: null, endedAt: null, durationSeconds: null, failureCode: null, processingStatus: null })
      app.status = 'interview_pending'
    }),
    simulateFanCall: (id, outcome) => fanCall('write', db => {
      const app = ownApplication(db, id)
      const attempt = app.attempts.at(-1)
      if (!attempt || !['queued', 'dialing', 'connected'].includes(attempt.status) || !['submitted', 'interview_pending'].includes(app.status)) throw new ApiError(409, 'NO_ACTIVE_CALL', 'Request a demo interview first.')
      attempt.status = outcome
      attempt.endedAt = now().toISOString()
      if (outcome === 'missed') { attempt.failureCode = 'demo_missed'; return }
      attempt.startedAt = now().toISOString(); attempt.durationSeconds = 0; attempt.processingStatus = 'ready'
      app.selectedAttemptId = attempt.id
      app.status = 'review_pending'
      app.transcript = app.interviewVersion.config.questions.flatMap((question, index) => [
        { id: `seg_${attempt.id}_${index}_agent`, callAttemptId: attempt.id, sequence: index * 2 + 1, speaker: 'agent' as const, text: question.prompt, timestamp: now().toISOString() },
        { id: `seg_${attempt.id}_${index}_fan`, callAttemptId: attempt.id, sequence: index * 2 + 2, speaker: 'applicant' as const, text: 'Synthetic demo answer: I want to meet other fans and enjoy the community event. No real interview occurred.', timestamp: now().toISOString() },
      ])
      app.result = { schemaVersion: 1, callAttemptId: attempt.id, interviewVersionId: app.interviewVersion.versionId,
        summary: 'Synthetic demo interview. No real call or AI evaluation occurred.', interests: ['demo community event'],
        answers: app.interviewVersion.config.questions.map((question, index) => ({ questionId: question.id, summary: 'Synthetic sample: wants to meet other fans.', transcriptSegmentIds: [`seg_${attempt.id}_${index}_fan`], completeness: 'answered' as const })), unansweredQuestionIds: [], reviewNotes: ['Simulated fixture data only.'],
      }
    }),
    acceptFanInvitation: id => fanCall('write', db => {
      const app = ownApplication(db, id)
      const event = db.events.find(event => event.id === app.event.id) ?? notFound('Event')
      if (app.status !== 'invited') throw new ApiError(409, 'NOT_INVITED', 'There is no active invitation to accept.')
      if (Date.parse(event.startsAt) <= now().getTime()) throw new ApiError(409, 'INVITATION_EXPIRED', 'This invitation has expired.')
      if (capacityOf(db, event.id).accepted >= event.capacity) throw new ApiError(409, 'CAPACITY_FULL', 'All event places have been claimed.')
      app.status = 'accepted'; recordActivity(app, 'invitation_accepted')
    }),
    getMe: () => staffCall('read', (db) => db.me),

    listAdminEvents: () => staffCall('read', (db) => db.events),

    getAdminEvent: (id) => staffCall('read', (db) => db.events.find((e) => e.id === id) ?? notFound('Event')),

    createEvent: (input) =>
      staffCall('write', (db) => {
        const problem = validateEventInput(input)
        if (problem) throw new ApiError(422, 'VALIDATION_FAILED', problem)
        const event = { ...input, id: `evt_${now().getTime().toString(36)}` }
        db.events.push(event)
        const draft = defaultInterviewConfig()
        const versions = input.publicationStatus === 'published'
          ? [{ versionId: `iv_${event.id}_1`, versionNumber: 1, publishedAt: now().toISOString(), config: structuredClone(draft) }]
          : []
        db.interviews[event.id] = { draft, draftUpdatedAt: null, versions }
        return event
      }),

    updateEvent: (id, input) =>
      staffCall('write', (db) => {
        const index = db.events.findIndex((e) => e.id === id)
        if (index < 0) notFound('Event')
        const problem = validateEventInput(input)
        if (problem) throw new ApiError(422, 'VALIDATION_FAILED', problem)
        db.events[index] = { ...input, id }
        for (const app of db.applications) if (app.event.id === id) app.event.title = input.title
        const entry = db.interviews[id]
        if (input.publicationStatus === 'published' && entry && entry.versions.length === 0) {
          entry.versions.push({
            versionId: `iv_${id}_1`,
            versionNumber: 1,
            publishedAt: now().toISOString(),
            config: structuredClone(entry.draft),
          })
        }
      }),

    getInterview: (eventId) => staffCall('read', (db) => toInterviewState(eventId, interviewOf(db, eventId))),

    saveInterviewDraft: (eventId, config) =>
      staffCall('write', (db) => {
        const entry = interviewOf(db, eventId)
        const issues = validateConfig(config)
        if (issues.length > 0) throw new ApiError(422, 'VALIDATION_FAILED', issues[0].message)
        entry.draft = { ...config, questions: normalizeOrder(config.questions) }
        entry.draftUpdatedAt = now().toISOString()
      }),

    publishInterview: (eventId) =>
      staffCall('write', (db) => {
        const entry = interviewOf(db, eventId)
        const issues = validateConfig(entry.draft)
        if (issues.length > 0) throw new ApiError(422, 'VALIDATION_FAILED', issues[0].message)
        const latest = entry.versions.at(-1)
        if (latest && configsEqual(entry.draft, latest.config)) {
          throw new ApiError(409, 'NOTHING_TO_PUBLISH', 'The draft is identical to the published version.')
        }
        const versionNumber = (latest?.versionNumber ?? 0) + 1
        // A new immutable copy: existing applications keep their own pinned copy.
        entry.versions.push({
          versionId: `iv_${eventId}_${versionNumber}`,
          versionNumber,
          publishedAt: now().toISOString(),
          config: structuredClone(entry.draft),
        })
      }),

    listApplications: (query) =>
      staffCall('read', (db) => {
        const search = query.search?.trim().toLowerCase() ?? ''
        const items = db.applications
          .map(toListItem)
          .filter((item) => !query.eventId || item.event.id === query.eventId)
          .filter((item) => !query.status || item.status === query.status)
          .filter((item) => !query.callStatus || item.latestCallStatus === query.callStatus)
          .filter(
            (item) =>
              !search ||
              (item.applicant.displayName ?? '').toLowerCase().includes(search) ||
              item.applicant.email.toLowerCase().includes(search),
          )
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        const pageSize = query.pageSize ?? 10
        const page = Math.max(1, query.page ?? 1)
        return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length }
      }),

    getApplication: (id) =>
      staffCall('read', (db): ApplicationDetail => {
        const app = db.applications.find((a) => a.id === id) ?? notFound('Application')
        return { ...app, capacity: capacityOf(db, app.event.id) }
      }),

    postDecision: (id, input) =>
      staffCall('write', (db) => {
        const app = db.applications.find((a) => a.id === id) ?? notFound('Application')
        if (app.status === 'accepted') {
          throw new ApiError(409, 'INVITATION_ALREADY_ACCEPTED', 'The applicant already accepted their invitation.')
        }
        if (input.decision === 'invite' && app.status !== 'invited' && capacityOf(db, app.event.id).invited >= capacityOf(db, app.event.id).capacity) {
          throw new ApiError(409, 'CAPACITY_FULL', 'Invitations have reached the event capacity.')
        }
        const record = {
          id: `dec_${now().getTime().toString(36)}`,
          decision: input.decision,
          reason: input.reason?.trim() || null,
          reviewer: { id: db.me.id, displayName: db.me.displayName },
          createdAt: now().toISOString(),
        }
        app.decision = record
        app.decisionHistory.push(record)
        app.status = input.decision === 'invite' ? 'invited' : 'waitlisted'
      }),

    recordAttendance: (id) =>
      staffCall('write', (db) => {
        const app = db.applications.find((a) => a.id === id) ?? notFound('Application')
        if (app.status !== 'accepted') {
          throw new ApiError(409, 'ATTENDANCE_UNAVAILABLE', 'Only accepted applicants can be marked as attended.')
        }
        if (!app.activity.some((item) => item.type === 'attendance' && (item.eventId ? item.eventId === app.event.id : item.eventTitle === app.event.title))) {
          recordActivity(app, 'attendance')
        }
      }),

    getAnalytics: (eventId) =>
      staffCall('read', (db): Analytics => {
        if (!db.events.some((e) => e.id === eventId)) notFound('Event')
        const apps = db.applications.filter((a) => a.event.id === eventId)
        const attempts = apps.flatMap((a) => a.attempts)
        const connected = attempts.filter((a) => a.durationSeconds !== null).length
        const completed = attempts.filter((a) => a.status === 'completed').length
        const capacity = capacityOf(db, eventId)
        return {
          eventId,
          applications: apps.length,
          callsAttempted: attempts.length,
          callsConnected: connected,
          interviewsCompleted: completed,
          reviewsPending: apps.filter((a) => a.status === 'review_pending').length,
          invitationsIssued: capacity.invited,
          invitationsAccepted: capacity.accepted,
          connectionRate: { numerator: connected, denominator: attempts.length },
          completionRate: { numerator: completed, denominator: connected },
        }
      }),
  }
}
