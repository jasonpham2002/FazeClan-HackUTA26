import { describe, expect, it } from 'vitest'
import { createFixtureClient, FIXTURE_DB_KEY, type KeyValueStorage } from './client'
import type { ApiClient } from '../client'

function setup() {
  const values = new Map<string,string>()
  const storage: KeyValueStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => { values.set(key,value) }, removeItem: key => { values.delete(key) } }
  const failure = { status: null as number | null }
  const make = () => createFixtureClient({ storage, delayMs: 0, now: () => new Date('2026-11-14T18:00:00Z'), simulatedFailure: () => failure.status })
  return { api: make(), reopen: make, storage, failure }
}
async function apply(api: ApiClient) { return (await api.createFanApplication('evt_1', true)).id }

describe('connected fan and staff fixture store', () => {
  it('runs application → interview → staff invitation → fan acceptance across independent clients', async () => {
    const { api: fan, reopen } = setup()
    const staff = reopen()
    const before = await staff.getAnalytics('evt_1')
    const id = await apply(fan)
    expect((await staff.listApplications({ search: (await fan.getFanMe()).email })).items.map(item => item.id)).toContain(id)
    await fan.requestFanCall(id)
    await fan.simulateFanCall(id, 'completed')
    const review = await staff.getApplication(id)
    expect(review.status).toBe('review_pending')
    expect(review.result?.summary).toContain('Synthetic demo')
    expect(review.result?.answers).toHaveLength(review.interviewVersion.config.questions.length)
    const segmentIds = new Set(review.transcript.map(segment => segment.id))
    for (const answer of review.result!.answers) for (const segment of answer.transcriptSegmentIds) expect(segmentIds.has(segment)).toBe(true)
    await staff.postDecision(id, { decision: 'invite', reason: 'Private staff-only note' })
    const fanView = await fan.getMyApplication(id)
    expect(fanView.status).toBe('invited')
    expect(JSON.stringify(fanView)).not.toContain('Private staff-only note')
    expect(Object.keys(fanView)).not.toContain('transcript')
    await fan.acceptFanInvitation(id)
    expect((await reopen().getApplication(id)).status).toBe('accepted')
    expect((await staff.getAnalytics('evt_1')).invitationsAccepted).toBe(before.invitationsAccepted + 1)
    const activity = await fan.listMyActivity()
    expect(activity.some(item => item.type === 'invitation_accepted')).toBe(true)
    expect(activity.every(item => item.type !== 'attendance' && item.isDemo)).toBe(true)
  })

  it('fans only see their own records; new fans have no seeded attendance', async () => {
    const { api } = setup()
    expect(await api.listMyApplications()).toEqual([])
    expect(await api.listMyActivity()).toEqual([])
    await expect(api.getMyApplication('app_maya')).rejects.toMatchObject({ status: 404 })
    await expect(api.acceptFanInvitation('app_jordan')).rejects.toMatchObject({ status: 404 })
  })

  it('uses the current profile phone for interviews on existing applications', async () => {
    const { api, reopen } = setup()
    const id = await apply(api)
    await api.setFixtureFan({ displayName: 'Demo Tester', email: 'tester@gmail.com', phone: '202-555-0198' })

    expect((await reopen().getMyApplication(id)).profile.phone).toBe('+12025550198')
  })

  it('lets separate fan accounts apply for Dallas and keeps their applications separate', async () => {
    const { api, reopen } = setup()
    const first = { displayName: 'First Fan', email: 'first.fan@gmail.com', phone: '202-555-0198' }
    const second = { displayName: 'Second Fan', email: 'second.fan@gmail.com', phone: '202-555-0199' }
    await api.signUpFixtureFan(first)
    const firstApplication = await apply(api)
    await api.signOut('fan')
    await api.signUpFixtureFan(second)

    const fan = reopen()
    expect(await fan.listMyApplications()).toEqual([])
    await expect(fan.getMyApplication(firstApplication)).rejects.toMatchObject({ status: 404 })
    const secondApplication = await apply(fan)
    await fan.signInFixture('fan', { kind: 'phone', value: first.phone })
    expect((await fan.listMyApplications()).map(app => app.id)).toEqual([firstApplication])
    await fan.signInFixture('fan', { kind: 'gmail', value: second.email })
    expect((await fan.listMyApplications()).map(app => app.id)).toEqual([secondApplication])
    await expect(fan.signUpFixtureFan(first)).rejects.toMatchObject({ code: 'FAN_ACCOUNT_EXISTS' })
  })

  it('separates applications left by previous users of the shared demo profile', async () => {
    const { api, storage, reopen } = setup()
    const demo = await api.getFanMe()
    const id = await apply(api)
    const db = JSON.parse(storage.getItem(FIXTURE_DB_KEY)!)
    delete db.otherFans
    db.fan.email = 'new.fan@gmail.com'
    db.fan.phone = '+12025550198'
    storage.setItem(FIXTURE_DB_KEY, JSON.stringify(db))

    const fan = reopen()
    expect(await fan.listMyApplications()).toEqual([])
    expect((await fan.getApplication(id)).id).toBe(id)
    await fan.signInFixture('fan', { kind: 'gmail', value: demo.email })
    expect((await fan.listMyApplications()).map(app => app.id)).toEqual([id])
  })

  it('requires consent, prevents duplicate applications/calls, and permits missed-call retry', async () => {
    const { api } = setup()
    await expect(api.createFanApplication('evt_1', false)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    const id = await apply(api)
    await expect(apply(api)).rejects.toMatchObject({ status: 409 })
    await api.requestFanCall(id)
    await expect(api.requestFanCall(id)).rejects.toMatchObject({ status: 409 })
    await api.simulateFanCall(id, 'missed')
    await api.requestFanCall(id)
    await api.simulateFanCall(id, 'completed')
    await expect(api.requestFanCall(id)).rejects.toMatchObject({ status: 409 })
    expect((await api.getApplication(id)).attempts).toHaveLength(2)
  })

  it('pins published question versions and shows staff edits to future fan applications', async () => {
    const { api } = setup()
    const first = await api.getInterview('evt_1')
    await api.saveInterviewDraft('evt_1', { ...first.draft, questions: first.draft.questions.map((q,i) => i ? q : { ...q, prompt: 'New question for the next fan?' }) })
    await api.publishInterview('evt_1')
    const id = await apply(api)
    expect((await api.getApplication(id)).interviewVersion.versionNumber).toBe(2)
    await api.saveInterviewDraft('evt_1', first.draft)
    await api.publishInterview('evt_1')
    await api.requestFanCall(id)
    await api.simulateFanCall(id, 'completed')
    const pinned = await api.getApplication(id)
    expect(pinned.interviewVersion.versionNumber).toBe(2)
    expect(pinned.transcript[0].text).toBe('New question for the next fan?')
  })

  it('preserves saved staff data while upgrading an older fixture store without a fan persona', async () => {
    const { api, storage, reopen } = setup()
    await api.postDecision('app_maya', { decision: 'waitlist', reason: 'Keep this edit' })
    const db = JSON.parse(storage.getItem(FIXTURE_DB_KEY)!)
    delete db.fan
    storage.setItem(FIXTURE_DB_KEY, JSON.stringify(db))
    expect((await reopen().getFanMe()).id).toBe('fan_demo')
    expect((await reopen().getApplication('app_maya')).decision?.reason).toBe('Keep this edit')
  })

  it('does not save failed requests and rejects invitations past capacity or after acceptance', async () => {
    const { api, failure } = setup()
    failure.status = 500
    await expect(apply(api)).rejects.toMatchObject({ status: 500 })
    failure.status = null
    expect(await api.listMyApplications()).toEqual([])
    const id = await apply(api)
    const event = await api.getAdminEvent('evt_1')
    await api.updateEvent('evt_1', { ...event, capacity: 2 })
    await expect(api.postDecision(id, { decision: 'invite' })).rejects.toMatchObject({ code: 'CAPACITY_FULL' })
    await api.updateEvent('evt_1', { ...event, capacity: 40 })
    await api.postDecision(id, { decision: 'invite' })
    await api.acceptFanInvitation(id)
    await expect(api.acceptFanInvitation(id)).rejects.toMatchObject({ status: 409 })
    await expect(api.postDecision(id, { decision: 'waitlist' })).rejects.toMatchObject({ status: 409 })
  })
})
