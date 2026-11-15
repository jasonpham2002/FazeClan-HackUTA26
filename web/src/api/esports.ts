import type { Player, PlayerStats } from './types'

interface Evidence {
  id: string
  url: string
  observedAt: string
  sourceUpdatedAt: string | null
  crawlHint: string
}
interface Profile {
  id: string
  handle: string
  displayName: string
  role: string | null
  rosterStatus: Player['rosterStatus']
  rosterSource: Evidence
}
export type PlayerDto = { checkedAt: string } & (Profile | { profile: Profile })
export interface StatsDto {
  playerId: string
  snapshotId: string
  period: { label: string; startsAt: string | null; endsAt: string | null }
  mapsPlayed: number
  metrics: {
    rating: number | null; ratingDefinition: string; kd: number | null
    adr: number | null; headshotPercent: number | null
  }
  source: Evidence
  observedAt: string
  limitations: string[]
  isDemo: false
}

/** Map the sourced backend records; missing evidence is never replaced with demo data. */
export function playerRecord(row: PlayerDto): Player {
  const profile = 'profile' in row ? row.profile : row
  return {
    id: profile.id, handle: profile.handle, displayName: profile.displayName,
    role: profile.role, rosterStatus: profile.rosterStatus, team: 'FaZe',
    imageUrl: null, imageCredit: null, sourceUrl: profile.rosterSource.url,
    checkedAt: row.checkedAt, isDemo: false,
  }
}
export function playerStats(row: StatsDto): PlayerStats {
  return {
    playerId: row.playerId, snapshotId: row.snapshotId,
    period: { label: row.period.label, start: row.period.startsAt, end: row.period.endsAt },
    mapsPlayed: row.mapsPlayed,
    metrics: {
      rating: { value: row.metrics.rating, definition: row.metrics.ratingDefinition },
      kd: { value: row.metrics.kd },
      adr: { value: row.metrics.adr },
      headshotPercent: { value: row.metrics.headshotPercent, unit: '%' },
    },
    recentMatches: [],
    sources: [{ id: row.source.id, url: row.source.url, retrievedAt: row.source.observedAt }],
    retrievedAt: row.observedAt, sourceUpdatedAt: row.source.sourceUpdatedAt,
    limitations: [...row.limitations, row.source.crawlHint], isDemo: false,
  }
}
