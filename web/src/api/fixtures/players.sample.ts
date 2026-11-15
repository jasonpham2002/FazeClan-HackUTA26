/*
 * PLACEHOLDER player data for fixture mode only.
 *
 * Nothing here describes a real person, team result or video. The handles are
 * deliberately generic so that no real FaZe player is shown with made-up
 * numbers. Replace the exports of this one file with Johnny's verified import
 * bundle (roster, stats, matches) and Minh's highlight / insight fixtures; the
 * pages need no other change. Live mode never reads this file.
 */
import type {
  EsportsMatch, Highlights, MatchStatLine, Player, PlayerInsight, PlayerStats, TournamentProgress,
} from '../types'

const CHECKED_AT = '2026-11-14T18:00:00.000Z'
const TOURNAMENT = { id: 'trn_sample', name: 'Sample Invitational' }
const FAZE = 'FaZe Clan'

function player(n: number, role: string, rosterStatus: Player['rosterStatus'] = 'active'): Player {
  return {
    id: `player_sample_${n}`,
    handle: rosterStatus === 'coach' ? 'SAMPLE COACH' : `SAMPLE-0${n}`,
    displayName: rosterStatus === 'coach' ? 'Placeholder coach' : `Placeholder player ${n}`,
    role,
    rosterStatus,
    team: FAZE,
    imageUrl: null,
    imageCredit: null,
    sourceUrl: null,
    checkedAt: CHECKED_AT,
    isDemo: true,
  }
}

export const samplePlayers: Player[] = [
  player(1, 'Rifler'),
  player(2, 'AWPer'),
  player(3, 'Entry fragger'),
  player(4, 'In-game leader'),
  player(5, 'Support'),
  player(6, 'Coach', 'coach'),
]

export const sampleMatches: EsportsMatch[] = [
  ['match_sample_1', 'Group stage', 'Sample Opponent A', '2026-11-06T19:00:00.000Z', 'finished', FAZE, '2-0'],
  ['match_sample_2', 'Group stage', 'Sample Opponent B', '2026-11-08T19:00:00.000Z', 'finished', 'Sample Opponent B', '1-2'],
  ['match_sample_3', 'Group stage', 'Sample Opponent C', '2026-11-10T19:00:00.000Z', 'finished', FAZE, '2-1'],
  ['match_sample_4', 'Quarter-final', 'Sample Opponent D', '2026-11-12T19:00:00.000Z', 'finished', FAZE, '2-0'],
  ['match_sample_5', 'Semi-final', 'Sample Opponent E', '2026-11-14T19:00:00.000Z', 'finished', FAZE, '2-1'],
  ['match_sample_6', 'Final', 'Sample Opponent F', '2026-11-22T19:00:00.000Z', 'upcoming', null, null],
  ['match_sample_7', 'Opening round', 'Sample Opponent G', '2026-12-03T18:00:00.000Z', 'upcoming', null, null],
].map(([id, stage, opponent, startsAt, status, winner, score]) => ({
  id: id as string,
  tournament: id === 'match_sample_7' ? { id: 'trn_sample_2', name: 'Sample Winter Cup' } : TOURNAMENT,
  stage,
  participants: [FAZE, opponent as string],
  startsAt: startsAt as string,
  timezone: 'America/Chicago',
  status: status as EsportsMatch['status'],
  result: winner ? { winner, score } : null,
  sourceUrl: null,
  refreshedAt: CHECKED_AT,
  isDemo: true,
}))

export const sampleTournaments: TournamentProgress[] = [
  { id: 'trn_sample', name: 'Sample Invitational', stage: 'Final', standing: 'Reached the final', sourceUrl: null, refreshedAt: CHECKED_AT, isDemo: true },
  { id: 'trn_sample_2', name: 'Sample Winter Cup', stage: 'Opening round', standing: null, sourceUrl: null, refreshedAt: CHECKED_AT, isDemo: true },
]

/** Per-match placeholder lines: [rating, K/D, ADR, headshot %] for the five finished sample matches. */
const LINES: Record<string, (number | null)[][]> = {
  player_sample_1: [[1.18, 1.31, 84.2, 52.1], [0.94, 0.88, 68.5, 47.3], [1.27, 1.42, 91.0, 55.8], [1.09, 1.12, 77.4, 49.0], [1.33, 1.5, 95.6, 58.2]],
  player_sample_2: [[1.22, 1.45, 79.1, null], [1.01, 1.02, 70.3, null], [0.97, 0.95, 66.8, null], [1.3, 1.61, 86.4, null], [1.12, 1.2, 75.9, null]],
  player_sample_3: [[1.05, 0.98, 82.3, 61.0], [0.89, 0.8, 71.2, 57.4], [1.14, 1.1, 88.7, 63.2], [1.02, 0.96, 79.5, 59.9], [0.96, 0.9, 74.1, 60.3]],
  player_sample_4: [[0.92, 0.85, 65.4, 44.0], [0.88, 0.79, 61.9, 41.5]],
}

function average(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null)
  if (!known.length) return null
  return Math.round((known.reduce((sum, value) => sum + value, 0) / known.length) * 100) / 100
}

function statsFor(playerId: string): PlayerStats | null {
  const lines = LINES[playerId]
  if (!lines) return null
  const finished = sampleMatches.filter(match => match.status === 'finished').slice(-lines.length)
  const recentMatches: MatchStatLine[] = finished.map((match, index) => {
    const [rating, kd, adr, headshotPercent] = lines[index]
    return {
      matchId: match.id,
      opponent: match.participants[1],
      tournament: `${match.tournament.name} · ${match.stage}`,
      playedAt: match.startsAt,
      result: match.result?.winner === FAZE ? 'win' : 'loss',
      score: match.result?.score ?? null,
      mapsPlayed: match.result?.score ? match.result.score.split('-').reduce((sum, part) => sum + Number(part), 0) : null,
      rating, kd, adr, headshotPercent,
      sourceUrl: null,
    }
  })
  const column = (index: number) => average(lines.map(line => line[index]))
  return {
    playerId,
    snapshotId: `snapshot_${playerId}_1`,
    period: { label: 'Sample Invitational', start: finished[0].startsAt, end: finished.at(-1)!.startsAt },
    mapsPlayed: recentMatches.reduce((sum, line) => sum + (line.mapsPlayed ?? 0), 0),
    metrics: {
      rating: { value: column(0), definition: 'Placeholder rating (no real rating version)' },
      kd: { value: column(1) },
      adr: { value: column(2) },
      headshotPercent: { value: column(3), unit: 'percent' },
    },
    recentMatches,
    sources: [],
    retrievedAt: CHECKED_AT,
    isDemo: true,
  }
}

export const sampleStats: Record<string, PlayerStats> = Object.fromEntries(
  Object.keys(LINES).map(id => [id, statsFor(id)!]),
)

export const sampleHighlights: Record<string, Highlights> = {
  player_sample_1: {
    playerId: 'player_sample_1',
    fetchedAt: CHECKED_AT,
    isDemo: true,
    items: [1, 2, 3].map(n => ({
      videoId: '',
      title: `Placeholder highlight ${n}`,
      channelTitle: 'Placeholder channel',
      publishedAt: `2026-11-0${n + 5}T12:00:00.000Z`,
      thumbnailUrl: null,
      watchUrl: '',
      startSeconds: null,
      source: 'sample',
    })),
  },
}

export const sampleInsights: Record<string, PlayerInsight> = {
  snapshot_player_sample_1_1: {
    playerId: 'player_sample_1',
    snapshotId: 'snapshot_player_sample_1_1',
    generatedAt: CHECKED_AT,
    status: 'ready',
    isDemo: true,
    summary: 'Placeholder text, not a real AI result. Minh’s analysis of the stats shown here will replace it.',
    observations: [
      { text: 'Placeholder observation tied to the rating card.', metricRefs: ['metrics.rating'], sourceIds: [] },
      { text: 'Placeholder observation tied to ADR across the five listed matches.', metricRefs: ['metrics.adr'], sourceIds: [] },
    ],
    limitations: ['Only the placeholder tournament window is represented.'],
  },
}
