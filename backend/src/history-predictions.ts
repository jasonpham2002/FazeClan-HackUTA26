import type { Pool, PoolClient } from 'pg'
import { transaction } from './db.ts'

/** The 3 November FaZe vs Falcons series. Winners can still redeem this one. */
export const CLAIMABLE_MATCH_ID = 'hltv-match-2399994'

/**
 * Finished series and the pick shown for a signed-in fan.
 * A pick that matches the imported winner is correct. The others are losses.
 */
const HISTORY: { matchId: string; pickId: string }[] = [
  { matchId: 'hltv-match-2399857', pickId: 'furia' },
  { matchId: 'hltv-match-2399878', pickId: 'hltv-6667' },
  { matchId: 'hltv-match-2399867', pickId: 'hltv-6667' },
  { matchId: 'hltv-match-2399877', pickId: 'hltv-6667' },
  { matchId: 'hltv-match-2399635', pickId: 'hltv-6667' },
  { matchId: 'hltv-match-2398000', pickId: 'hltv-6667' },
  { matchId: CLAIMABLE_MATCH_ID, pickId: 'falcons' },
]

type StoredMatch = {
  id: string
  title: string
  startsAt: Date
  participants: { id: string; label: string }[]
  result: { winner: string; score: string } | null
  sourceUrl: string
}

async function ensureOn(client: PoolClient, fanId: string | null) {
  const { rows } = await client.query<StoredMatch>(`
    SELECT id, payload->>'title' AS title, starts_at AS "startsAt",
      payload->'participants' AS participants, payload->'result' AS result,
      payload->>'sourceUrl' AS "sourceUrl"
    FROM esports_matches WHERE id = ANY($1::text[])
  `, [HISTORY.map(item => item.matchId)])
  const byId = new Map(rows.map(row => [row.id, row]))
  for (const item of HISTORY) {
    const match = byId.get(item.matchId)
    const winner = match?.participants.find(team => team.label === match.result?.winner)
    if (!match?.result || !winner) continue
    if (!match.participants.some(team => team.id === item.pickId)) continue
    await client.query(`
      INSERT INTO prediction_markets
        (kind, reference_id, team_id, title, options, locks_at, award_points, is_demo, created_by)
      VALUES ('match_winner', $1, NULL, $2, $3::jsonb, $4, 100, false, 'calendar-history')
      ON CONFLICT (reference_id) WHERE kind = 'match_winner' DO NOTHING
    `, [match.id, match.title, JSON.stringify(match.participants), match.startsAt])
    await client.query(`
      INSERT INTO prediction_settlements (market_id, option_id, source_url, reviewer_id)
      SELECT id, $2, $3, 'calendar-history' FROM prediction_markets
      WHERE kind = 'match_winner' AND reference_id = $1
      ON CONFLICT (market_id) DO NOTHING
    `, [match.id, winner.id, match.sourceUrl])
    if (!fanId) continue
    await client.query(`
      INSERT INTO predictions (market_id, user_id, option_id, submitted_at)
      SELECT id, $2, $3, locks_at - interval '1 hour' FROM prediction_markets
      WHERE kind = 'match_winner' AND reference_id = $1
      ON CONFLICT (market_id, user_id) DO NOTHING
    `, [match.id, fanId, item.pickId])
  }
}

/** Create the finished-match markets once, and give this fan the stored picks. */
export async function ensureHistoryPredictions(db: Pool, fanId: string | null) {
  await transaction(db, client => ensureOn(client, fanId))
}
