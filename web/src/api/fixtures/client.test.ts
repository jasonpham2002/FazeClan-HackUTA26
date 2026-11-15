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
  it('signs fan and staff out independently while preserving demo records', async () => {
    const { api, reopen } = setup()
    const fan = await api.getFanMe()
    const staff = await api.getMe()
    const events = await api.listAdminEvents()

    await api.signOut('fan')
    const anotherTab = reopen()
    await expect(anotherTab.getFanMe()).rejects.toMatchObject({ status: 401 })
    await expect(anotherTab.listMyApplications()).rejects.toMatchObject({ status: 401 })
    expect(await anotherTab.getMe()).toEqual(staff)
    expect(await anotherTab.listFanEvents()).not.toHaveLength(0)

    await anotherTab.signOut('staff')
    await expect(api.listAdminEvents()).rejects.toMatchObject({ status: 401 })
    await expect(api.getApplication('app_maya')).rejects.toMatchObject({ status: 401 })
    await api.signInFixture('fan', { kind: 'gmail', value: fan.email.toUpperCase() })
    expect(await anotherTab.getFanMe()).toEqual(fan)
    await expect(anotherTab.getMe()).rejects.toMatchObject({ status: 401 })

    await api.signInFixture('staff', { kind: 'phone', value: '(202) 555-0124' })
    expect(await anotherTab.getMe()).toEqual(staff)
    expect(await anotherTab.listAdminEvents()).toEqual(events)
  })

  it('rejects valid but unregistered contacts and contacts from the wrong role', async () => {
    const { api } = setup()
    const fan = await api.getFanMe()
    const staff = await api.getMe()
    await api.signOut('fan')
    await api.signOut('staff')
    await expect(api.signInFixture('fan', { kind: 'phone', value: '123' })).rejects.toMatchObject({ status: 422 })
    await expect(api.signInFixture('fan', { kind: 'gmail', value: 'fan@example.test' })).rejects.toMatchObject({ status: 422 })
    await expect(api.signInFixture('fan', { kind: 'phone', value: '+44 7700 900123' })).rejects.toMatchObject({ code: 'DEMO_ACCOUNT_NOT_FOUND' })
    await expect(api.signInFixture('fan', { kind: 'gmail', value: staff.email })).rejects.toMatchObject({ code: 'DEMO_ACCOUNT_NOT_FOUND' })
    await expect(api.signInFixture('staff', { kind: 'gmail', value: fan.email })).rejects.toMatchObject({ code: 'DEMO_ACCOUNT_NOT_FOUND' })
    await expect(api.getFanMe()).rejects.toMatchObject({ status: 401 })
    await expect(api.getMe()).rejects.toMatchObject({ status: 401 })
    await api.signInFixture('staff', { kind: 'gmail', value: staff.email })
    expect(await api.getMe()).toEqual(staff)
  })

  it('keeps the signed-up fan profile when signing back in with one contact field', async () => {
    const { api } = setup()
    const profile = { displayName: 'Alex Chen', email: 'alex.chen@gmail.com', phone: '+12025550125' }
    await api.signOut('fan')
    await api.signUpFixtureFan(profile)
    expect(await api.getFanMe()).toMatchObject(profile)

    await api.signOut('fan')
    await expect(api.signInFixture('fan', { kind: 'phone', value: '202-555-0123' })).rejects.toMatchObject({ code: 'DEMO_ACCOUNT_NOT_FOUND' })
    await api.signInFixture('fan', { kind: 'phone', value: '202-555-0125' })
    expect(await api.getFanMe()).toMatchObject(profile)
  })

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
  })
})
