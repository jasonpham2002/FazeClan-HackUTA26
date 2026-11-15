import { describe, expect, it } from 'vitest'
import { ApiError } from '../client'
import { createFixtureClient, type KeyValueStorage } from './client'
import { EXCLUSIVE_EVENT_ID } from './fazeid'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function setup(at = '2026-11-15T12:00:00.000Z') {
  const clock = { now: new Date(at) }
  const api = createFixtureClient({ storage: memoryStorage(), delayMs: 0, now: () => clock.now })
  return { api, clock }
}

async function code(run: Promise<unknown>): Promise<string> {
  try {
    await run
    return 'no error'
  } catch (error) {
    return error instanceof ApiError ? error.code : String(error)
  }
}

const SOURCE = 'https://example.test/result'

describe('players (placeholder data)', () => {
  it('lists the five named starters with nothing invented about them', async () => {
    const { api } = setup()
    const players = await api.listPlayers()
    expect(players.map((player) => player.handle)).toEqual(['frozen', 'Twistzz', 'Neityu', 'jcobbb', 'JBOEN'])
    expect(players.every((player) => player.role === null && player.sourceUrl === null)).toBe(true)
    // Demo numbers and highlights exist for the pitch, but are always flagged as demo data.
    expect((await api.getPlayerStats('player_twistzz')).isDemo).toBe(true)
    expect((await api.getPlayerHighlights('player_twistzz')).isDemo).toBe(true)
  })

  it('keeps a missing metric as null on the placeholder demo profiles', async () => {
    const { api } = setup()
    const stats = await api.getPlayerStats('player_sample_2')
    expect(stats.metrics.headshotPercent.value).toBeNull()
    expect(stats.metrics.rating.value).toBeGreaterThan(0)
    expect(stats.isDemo).toBe(true)
  })

  it('has no stats for the coach and no filler highlights', async () => {
    const { api } = setup()
    expect(await code(api.getPlayerStats('player_sample_6'))).toBe('NOT_FOUND')
    expect((await api.getPlayerHighlights('player_sample_3')).items).toEqual([])
    expect((await api.getPlayerInsight('player_sample_3', 'snapshot_x')).status).toBe('unavailable')
  })

  it('refuses an insight for a snapshot that belongs to another player', async () => {
    const { api } = setup()
    expect(await code(api.getPlayerInsight('player_sample_2', 'snapshot_player_sample_1_1'))).toBe('VALIDATION_FAILED')
  })

  it('saves and removes a follow', async () => {
    const { api } = setup()
    await api.setFollow('player_sample_1', true)
    await api.setFollow('player_sample_1', true)
    expect(await api.listFollows()).toEqual(['player_sample_1'])
    await api.setFollow('player_sample_1', false)
    expect(await api.listFollows()).toEqual([])
  })
})

describe('predictions', () => {
  it('accepts one pick before the lock and restores it on the next read', async () => {
    const { api } = setup()
    await api.submitPick('mkt_sample_2', 'opt_1')
    const market = (await api.listMarkets()).find((item) => item.id === 'mkt_sample_2')!
    expect(market.state).toBe('open')
    expect(market.myPick?.optionId).toBe('opt_1')
    expect(await code(api.submitPick('mkt_sample_2', 'opt_2'))).toBe('DUPLICATE_PICK')
  })

  it('rejects an unknown option and a pick at or after the deadline', async () => {
    const { api, clock } = setup()
    expect(await code(api.submitPick('mkt_sample_2', 'opt_9'))).toBe('VALIDATION_FAILED')
    clock.now = new Date('2026-11-22T19:00:00.000Z') // exactly the lock time
    expect(await code(api.submitPick('mkt_sample_2', 'opt_1'))).toBe('PREDICTION_LOCKED')
    expect((await api.listMarkets()).find((item) => item.id === 'mkt_sample_2')!.state).toBe('locked')
  })

  it('awards a correct pick exactly once when staff settle', async () => {
    const { api } = setup()
    expect((await api.getMyPoints()).balance).toBe(0)
    expect(await code(api.settleMarket('mkt_sample_1', { optionId: 'opt_1', sourceUrl: 'not a link' }))).toBe('VALIDATION_FAILED')
    await api.settleMarket('mkt_sample_1', { optionId: 'opt_1', sourceUrl: SOURCE })
    expect(await code(api.settleMarket('mkt_sample_1', { optionId: 'opt_1', sourceUrl: SOURCE }))).toBe('ALREADY_SETTLED')
    const points = await api.getMyPoints()
    expect(points.balance).toBe(150)
    expect(points.entries).toHaveLength(1)
    expect(points.entries[0]).toMatchObject({ delta: 150, sourceType: 'prediction' })
    expect(points.entries[0].reason).toContain('Correct match prediction')
    // The fan who picked the other team gets nothing.
    expect((await api.getFanPoints('user_app_jordan')).balance).toBe(0)
    const market = (await api.listMarkets()).find((item) => item.id === 'mkt_sample_1')!
    expect(market.state).toBe('settled')
    expect(market.result?.optionId).toBe('opt_1')
  })

  it('awards nothing for an incorrect pick', async () => {
    const { api } = setup()
    await api.settleMarket('mkt_sample_1', { optionId: 'opt_2', sourceUrl: SOURCE })
    expect((await api.getMyPoints()).balance).toBe(0)
  })

  it('creates a market only with valid options, award and a future lock', async () => {
    const { api } = setup()
    const base = { type: 'match_winner' as const, title: 'A vs B', matchId: null, tournamentId: null, award: 100, locksAt: '2026-12-01T00:00:00.000Z' }
    expect(await code(api.createMarket({ ...base, options: ['A', 'a'] }))).toBe('VALIDATION_FAILED')
    expect(await code(api.createMarket({ ...base, options: ['A', 'B'], locksAt: '2026-11-01T00:00:00.000Z' }))).toBe('VALIDATION_FAILED')
    await api.createMarket({ ...base, options: ['A', 'B'] })
    const created = (await api.listAdminMarkets()).at(-1)!
    expect(created).toMatchObject({ title: 'A vs B', state: 'open', pickCount: 0 })
  })
})

describe('rewards and eligibility', () => {
  it('blocks redemption without enough points and charges nothing', async () => {
    const { api } = setup()
    expect(await code(api.redeemReward('rwd_sample_1', 'key-1'))).toBe('INSUFFICIENT_POINTS')
    expect((await api.getMyPoints()).entries).toEqual([])
    expect((await api.listRewards()).find((item) => item.id === 'rwd_sample_1')!.stock).toBe(5)
  })

  it('debits points and stock together, once per idempotency key', async () => {
    const { api } = setup()
    await api.settleMarket('mkt_sample_1', { optionId: 'opt_1', sourceUrl: SOURCE })
    await api.redeemReward('rwd_sample_1', 'key-1')
    await api.redeemReward('rwd_sample_1', 'key-1') // retry of the same request
    expect((await api.getMyPoints()).balance).toBe(100)
    expect((await api.listRewards()).find((item) => item.id === 'rwd_sample_1')!.stock).toBe(4)
    expect(await api.listMyRedemptions()).toHaveLength(1)
    expect(await api.listAdminRedemptions()).toHaveLength(1)
  })

  it('refuses an inactive or out-of-stock reward', async () => {
    const { api } = setup()
    await api.settleMarket('mkt_sample_1', { optionId: 'opt_1', sourceUrl: SOURCE })
    expect(await code(api.redeemReward('rwd_sample_2', 'key-2'))).toBe('REWARD_UNAVAILABLE')
    const reward = (await api.listAdminRewards()).find((item) => item.id === 'rwd_sample_1')!
    await api.updateReward(reward.id, { ...reward, stock: 0 })
    expect(await code(api.redeemReward('rwd_sample_1', 'key-3'))).toBe('OUT_OF_STOCK')
    expect((await api.getMyPoints()).balance).toBe(150)
  })

  it('gates the exclusive event on points without spending them', async () => {
    const { api } = setup()
    expect((await api.getFanEvent(EXCLUSIVE_EVENT_ID)).minimumPoints).toBe(100)
    expect(await code(api.createFanApplication(EXCLUSIVE_EVENT_ID, true))).toBe('NOT_ELIGIBLE')
    await api.settleMarket('mkt_sample_1', { optionId: 'opt_1', sourceUrl: SOURCE })
    const { id } = await api.createFanApplication(EXCLUSIVE_EVENT_ID, true)
    expect((await api.getMyApplication(id)).status).toBe('interview_pending')
    expect((await api.getMyPoints()).balance).toBe(150)
  })

  it('requires a reason for a staff adjustment and never goes below zero', async () => {
    const { api } = setup()
    expect(await code(api.adjustFanPoints('fan_demo', { delta: 20, reason: ' ' }))).toBe('VALIDATION_FAILED')
    expect(await code(api.adjustFanPoints('fan_demo', { delta: -20, reason: 'Correction' }))).toBe('VALIDATION_FAILED')
    await api.adjustFanPoints('fan_demo', { delta: 20, reason: 'Goodwill' })
    const points = await api.getFanPoints('fan_demo')
    expect(points.balance).toBe(20)
    expect(points.entries[0].reason).toBe('Staff adjustment: Goodwill')
  })

  it('awards attendance points once from the confirmed attendance record', async () => {
    const { api } = setup('2027-01-01T00:00:00.000Z')
    await api.recordAttendance('app_alex')
    await api.recordAttendance('app_alex')
    const points = await api.getFanPoints('user_app_alex')
    expect(points.balance).toBe(50)
    expect(points.entries).toHaveLength(1)
  })
})
