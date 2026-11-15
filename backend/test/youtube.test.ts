import assert from 'node:assert/strict'
import test from 'node:test'
import { channelForPlayer, pinnedVideoIds, playlistItemsToHighlights, videosToHighlights } from '../src/integrations/youtube.ts'

test('a playlist page becomes attributed watch links', () => {
  const result = playlistItemsToHighlights('faze', {
    items: [{
      snippet: {
        title: 'FaZe Clan vs NAVI',
        channelTitle: 'FaZe Clan',
        publishedAt: '2026-11-01T00:00:00Z',
        resourceId: { videoId: 'abc123' },
        thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' } },
      },
    }, {
      snippet: { title: 'Missing id', publishedAt: '2026-11-01T00:00:00Z' },
    }],
  }, '2026-11-15T00:00:00.000Z')

  assert.equal(result.playerId, 'faze')
  assert.equal(result.fetchedAt, '2026-11-15T00:00:00.000Z')
  assert.deepEqual(result.items, [{
    videoId: 'abc123',
    title: 'FaZe Clan vs NAVI',
    channelTitle: 'FaZe Clan',
    publishedAt: '2026-11-01T00:00:00Z',
    thumbnailUrl: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg',
    watchUrl: 'https://www.youtube.com/watch?v=abc123',
    source: 'youtube',
  }])
})

test('the FaZe channel is the configured demo source', () => {
  assert.equal(channelForPlayer('faze'), 'UCNdpD9V0PIrH1glUJ6RG4-w')
  assert.equal(channelForPlayer('unknown-player'), null)
})

test('each roster player has verified public video ids', () => {
  for (const playerId of ['hltv-9960', 'hltv-10394', 'hltv-21972', 'hltv-22383', 'hltv-22866', 'hltv-18053', 'hltv-enkay-j']) {
    const ids = pinnedVideoIds(playerId)
    assert.ok(ids.length >= 3)
    assert.ok(ids.every(id => /^[\w-]{11}$/.test(id)))
  }
  assert.deepEqual(pinnedVideoIds('missing-player'), [])
})

test('pinned videos keep their order and skip private videos', () => {
  const result = videosToHighlights('hltv-10394', {
    items: [{
      id: 'lc0ccgZGueA',
      status: { privacyStatus: 'public' },
      snippet: { title: 'Best of Twistzz in CS2', channelTitle: 'flvshie', publishedAt: '2025-10-22T21:55:32Z' },
    }, {
      id: 'privatevid1',
      status: { privacyStatus: 'private' },
      snippet: { title: 'Hidden', channelTitle: 'FaZe', publishedAt: '2025-10-22T21:55:32Z' },
    }],
  }, '2026-11-15T00:00:00.000Z', ['privatevid1', 'lc0ccgZGueA'])

  assert.deepEqual(result.items.map(video => video.videoId), ['lc0ccgZGueA'])
  assert.equal(result.items[0]?.watchUrl, 'https://www.youtube.com/watch?v=lc0ccgZGueA')
})
