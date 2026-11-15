import { describe, expect, it } from 'vitest'
import { buildInsights, eventSuggestions, retentionSuggestions, type InsightsApplicationInput, type InsightsSource } from './insights'

const questions = [
  { id: 'q_1', prompt: 'First?' },
  { id: 'q_2', prompt: 'Second?' },
]

function app(userId: string, eventId: string, overrides: Partial<InsightsApplicationInput> = {}): InsightsApplicationInput {
  return {
    userId,
    eventId,
    status: 'accepted',
    interviewed: true,
    everInvited: true,
    attended: false,
    interests: [],
    answers: [
      { questionId: 'q_1', completeness: 'answered' },
      { questionId: 'q_2', completeness: 'answered' },
    ],
    questions,
    isDemo: false,
    ...overrides,
  }
}

const events = [
  { id: 'old', title: 'Old', startsAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC', capacity: 10 },
  { id: 'mid', title: 'Mid', startsAt: '2026-06-01T00:00:00.000Z', timezone: 'UTC', capacity: 4 },
  { id: 'next', title: 'Next', startsAt: '2027-01-01T00:00:00.000Z', timezone: 'UTC', capacity: 50 },
]

function source(applications: InsightsApplicationInput[]): InsightsSource {
  return { now: '2026-11-15T00:00:00.000Z', events, applications }
}

describe('buildInsights', () => {
  const report = buildInsights(
    source([
      app('a', 'old', { attended: true, interests: ['Tournament', 'tournament ', 'Merch'] }),
      app('b', 'old', { attended: true, interests: ['tournament'] }),
      app('c', 'old'), // accepted, no-show
      app('d', 'old', { status: 'waitlisted', everInvited: false }),
      app('e', 'old', { status: 'interview_pending', interviewed: false, everInvited: false, answers: [] }),
      app('a', 'mid', { attended: true }),
      app('a', 'next', { status: 'review_pending', everInvited: false }),
      app('f', 'next', {
        status: 'review_pending',
        everInvited: false,
        answers: [{ questionId: 'q_1', completeness: 'skipped' }],
      }),
    ]),
  )
  const byId = Object.fromEntries(report.events.map((item) => [item.event.id, item]))

  it('orders events newest first and marks past and upcoming', () => {
    expect(report.events.map((item) => item.event.id)).toEqual(['next', 'mid', 'old'])
    expect(byId.old.phase).toBe('past')
    expect(byId.next.phase).toBe('upcoming')
  })

  it('counts the funnel, turnout and drop-off as people', () => {
    expect(byId.old.funnel).toEqual({ applied: 5, interviewed: 4, invited: 3, accepted: 3, attended: 2 })
    expect(byId.old.showUp).toEqual({ numerator: 2, denominator: 3 })
    expect(byId.old.fill).toEqual({ numerator: 2, denominator: 10 })
    expect(byId.old.dropOff).toEqual({ noInterview: 1, notInvited: 1, invitedNotAccepted: 0, acceptedNotAttended: 1 })
  })

  it('leaves turnout empty before the event happens', () => {
    expect(byId.next.funnel.attended).toBeNull()
    expect(byId.next.showUp).toBeNull()
    expect(byId.next.dropOff.acceptedNotAttended).toBeNull()
  })

  it('separates new and returning applicants by earlier events only', () => {
    expect(byId.old.audience).toEqual({ newFans: 5, returningFans: 0 })
    expect(byId.next.audience).toEqual({ newFans: 1, returningFans: 1 })
  })

  it('counts each interest once per fan, ignoring case and spaces', () => {
    expect(byId.old.interests).toEqual([
      { label: 'Tournament', count: 2 },
      { label: 'Merch', count: 1 },
    ])
  })

  it('treats a question missing from a result as not asked', () => {
    const second = byId.next.questions.find((q) => q.questionId === 'q_2')!
    expect(second).toMatchObject({ answered: 1, notAsked: 1 })
    const first = byId.next.questions.find((q) => q.questionId === 'q_1')!
    expect(first).toMatchObject({ answered: 1, skipped: 1 })
    // The applicant with no interview result is not counted at all.
    expect(byId.old.questions[0]).toMatchObject({ answered: 4 })
  })

  it('tracks whether attendees came back to a later event', () => {
    expect(report.retention.cohorts).toEqual([
      { eventId: 'mid', title: 'Mid', startsAt: events[1].startsAt, attendees: 1, cameBack: 1 },
      { eventId: 'old', title: 'Old', startsAt: events[0].startsAt, attendees: 2, cameBack: 1 },
    ])
    expect(report.retention).toMatchObject({ fans: 6, repeatFans: 1 })
    expect(report.includesDemoData).toBe(false)
  })
})

describe('suggestions', () => {
  it('asks for attendance when a past event has none recorded', () => {
    const report = buildInsights(source([app('a', 'old'), app('b', 'old')]))
    const old = report.events.find((item) => item.event.id === 'old')!
    expect(old.attendanceRecorded).toBe(false)
    expect(old.showUp).toBeNull()
    expect(eventSuggestions(old).map((item) => item.id)).toContain('old:record-attendance')
  })

  it('makes no rate-based suggestion from fewer than five fans', () => {
    const report = buildInsights(source([app('a', 'mid'), app('b', 'mid', { attended: true })]))
    const ids = eventSuggestions(report.events.find((item) => item.event.id === 'mid')!).map((item) => item.id)
    expect(ids).not.toContain('mid:show-up')
    expect(ids).not.toContain('mid:demand-high')
  })

  it('flags high demand, low show-up, an often-skipped question and low return', () => {
    const fans = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const report = buildInsights(
      source([
        ...fans.map((id, index) =>
          app(id, 'mid', {
            attended: index < 3,
            answers: [
              { questionId: 'q_1', completeness: index < 3 ? 'skipped' : 'answered' },
              { questionId: 'q_2', completeness: 'answered' },
            ],
          }),
        ),
        app('z', 'next', { status: 'review_pending' }),
      ]),
    )
    const mid = report.events.find((item) => item.event.id === 'mid')!
    const ids = eventSuggestions(mid).map((item) => item.id)
    expect(ids).toEqual(expect.arrayContaining(['mid:demand-high', 'mid:show-up', 'mid:question-q_1']))
    expect(ids).not.toContain('mid:question-q_2')
    // 3 attendees is below the minimum, so no return-rate warning yet.
    expect(retentionSuggestions(report.retention)).toEqual([])
  })
})
