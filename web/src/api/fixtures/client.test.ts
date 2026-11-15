import { describe, expect, it } from 'vitest'
import { ApiError } from '../client'
import { createFixtureClient, type KeyValueStorage } from './client'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function setup(failure: { status: number | null } = { status: null }) {
  const storage = memoryStorage()
  const make = () => createFixtureClient({ storage, delayMs: 0, simulatedFailure: () => failure.status })
  return { api: make(), reopen: make, failure }
}

describe('fixture API', () => {
  it('publishes a new immutable version and leaves existing applications pinned', async () => {
    const { api } = setup()
    const before = await api.getInterview('evt_1')
    expect(before.published?.versionNumber).toBe(1)
    expect(before.hasUnpublishedChanges).toBe(false)

    const edited = {
      ...before.draft,
      questions: before.draft.questions.map((q) => (q.id === 'q_1' ? { ...q, prompt: 'A brand new first question?' } : q)),
    }
    await api.saveInterviewDraft('evt_1', edited)

    const saved = await api.getInterview('evt_1')
    expect(saved.published?.versionNumber).toBe(1)
    expect(saved.hasUnpublishedChanges).toBe(true)

    await api.publishInterview('evt_1')
    const published = await api.getInterview('evt_1')
    expect(published.published?.versionNumber).toBe(2)
    expect(published.hasUnpublishedChanges).toBe(false)

    const app = await api.getApplication('app_maya')
    expect(app.interviewVersion.versionNumber).toBe(1)
    expect(app.interviewVersion.config.questions[0].prompt).toBe('What FaZe content have you enjoyed recently?')
  })

  it('refuses to publish an unchanged draft and to save an invalid one', async () => {
    const { api } = setup()
    await expect(api.publishInterview('evt_1')).rejects.toMatchObject({ status: 409 })
    const { draft } = await api.getInterview('evt_1')
    await expect(api.saveInterviewDraft('evt_1', { ...draft, questions: [] })).rejects.toMatchObject({ status: 422 })
    expect((await api.getInterview('evt_1')).draft.questions).toHaveLength(4)
  })

  it('persists a decision, keeps history, and updates aggregates', async () => {
    const { api, reopen } = setup()
    const before = await api.getAnalytics('evt_1')

    await api.postDecision('app_maya', { decision: 'invite', reason: 'Great answers' })
    await api.postDecision('app_maya', { decision: 'waitlist' })
    await api.postDecision('app_devon', { decision: 'invite' })

    // A new client over the same storage stands in for a page refresh.
    const fresh = reopen()
    const maya = await fresh.getApplication('app_maya')
    expect(maya.status).toBe('waitlisted')
    expect(maya.decision?.decision).toBe('waitlist')
    expect(maya.decisionHistory.map((d) => d.decision)).toEqual(['invite', 'waitlist'])
    expect(maya.decisionHistory[0].reason).toBe('Great answers')

    const after = await fresh.getAnalytics('evt_1')
    expect(after.invitationsIssued).toBe(before.invitationsIssued + 1)
    expect(after.reviewsPending).toBe(before.reviewsPending - 2)
    expect(maya.capacity.invited).toBe(after.invitationsIssued)
  })

  it('does not change a decision after the invitation was accepted', async () => {
    const { api } = setup()
    await expect(api.postDecision('app_alex', { decision: 'waitlist' })).rejects.toMatchObject({ status: 409 })
    expect((await api.getApplication('app_alex')).status).toBe('accepted')
  })

  it('never saves when a failure is simulated', async () => {
    const { api, failure } = setup()
    failure.status = 500
    await expect(api.postDecision('app_maya', { decision: 'invite' })).rejects.toBeInstanceOf(ApiError)
    failure.status = 409
    await expect(api.postDecision('app_maya', { decision: 'invite' })).rejects.toMatchObject({ status: 409 })
    failure.status = null
    expect((await api.getApplication('app_maya')).decision).toBeNull()
  })

  it('filters and paginates the application list', async () => {
    const { api } = setup()
    const all = await api.listApplications({ eventId: 'evt_1', pageSize: 3 })
    expect(all.total).toBe(8)
    expect(all.items).toHaveLength(3)
    const pending = await api.listApplications({ eventId: 'evt_1', status: 'review_pending' })
    expect(pending.items.map((i) => i.id).sort()).toEqual(['app_devon', 'app_maya', 'app_priya'])
    const missed = await api.listApplications({ callStatus: 'missed' })
    expect(missed.items.map((i) => i.id)).toEqual(['app_luis'])
    expect((await api.listApplications({ search: 'PRIYA' })).total).toBe(1)
  })

  it('seeds every answer with evidence that exists in the transcript', async () => {
    const { api } = setup()
    const maya = await api.getApplication('app_maya')
    const ids = new Set(maya.transcript.map((s) => s.id))
    for (const answer of maya.result!.answers) {
      expect(answer.transcriptSegmentIds.length).toBeGreaterThan(0)
      for (const id of answer.transcriptSegmentIds) expect(ids.has(id)).toBe(true)
    }
    const priya = await api.getApplication('app_priya')
    expect(priya.result).toBeNull()
    expect(priya.transcript.length).toBeGreaterThan(0)
  })

  it('reports zero-denominator rates as parts, not percentages', async () => {
    const { api } = setup()
    const event = await api.createEvent({
      title: 'Empty event',
      description: '',
      location: 'Somewhere',
      startsAt: '2027-01-10T00:00:00.000Z',
      timezone: 'UTC',
      capacity: 10,
      applicationDeadline: '2027-01-01T00:00:00.000Z',
      publicationStatus: 'draft',
    })
    const analytics = await api.getAnalytics(event.id)
    expect(analytics.connectionRate).toEqual({ numerator: 0, denominator: 0 })
    const interview = await api.getInterview(event.id)
    expect(interview.published).toBeNull()
    expect(interview.hasUnpublishedChanges).toBe(true)
  })

  it('lists a staff-created event for fans after the event is published', async () => {
    const { api, reopen } = setup()
    const { id: sourceId, ...details } = await api.getAdminEvent('evt_1')
    const event = await api.createEvent({ ...details, title: 'New fan event', publicationStatus: 'draft' })
    const fan = reopen()
    expect((await fan.listFanEvents()).map(({ id }) => id)).not.toContain(event.id)
    expect(event.id).not.toBe(sourceId)

    await api.updateEvent(event.id, { ...details, title: event.title, publicationStatus: 'published' })
    expect(await fan.listFanEvents()).toContainEqual(expect.objectContaining({ id: event.id, title: event.title }))
    expect(await fan.getFanEvent(event.id)).toMatchObject({ id: event.id, publicationStatus: 'published' })
    expect((await api.getInterview(event.id)).published?.versionNumber).toBe(1)
  })

  it('records attendance only for accepted applications', async () => {
    const { api, reopen } = setup()
    await expect(api.recordAttendance('app_maya')).rejects.toMatchObject({ status: 409 })
    await api.recordAttendance('app_alex')
    const updated = await reopen().getApplication('app_alex')
    expect(updated.activity.some((item) => item.type === 'attendance' && item.eventId === updated.event.id)).toBe(true)
  })
})
