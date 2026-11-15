import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptModelInsight, allowedNumbers, analysisFacts, usesOnlyAllowedNumbers } from '../src/integrations/player-insights.ts'

const twistzz = {
  period: { label: 'All available CS2 maps (all teams)' },
  mapsPlayed: 584,
  metrics: {
    rating: 1.16,
    ratingDefinition: 'HLTV Rating 3.0',
    kd: null,
    adr: 78.4,
    headshotPercent: null,
    kastPercent: 74.8,
    killsPerRound: 0.72,
    deathsPerRound: 0.64,
  },
  source: { id: 'hltv_twistzz', url: 'https://www.hltv.org/stats/players/10394/twistzz' },
  limitations: ['Captured from a stats site.'],
}

test('the model prompt keeps the numbers and drops the provider', () => {
  const facts = analysisFacts('Twistzz', twistzz)
  const encoded = JSON.stringify(facts)
  assert.equal(encoded.toLowerCase().includes('hltv'), false)
  assert.equal(encoded.includes('http'), false)
  assert.equal(facts.statistics.find(item => item.key === 'rating')?.label, 'Rating 3.0')
  assert.equal(facts.statistics.find(item => item.key === 'kd')?.value, null)
  assert.deepEqual(allowedNumbers(facts).sort((a, b) => a - b), [0.64, 0.72, 1.16, 74.8, 78.4, 584])
})

test('a model reply is kept only when it uses the supplied numbers', () => {
  const facts = analysisFacts('Twistzz', twistzz)
  const allowed = allowedNumbers(facts)
  const reply = JSON.stringify({
    summary: 'Twistzz carries a 1.16 rating across 584 maps, with 78.4 ADR. The totals describe consistent damage rather than a single match.',
    observations: [
      { text: 'KAST is 74.8%, with 0.72 kills per round and 0.64 deaths per round.', metricRefs: ['metrics.kastPercent', 'metrics.killsPerRound', 'metrics.deathsPerRound'] },
      { text: 'K/D and headshot percentage are unavailable.', metricRefs: ['metrics.kd', 'not-a-metric'] },
    ],
    limitations: ['These are overall totals, not a match-by-match trend.'],
  })
  const insight = acceptModelInsight(reply, {
    playerId: 'hltv-10394', snapshotId: 'a'.repeat(64), generatedAt: '2026-11-15T13:40:00Z', allowed,
  })
  assert.equal(insight?.status, 'ready')
  assert.deepEqual(insight?.observations[1]?.metricRefs, ['metrics.kd'])
  const visible = [insight?.summary, ...(insight?.observations ?? []).map(item => item.text), ...(insight?.limitations ?? [])].join('\n')
  assert.equal(/hltv/i.test(visible), false)
  assert.equal(usesOnlyAllowedNumbers('rating 1.50', allowed), false)
  assert.equal(acceptModelInsight(reply.replace('78.4', '91.2'), {
    playerId: 'hltv-10394', snapshotId: 'a'.repeat(64), generatedAt: '2026-11-15T13:40:00Z', allowed,
  }), null)
  assert.equal(acceptModelInsight(reply.replace('consistent damage', 'an HLTV rating'), {
    playerId: 'hltv-10394', snapshotId: 'a'.repeat(64), generatedAt: '2026-11-15T13:40:00Z', allowed,
  }), null)
})
