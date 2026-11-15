import { describe, expect, it } from 'vitest'
import { eventSuggestions, retentionSuggestions } from '../../lib/insights'
import { createFixtureClient, FIXTURE_DB_KEY, type KeyValueStorage } from './client'
import { createSeed } from './seed'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const now = () => new Date('2026-11-15T12:00:00.000Z')

describe('fixture insights', () => {
  it('reports turnout and returning fans from the sample history', async () => {
    const api = createFixtureClient({ storage: memoryStorage(), delayMs: 0, now })
    const report = await api.getInsights()
    expect(report.includesDemoData).toBe(true)
    expect(report.events.map((item) => item.event.id)).toEqual(['evt_1', 'evt_houston', 'evt_austin'])

    const [current, houston, austin] = report.events
    expect(austin.funnel).toEqual({ applied: 12, interviewed: 11, invited: 10, accepted: 9, attended: 7 })
    expect(houston.funnel).toEqual({ applied: 15, interviewed: 14, invited: 13, accepted: 12, attended: 8 })
    expect(houston.audience.returningFans).toBe(3)
    expect(current.phase).toBe('upcoming')
    expect(current.audience).toEqual({ newFans: 4, returningFans: 4 })

    expect(report.retention).toMatchObject({ fans: 28, repeatFans: 6 })
    expect(report.retention.cohorts.map(({ eventId, attendees, cameBack }) => ({ eventId, attendees, cameBack }))).toEqual([
      { eventId: 'evt_houston', attendees: 8, cameBack: 2 },
      { eventId: 'evt_austin', attendees: 7, cameBack: 4 },
    ])

    expect(eventSuggestions(houston).map((item) => item.id)).toEqual(
      expect.arrayContaining(['evt_houston:show-up', 'evt_houston:question-q_4', 'evt_houston:top-interest']),
    )
    expect(retentionSuggestions(report.retention).map((item) => item.id)).toEqual(['retention:evt_houston'])
  })

  it('counts attendance as soon as staff record it', async () => {
    const api = createFixtureClient({ storage: memoryStorage(), delayMs: 0, now: () => new Date('2027-01-01T00:00:00.000Z') })
    // After Community Night has happened, Alex (accepted) is marked as attended.
    await api.recordAttendance('app_alex')
    const current = (await api.getInsights()).events.find((item) => item.event.id === 'evt_1')!
    expect(current.phase).toBe('past')
    expect(current.funnel.attended).toBe(1)
    expect(current.showUp).toEqual({ numerator: 1, denominator: 1 })
  })

  it('adds the sample history to a store saved before it existed', async () => {
    const storage = memoryStorage()
    const old = createSeed()
    old.events = old.events.filter((event) => event.id === 'evt_1')
    old.applications = old.applications.filter((app) => app.event.id === 'evt_1')
    storage.setItem(FIXTURE_DB_KEY, JSON.stringify(old))
    const api = createFixtureClient({ storage, delayMs: 0, now })
    expect((await api.listAdminEvents()).map((event) => event.id)).toEqual(['evt_1', 'evt_austin', 'evt_houston'])
    expect((await api.getInsights()).retention.cohorts).toHaveLength(2)
  })
})
