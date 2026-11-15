/*
 * Fixture stand-in for the FaZe ID endpoints (Johnny: players and matches;
 * Minh: highlights and insights; Jason: follows, predictions, points, rewards).
 * It mirrors the rules in Jason.md so the journey can be exercised before the
 * backend exists: server-side locking, one pick per market, settlement that
 * awards exactly once, and redemption that checks balance and stock together.
 */
import { defaultInterviewConfig } from '../../lib/interviewConfig'
import { ApiError, type ApiClient } from '../client'
import type {
  AdminMarket, MarketInput, MarketState, PointSource, PointTransaction, PredictionMarket, Redemption,
  Reward, RewardInput, Role,
} from '../types'
import {
  rosterPlayers, sampleHighlights, sampleInsights, sampleMatches, samplePlayers, sampleStats, sampleTournaments,
} from './players.sample'
import type { Db, StoredApplication } from './seed'

export const EXCLUSIVE_EVENT_ID = 'evt_exclusive'
export const ATTENDANCE_AWARD = 50

type StoredPick = { userId: string; optionId: string; submittedAt: string }
type StoredMarket = Omit<PredictionMarket, 'myPick' | 'state'> & { voided: boolean; picks: StoredPick[] }
type StoredTransaction = PointTransaction & { userId: string; key: string }
type StoredRedemption = Redemption & { userId: string; key: string }

export interface FazeIdState {
  follows: Record<string, string[]>
  markets: StoredMarket[]
  ledger: StoredTransaction[]
  rewards: Reward[]
  redemptions: StoredRedemption[]
}

function option(label: string, index: number) {
  return { id: `opt_${index + 1}`, label }
}

function seedState(): FazeIdState {
  const [upcoming] = sampleMatches.filter(match => match.status === 'upcoming')
  const lastFinished = sampleMatches.filter(match => match.status === 'finished').at(-1)!
  const winner = (matchId: string) => sampleMatches.find(match => match.id === matchId)!.participants.map(option)
  return {
    follows: {},
    ledger: [],
    redemptions: [],
    markets: [
      {
        id: 'mkt_sample_1', type: 'match_winner', title: `${lastFinished.participants.join(' vs ')} · ${lastFinished.stage}`,
        matchId: lastFinished.id, tournamentId: null, options: winner(lastFinished.id),
        locksAt: lastFinished.startsAt, award: 150, result: null, voided: false, isDemo: true,
        // The demo fan picked before the lock, so staff settlement has someone to award.
        picks: [
          { userId: 'fan_demo', optionId: 'opt_1', submittedAt: '2026-11-13T15:00:00.000Z' },
          { userId: 'user_app_maya', optionId: 'opt_1', submittedAt: '2026-11-13T16:10:00.000Z' },
          { userId: 'user_app_jordan', optionId: 'opt_2', submittedAt: '2026-11-13T17:25:00.000Z' },
        ],
      },
      {
        id: 'mkt_sample_2', type: 'match_winner', title: `${upcoming.participants.join(' vs ')} · ${upcoming.stage}`,
        matchId: upcoming.id, tournamentId: null, options: winner(upcoming.id),
        locksAt: upcoming.startsAt, award: 150, result: null, voided: false, isDemo: true, picks: [],
      },
      {
        id: 'mkt_sample_3', type: 'placement', title: 'Sample Winter Cup · final placement',
        matchId: null, tournamentId: 'trn_sample_2',
        options: ['Champion', 'Runner-up', 'Semi-finalist', 'Quarter-finals or earlier'].map(option),
        locksAt: '2026-12-03T18:00:00.000Z', award: 200, result: null, voided: false, isDemo: true, picks: [],
      },
    ],
    rewards: [
      { id: 'rwd_sample_1', title: 'Sample merch item', description: 'A proposed merchandise benefit used to demonstrate one working redemption.', kind: 'merch', cost: 50, stock: 5, active: true, terms: 'Proposed benefit for the pitch. Nothing is shipped.', isDemo: true },
      { id: 'rwd_sample_2', title: 'Raffle entry', description: 'A proposed entry into a prize draw.', kind: 'raffle', cost: 30, stock: null, active: false, terms: 'Concept only. No draw is run.', isDemo: true },
      { id: 'rwd_sample_3', title: 'Early access window', description: 'A proposed head start on a product drop.', kind: 'early_access', cost: 120, stock: null, active: false, terms: 'Concept only.', isDemo: true },
    ],
  }
}

/** Adds FaZe ID state and the points-gated sample event; safe to run on every load. */
export function addFazeId(db: Db) {
  db.fazeId ??= seedState()
  if (db.events.some(event => event.id === EXCLUSIVE_EVENT_ID)) return
  db.events.push({
    id: EXCLUSIVE_EVENT_ID,
    title: 'FaZe ID Watch Room Dallas',
    description: 'A small sample watch room for fans who have earned FaZe ID points. Points unlock the application; they are not spent.',
    location: 'Sample venue, Dallas, TX',
    startsAt: '2026-12-19T01:00:00.000Z',
    timezone: 'America/Chicago',
    capacity: 12,
    applicationDeadline: '2026-12-15T05:59:00.000Z',
    publicationStatus: 'published',
    minimumPoints: 100,
  })
  const config = defaultInterviewConfig()
  db.interviews[EXCLUSIVE_EVENT_ID] = {
    draft: config,
    draftUpdatedAt: null,
    versions: [{ versionId: `iv_${EXCLUSIVE_EVENT_ID}_1`, versionNumber: 1, publishedAt: '2026-11-10T16:00:00.000Z', config: structuredClone(config) }],
  }
}

function stateOf(db: Db): FazeIdState {
  addFazeId(db)
  return db.fazeId!
}

export function pointsBalance(db: Db, userId: string): number {
  return stateOf(db).ledger.filter(row => row.userId === userId).reduce((sum, row) => sum + row.delta, 0)
}

/** Appends one ledger row unless its key already exists, so retries never double-award. */
function addPoints(db: Db, userId: string, key: string, delta: number, reason: string, sourceType: PointSource, at: string) {
  const state = stateOf(db)
  if (state.ledger.some(row => row.key === key)) return
  state.ledger.push({ id: `pt_${crypto.randomUUID()}`, userId, key, delta, reason, sourceType, createdAt: at })
}

/** Points come from the staff-confirmed attendance record, once per application. */
export function awardAttendance(db: Db, app: StoredApplication, at: string) {
  addPoints(db, app.applicant.id, `attendance:${app.id}`, ATTENDANCE_AWARD, `Confirmed attendance: ${app.event.title}`, 'attendance', at)
}

function marketState(market: StoredMarket, nowMs: number): MarketState {
  if (market.voided) return 'void'
  if (market.result) return 'settled'
  return Date.parse(market.locksAt) <= nowMs ? 'locked' : 'open'
}

interface Context {
  call<T>(kind: 'read' | 'write', run: (db: Db) => T, role?: Role): Promise<T>
  now: () => Date
}

type FazeIdMethods = Pick<ApiClient,
  'listPlayers' | 'getPlayer' | 'getPlayerStats' | 'getPlayerSchedule' | 'listMatches' | 'getPlayerHighlights' |
  'getPlayerInsight' | 'listFollows' | 'setFollow' | 'listMarkets' | 'submitPick' | 'redeemPrediction' | 'resetPredictionDemo' | 'getMyPoints' | 'listRewards' |
  'redeemReward' | 'listMyRedemptions' | 'listAdminMarkets' | 'createMarket' | 'settleMarket' | 'listAdminRewards' |
  'createReward' | 'uploadRewardImage' | 'updateReward' | 'listAdminRedemptions' | 'getFanPoints' | 'adjustFanPoints'>

export function createFazeIdMethods({ call, now }: Context): FazeIdMethods {
  const fan = <T>(kind: 'read' | 'write', run: (db: Db) => T) => call(kind, run, 'fan')
  const staff = <T>(kind: 'read' | 'write', run: (db: Db) => T) => call(kind, run, 'staff')
  const notFound = (what: string): never => { throw new ApiError(404, 'NOT_FOUND', `${what} was not found.`) }
  const invalid = (message: string): never => { throw new ApiError(422, 'VALIDATION_FAILED', message) }

  const playerOf = (id: string) => [...rosterPlayers, ...samplePlayers].find(player => player.id === id) ?? notFound('Player')
  const marketOf = (db: Db, id: string) => stateOf(db).markets.find(market => market.id === id) ?? notFound('Prediction market')

  function publicMarket(market: StoredMarket, userId: string | null, db: Db): PredictionMarket {
    const { picks, voided: _voided, ...rest } = market
    const mine = userId ? picks.find(pick => pick.userId === userId) : undefined
    return {
      ...rest,
      state: marketState(market, now().getTime()),
      myPick: mine ? { optionId: mine.optionId, submittedAt: mine.submittedAt } : null,
      redeemed: Boolean(userId && stateOf(db).ledger.some(row => row.userId === userId && row.key === `prediction:${market.id}`)),
    }
  }

  function summary(db: Db, userId: string) {
    const entries = stateOf(db).ledger
      .filter(row => row.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ userId: _user, key: _key, ...entry }) => entry)
    return { balance: pointsBalance(db, userId), entries }
  }

  function cleanReward(input: RewardInput): RewardInput {
    if (!input.title.trim()) invalid('A reward needs a title.')
    if (!Number.isInteger(input.cost) || input.cost <= 0) invalid('Cost must be a positive whole number of points.')
    if (input.stock !== null && (!Number.isInteger(input.stock) || input.stock < 0)) invalid('Stock must be zero or more, or left empty.')
    const headline = (input.headline ?? '').trim()
    const imageUrl = input.imageUrl?.trim() || null
    return { ...input, title: input.title.trim(), headline, imageUrl, description: input.description.trim(), terms: input.terms.trim() }
  }

  const people = (db: Db) => [db.fan, ...db.otherFans, ...db.applications.map(app => app.applicant)]

  return {
    listPlayers: () => call('read', () => rosterPlayers),
    getPlayer: id => call('read', () => playerOf(id)),
    getPlayerStats: id => call('read', () => {
      playerOf(id)
      return sampleStats[id] ?? notFound('A stats snapshot for this player')
    }),
    // Every sample match involves the whole placeholder roster.
    getPlayerSchedule: id => call('read', () => {
      playerOf(id)
      return { matches: sampleMatches, tournaments: sampleTournaments }
    }),
    listMatches: () => call('read', () => sampleMatches),
    getPlayerHighlights: id => call('read', () => {
      playerOf(id)
      return sampleHighlights[id] ?? { playerId: id, fetchedAt: null, items: [], isDemo: true }
    }),
    getPlayerInsight: (id, snapshotId) => call('read', () => {
      playerOf(id)
      const insight = sampleInsights[snapshotId]
      if (insight && insight.playerId !== id) invalid('That snapshot belongs to a different player.')
      return insight ?? {
        playerId: id, snapshotId, generatedAt: null, status: 'unavailable' as const,
        summary: '', observations: [], limitations: [], isDemo: true,
      }
    }),

    listFollows: () => fan('read', db => stateOf(db).follows[db.fan.id] ?? []),
    setFollow: (playerId, following) => fan('write', db => {
      playerOf(playerId)
      const state = stateOf(db)
      const current = (state.follows[db.fan.id] ?? []).filter(id => id !== playerId)
      state.follows[db.fan.id] = following ? [...current, playerId] : current
    }),

    // Public list; a signed-in fan also sees their own pick.
    listMarkets: () => call('read', db =>
      stateOf(db).markets.map(market => publicMarket(market, db.signedOut?.fan ? null : db.fan.id, db))),
    submitPick: (marketId, optionId) => fan('write', db => {
      const market = marketOf(db, marketId)
      const state = marketState(market, now().getTime())
      if (state === 'settled' || state === 'void') throw new ApiError(409, 'ALREADY_SETTLED', 'This prediction is closed.')
      if (state === 'locked') throw new ApiError(409, 'PREDICTION_LOCKED', 'Picks locked when the deadline passed.')
      if (!market.options.some(item => item.id === optionId)) invalid('Choose one of the listed options.')
      if (market.picks.some(pick => pick.userId === db.fan.id)) {
        throw new ApiError(409, 'DUPLICATE_PICK', 'You already made a pick for this prediction. Picks are final.')
      }
      market.picks.push({ userId: db.fan.id, optionId, submittedAt: now().toISOString() })
    }),
    redeemPrediction: marketId => fan('write', db => {
      const market = marketOf(db, marketId)
      const mine = market.picks.find(pick => pick.userId === db.fan.id)
      if (!market.result || !mine || mine.optionId !== market.result.optionId) {
        throw new ApiError(409, 'NOT_A_WINNER', 'Only the winning pick can be redeemed.')
      }
      addPoints(db, db.fan.id, `prediction:${market.id}`, market.award, `Redeemed prediction: ${market.title}`, 'prediction', now().toISOString())
    }),
    resetPredictionDemo: marketId => fan('write', db => {
      const market = marketOf(db, marketId)
      if (market.matchId !== 'hltv-match-2399994') {
        throw new ApiError(409, 'PREDICTION_NOT_CLAIMABLE', 'Only the 3 November match can be reset for the demo.')
      }
      const state = stateOf(db)
      const mine = state.redemptions.filter(item => item.userId === db.fan.id)
      for (const claim of mine) {
        const reward = state.rewards.find(item => item.id === claim.rewardId)
        if (reward && reward.stock !== null) reward.stock += 1
      }
      const claimIds = new Set(mine.map(claim => `redemption:${claim.id}`))
      state.redemptions = state.redemptions.filter(item => item.userId !== db.fan.id)
      state.ledger = state.ledger.filter(row => !(row.userId === db.fan.id && (row.key === `prediction:${market.id}` || claimIds.has(row.key))))
    }),

    getMyPoints: () => fan('read', db => summary(db, db.fan.id)),
    listRewards: () => call('read', db => stateOf(db).rewards),
    redeemReward: (rewardId, idempotencyKey) => fan('write', db => {
      const state = stateOf(db)
      // A retry with the same key returns the original outcome without charging again.
      if (state.redemptions.some(item => item.userId === db.fan.id && item.key === idempotencyKey)) return
      const reward = state.rewards.find(item => item.id === rewardId) ?? notFound('Reward')
      if (!reward.active) throw new ApiError(409, 'REWARD_UNAVAILABLE', 'This reward is not available to redeem.')
      if (reward.stock !== null && reward.stock <= 0) throw new ApiError(409, 'OUT_OF_STOCK', 'This reward is out of stock.')
      const balance = pointsBalance(db, db.fan.id)
      if (balance < reward.cost) {
        throw new ApiError(409, 'INSUFFICIENT_POINTS', `This reward costs ${reward.cost} points and you have ${balance}.`)
      }
      const id = `red_${crypto.randomUUID()}`
      const at = now().toISOString()
      addPoints(db, db.fan.id, `redemption:${id}`, -reward.cost, `Reward redemption: ${reward.title}`, 'redemption', at)
      if (reward.stock !== null) reward.stock -= 1
      state.redemptions.push({
        id, userId: db.fan.id, key: idempotencyKey, rewardId, rewardTitle: reward.title, cost: reward.cost,
        status: 'requested', createdAt: at,
      })
    }),
    listMyRedemptions: () => fan('read', db =>
      stateOf(db).redemptions
        .filter(item => item.userId === db.fan.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ userId: _user, key: _key, ...item }) => item)),

    listAdminMarkets: () => staff('read', db => stateOf(db).markets.map((market): AdminMarket => ({
      ...publicMarket(market, null, db),
      pickCount: market.picks.length,
      picksByOption: Object.fromEntries(market.options.map(item =>
        [item.id, market.picks.filter(pick => pick.optionId === item.id).length])),
    }))),
    createMarket: (input: MarketInput) => staff('write', db => {
      const labels = input.options.map(label => label.trim()).filter(Boolean)
      if (!input.title.trim()) invalid('A prediction needs a title.')
      if (labels.length < 2 || new Set(labels.map(label => label.toLowerCase())).size !== labels.length) {
        invalid('Add at least two different options.')
      }
      if (!Number.isInteger(input.award) || input.award <= 0) invalid('The award must be a positive whole number of points.')
      const locks = Date.parse(input.locksAt)
      if (Number.isNaN(locks)) invalid('Choose when picks lock.')
      if (locks <= now().getTime()) invalid('The lock time must be in the future.')
      stateOf(db).markets.push({
        id: `mkt_${crypto.randomUUID()}`, type: input.type, title: input.title.trim(), matchId: input.matchId,
        tournamentId: input.tournamentId, options: labels.map(option), locksAt: new Date(locks).toISOString(),
        award: input.award, result: null, voided: false, isDemo: true, picks: [],
      })
    }),
    settleMarket: (id, input) => staff('write', db => {
      const market = marketOf(db, id)
      if (market.result || market.voided) throw new ApiError(409, 'ALREADY_SETTLED', 'This prediction has already been settled.')
      const winning = market.options.find(item => item.id === input.optionId) ?? invalid('Choose the confirmed outcome.')
      if (!/^https?:\/\/\S+\.\S+/.test(input.sourceUrl.trim())) invalid('Add a link to the source that confirms the result.')
      const at = now().toISOString()
      market.result = { optionId: winning.id, sourceUrl: input.sourceUrl.trim(), settledAt: at }
      const reason = market.type === 'match_winner' ? 'Correct match prediction' : 'Correct tournament prediction'
      for (const pick of market.picks) {
        if (pick.optionId !== winning.id) continue
        addPoints(db, pick.userId, `prediction:${market.id}:${pick.userId}`, market.award, `${reason}: ${market.title}`, 'prediction', at)
      }
    }),

    listAdminRewards: () => staff('read', db => stateOf(db).rewards),
    uploadRewardImage: input => staff('write', () => {
      if (!input.dataBase64.trim()) invalid('Choose an image.')
      return { imageUrl: `data:${input.contentType || 'image/png'};base64,${input.dataBase64}` }
    }),
    createReward: input => staff('write', db => {
      stateOf(db).rewards.push({ ...cleanReward(input), id: `rwd_${crypto.randomUUID()}`, isDemo: true })
    }),
    updateReward: (id, input) => staff('write', db => {
      const rewards = stateOf(db).rewards
      const index = rewards.findIndex(item => item.id === id)
      if (index < 0) notFound('Reward')
      rewards[index] = { ...rewards[index], ...cleanReward(input) }
    }),
    listAdminRedemptions: () => staff('read', db =>
      stateOf(db).redemptions
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ userId, key: _key, ...item }) => {
          const person = people(db).find(candidate => candidate.id === userId)
          return { ...item, fan: { id: userId, displayName: person?.displayName ?? null, email: person?.email ?? '' } }
        })),

    getFanPoints: userId => staff('read', db => summary(db, userId)),
    adjustFanPoints: (userId, input) => staff('write', db => {
      if (!people(db).some(person => person.id === userId)) notFound('Fan')
      if (!input.reason.trim()) invalid('A reason is required for every adjustment.')
      if (!Number.isInteger(input.delta) || input.delta === 0) invalid('Enter a whole number of points other than zero.')
      if (pointsBalance(db, userId) + input.delta < 0) invalid('This would take the balance below zero.')
      addPoints(db, userId, `adjustment:${crypto.randomUUID()}`, input.delta, `Staff adjustment: ${input.reason.trim()}`, 'adjustment', now().toISOString())
    }),
  }
}
