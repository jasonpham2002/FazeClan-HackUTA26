import { configsEqual, normalizeOrder, validateConfig, defaultInterviewConfig } from '../../lib/interviewConfig'
import { ApiError, type ApiClient } from '../client'
import type {
  Analytics,
  ApplicationDetail,
  ApplicationListItem,
  CapacityContext,
  EventInput,
  InterviewState,
} from '../types'
import { createSeed, type Db, type InterviewEntry, type StoredApplication } from './seed'

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
        if (parsed.schema === 1) return parsed
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
  }

  async function call<T>(kind: 'read' | 'write', run: (db: Db) => T): Promise<T> {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const status = simulatedFailure?.() ?? null
    if (status === 401) throw new ApiError(401, 'UNAUTHENTICATED', 'Simulated: you are not signed in.')
    if (status === 403) throw new ApiError(403, 'FORBIDDEN', 'Simulated: staff access is required.')
    if (status === 500) throw new ApiError(500, 'INTERNAL', 'Simulated: the server failed to handle this request.')
    if (status === 409 && kind === 'write') {
      throw new ApiError(409, 'CONFLICT', 'Simulated: this record changed on the server. Reload and try again.')
    }
    const db = load()
    const result = run(db)
    if (kind === 'write') save(db)
    return structuredClone(result)
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

  return {
    getMe: () => call('read', (db) => db.me),

    listAdminEvents: () => call('read', (db) => db.events),

    getAdminEvent: (id) => call('read', (db) => db.events.find((e) => e.id === id) ?? notFound('Event')),

    createEvent: (input) =>
      call('write', (db) => {
        const problem = validateEventInput(input)
        if (problem) throw new ApiError(422, 'VALIDATION_FAILED', problem)
        const event = { ...input, id: `evt_${now().getTime().toString(36)}` }
        db.events.push(event)
        db.interviews[event.id] = { draft: defaultInterviewConfig(), draftUpdatedAt: null, versions: [] }
        return event
      }),

    updateEvent: (id, input) =>
      call('write', (db) => {
        const index = db.events.findIndex((e) => e.id === id)
        if (index < 0) notFound('Event')
        const problem = validateEventInput(input)
        if (problem) throw new ApiError(422, 'VALIDATION_FAILED', problem)
        db.events[index] = { ...input, id }
        for (const app of db.applications) if (app.event.id === id) app.event.title = input.title
      }),

    getInterview: (eventId) => call('read', (db) => toInterviewState(eventId, interviewOf(db, eventId))),

    saveInterviewDraft: (eventId, config) =>
      call('write', (db) => {
        const entry = interviewOf(db, eventId)
        const issues = validateConfig(config)
        if (issues.length > 0) throw new ApiError(422, 'VALIDATION_FAILED', issues[0].message)
        entry.draft = { ...config, questions: normalizeOrder(config.questions) }
        entry.draftUpdatedAt = now().toISOString()
      }),

    publishInterview: (eventId) =>
      call('write', (db) => {
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
      call('read', (db) => {
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
      call('read', (db): ApplicationDetail => {
        const app = db.applications.find((a) => a.id === id) ?? notFound('Application')
        return { ...app, capacity: capacityOf(db, app.event.id) }
      }),

    postDecision: (id, input) =>
      call('write', (db) => {
        const app = db.applications.find((a) => a.id === id) ?? notFound('Application')
        if (app.status === 'accepted') {
          throw new ApiError(409, 'INVITATION_ALREADY_ACCEPTED', 'The applicant already accepted their invitation.')
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

    getAnalytics: (eventId) =>
      call('read', (db): Analytics => {
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
