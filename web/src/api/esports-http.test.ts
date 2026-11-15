import { afterEach, expect, it, vi } from 'vitest'
import bundle from '../../../backend/data/faze-cs2-2026-11-15.json'
import { createHttpClient } from './http'
import { portraitFor } from './portraits'

afterEach(() => vi.restoreAllMocks())
it('renders the imported roster identity consistently from list and detail endpoints', async () => {
  const entry = bundle.players[0]
  const rosterSource = bundle.sources.find(source => source.id === entry.rosterSourceId)!
  const profile = { ...entry, rosterSource }
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ players: [{ ...entry, checkedAt: rosterSource.observedAt, profile }] }))
    .mockResolvedValueOnce(Response.json({ ...profile, checkedAt: rosterSource.observedAt }))
  const api = createHttpClient('/api')
  const [player] = await api.listPlayers()
  expect(player).toMatchObject({ id: entry.id, handle: entry.handle, rosterStatus: 'active', team: 'FaZe', sourceUrl: rosterSource.url, role: null, imageUrl: portraitFor(entry.handle)?.url ?? null, isDemo: false })
  expect(await api.getPlayer(entry.id)).toEqual(player)
  expect(fetchMock).toHaveBeenLastCalledWith(`/api/players/${entry.id}`, expect.anything())
})
it('maps sourced aggregates without inventing dates, missing metrics or recent matches', async () => {
  const snapshot = bundle.snapshots[0]
  const source = bundle.sources.find(source => source.id === snapshot.sourceId)!
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
    ...snapshot, snapshotId: 'a'.repeat(64), source, limitations: bundle.limitations, isDemo: false,
  }))
  const stats = await createHttpClient('/api').getPlayerStats(snapshot.playerId)
  expect(stats.metrics).toEqual({ rating: { value: 1.16, definition: 'HLTV Rating 3.0' }, kd: { value: null }, adr: { value: 80.1 }, headshotPercent: { value: null, unit: '%' } })
  expect(stats.period).toEqual({ label: snapshot.period.label, start: null, end: null })
  expect(stats.snapshotId).toBe('a'.repeat(64))
  expect(stats.recentMatches).toEqual([])
  expect(stats.sources[0]).toMatchObject({ url: source.url, retrievedAt: source.observedAt })
  expect(stats.sourceUpdatedAt).toBeNull()
  expect(stats.limitations).toContain(source.crawlHint)
  expect(stats.retrievedAt).toBe(snapshot.observedAt)
  expect(stats.isDemo).toBe(false)
})
it('keeps unavailable statistics unavailable instead of falling back to fixtures', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: { code: 'STATS_UNAVAILABLE', message: 'No sourced statistics' } }, { status: 404 }))
  await expect(createHttpClient('/api').getPlayerStats('hltv-enkay-j')).rejects.toMatchObject({ status: 404, code: 'STATS_UNAVAILABLE' })
})
