import { describe, expect, it } from 'vitest'
import type { MatchStatLine } from '../api/types'
import { canChart, observations, plot, standoutMatch } from './playerStats'

function line(matchId: string, playedAt: string, rating: number | null, adr: number | null = 70): MatchStatLine {
  return {
    matchId, opponent: 'Opponent', tournament: 'Cup', playedAt, result: 'win', score: '2-0', mapsPlayed: 2,
    rating, kd: 1, adr, headshotPercent: null, sourceUrl: null,
  }
}

const lines = [
  line('c', '2026-03-03T00:00:00Z', 1.3),
  line('a', '2026-03-01T00:00:00Z', 1.1),
  line('b', '2026-03-02T00:00:00Z', null),
]

describe('player stat observations', () => {
  it('orders by date and leaves out missing values instead of drawing zero', () => {
    expect(observations(lines, 'rating').map(point => [point.line.matchId, point.value])).toEqual([['a', 1.1], ['c', 1.3]])
  })

  it('needs two comparable values before a chart or standout match is shown', () => {
    expect(canChart(lines, 'rating')).toBe(true)
    expect(canChart(lines, 'headshotPercent')).toBe(false)
    expect(canChart([lines[0]], 'rating')).toBe(false)
    expect(standoutMatch(lines, 'headshotPercent')).toBeNull()
    expect(standoutMatch(lines, 'rating')?.matchId).toBe('c')
  })

  it('plots higher values higher and keeps equal values on one line', () => {
    const { coords } = plot(observations(lines, 'rating'), 100, 50, 10)
    expect(coords[0]).toMatchObject({ x: 10, y: 40 })
    expect(coords[1]).toMatchObject({ x: 90, y: 10 })
    const flat = plot(observations(lines, 'adr'), 100, 50, 10)
    expect(new Set(flat.coords.map(point => point.y))).toEqual(new Set([25]))
  })
})
