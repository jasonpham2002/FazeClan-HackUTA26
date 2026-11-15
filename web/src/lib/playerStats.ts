import type { MatchStatLine, StatKey } from '../api/types'

export interface Observation {
  line: MatchStatLine
  value: number
}

/** A chart needs at least this many comparable observations; one aggregate is not a trend. */
export const MIN_CHART_POINTS = 2

/** The matches that have a real value for this metric, oldest first. Missing values are left out, not drawn as zero. */
export function observations(lines: MatchStatLine[], key: StatKey): Observation[] {
  return lines
    .filter((line): line is MatchStatLine & Record<StatKey, number | null> => typeof line[key] === 'number' && Number.isFinite(line[key]))
    .map(line => ({ line, value: line[key] as number }))
    .sort((a, b) => a.line.playedAt.localeCompare(b.line.playedAt))
}

export function canChart(lines: MatchStatLine[], key: StatKey): boolean {
  return observations(lines, key).length >= MIN_CHART_POINTS
}

/** The match with the highest value for this metric, or null when there is nothing to compare. */
export function standoutMatch(lines: MatchStatLine[], key: StatKey): MatchStatLine | null {
  const points = observations(lines, key)
  if (points.length < MIN_CHART_POINTS) return null
  return points.reduce((best, point) => (point.value > best.value ? point : best)).line
}

/** Maps observations onto an SVG box; equal values sit on the middle line. */
export function plot(points: Observation[], width: number, height: number, pad: number) {
  const values = points.map(point => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0
  const y = (value: number) => (span === 0 ? height / 2 : height - pad - ((value - min) / span) * (height - pad * 2))
  return {
    min, max, y,
    coords: points.map((point, index) => ({ ...point, x: pad + stepX * index, y: y(point.value) })),
  }
}
