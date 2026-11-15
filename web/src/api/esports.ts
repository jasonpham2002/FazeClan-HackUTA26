import { portraitFor } from './portraits'
import type { Player, PlayerStats } from './types'

export const fazeStarters = [
  { id: 'hltv-9960', handle: 'frozen', role: 'Rifler' },
  { id: 'hltv-10394', handle: 'Twistzz', role: 'In-game leader' },
  { id: 'hltv-21972', handle: 'Neityu', role: 'Rifler' },
  { id: 'hltv-22383', handle: 'jcobbb', role: 'Rifler' },
  { id: 'hltv-22866', handle: 'JBOEN', role: 'AWPer' },
] as const

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
  // shortcut: November 2026 starter roles cover older imports, drop the fallback once the API supplies them.
  const starter = profile.rosterStatus === 'active' ? fazeStarters.find(player => player.id === profile.id) : undefined
  return {
    id: profile.id, handle: profile.handle, displayName: profile.displayName,
    role: profile.role ?? starter?.role ?? null, rosterStatus: profile.rosterStatus, team: 'FaZe',
    imageUrl: portraitFor(profile.handle)?.url ?? null, imageCredit: portraitFor(profile.handle)?.credit ?? null, sourceUrl: profile.rosterSource.url,
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
