import assert from 'node:assert/strict'
import test from 'node:test'
import { insightFromSnapshot } from '../src/player-insights.ts'

test('the analysis repeats the snapshot and leaves missing stats blank', () => {
  const insight = insightFromSnapshot('hltv-10394', 'a'.repeat(64), 'Twistzz', {
    mapsPlayed: 584,
    metrics: {
      rating: 1.16,
      adr: 78.4,
      kd: null,
      headshotPercent: null,
      kastPercent: 74.8,
      killsPerRound: 0.72,
      deathsPerRound: 0.64,
    },
  })
  assert.equal(insight.status, 'ready')
  assert.equal(insight.summary, 'Twistzz is at a 1.16 rating across 584 maps.')
  assert.equal(insight.observations.some(item => item.text === 'K/D is unavailable.'), true)
  assert.equal(insight.observations.some(item => item.text === 'ADR is 78.4.'), true)
  assert.equal(insight.observations.some(item => item.text === 'KAST is 74.8%.'), true)
  const visible = [insight.summary, ...insight.observations.map(item => item.text)].join('\n')
  assert.equal(/hltv|https?:/i.test(visible), false)
})
