import { fail } from '../errors.ts'

export type HighlightItem = {
  videoId: string
  title: string
  channelTitle: string
  publishedAt: string
  thumbnailUrl: string
  watchUrl: string
  source: 'youtube'
}

export type HighlightList = {
  playerId: string
  fetchedAt: string
  items: HighlightItem[]
}

const CACHE_MS = 15 * 60 * 1000
const cache = new Map<string, HighlightList>()

/** Official FaZe Clan channel. Other players are added with YOUTUBE_CHANNELS=id=UCxxxx. */
const CHANNELS: Record<string, string> = {
  faze: 'UCNdpD9V0PIrH1glUJ6RG4-w',
}

/**
 * Public YouTube videos checked on 2026-11-15. Each id names that roster player
 * in the title. The API supplies the current title, channel, and date.
 */
const PLAYER_VIDEOS: Record<string, readonly string[]> = {
  'hltv-9960': ['TWa_wf5xyfc', '4CTOGC4xD2E', 'UTpXnd2kHjY', 'MKlQEWX-wBo'],
  'hltv-10394': ['44-AIKYHBKo', 'lc0ccgZGueA', 'JYSJU7wTHLY', 'UVahLLi65wk'],
  'hltv-21972': ['czvj2PT-jTA', 'AdFMDleDhpk', 'Oq5cRsy7GJ8', 'ipgNWy40ZTg'],
  'hltv-22383': ['3RjQ_AKdYPw', 'z74jVAjhZ5c', 'Jl8lr79LUpY', 'Tl-Z1WQXR_s'],
  'hltv-22866': ['2qD6dLYj0zs', 'W5WUagFl-bo', 'Gfb8ecYtz6I', 'RlJAkWUalCc'],
  'hltv-18053': ['EB0Z8VTW8CA', '2fLuAhoF-1g', 'kul8fDPvEiA', 'AyCXBUwRlL8'],
  'hltv-enkay-j': ['Lz_TZeSWk4w', 'T4rqf9q1-m8', 'fdE0q-QtEJ4', 'wuZcLiYVIcg'],
}

export function pinnedVideoIds(playerId: string): readonly string[] {
  return PLAYER_VIDEOS[playerId] ?? []
}

export function channelForPlayer(playerId: string): string | null {
  const configured = configuredChannels()
  return configured[playerId] ?? CHANNELS[playerId] ?? null
}

export function playlistItemsToHighlights(playerId: string, body: unknown, fetchedAt: string): HighlightList {
  const items = Array.isArray((body as { items?: unknown }).items) ? (body as { items: unknown[] }).items : []
  const highlights: HighlightItem[] = []
  for (const item of items) {
    const snippet = (item as { snippet?: unknown }).snippet
    if (!snippet || typeof snippet !== 'object') continue
    const record = snippet as {
      title?: unknown
      channelTitle?: unknown
      publishedAt?: unknown
      resourceId?: { videoId?: unknown }
      thumbnails?: { high?: { url?: unknown }; medium?: { url?: unknown }; default?: { url?: unknown } }
    }
    const videoId = typeof record.resourceId?.videoId === 'string' ? record.resourceId.videoId : ''
    const title = typeof record.title === 'string' ? record.title : ''
    const publishedAt = typeof record.publishedAt === 'string' ? record.publishedAt : ''
    if (!videoId || !title || !publishedAt) continue
    const thumbnail = [record.thumbnails?.high?.url, record.thumbnails?.medium?.url, record.thumbnails?.default?.url]
      .find((url): url is string => typeof url === 'string' && url.startsWith('https://'))
    highlights.push({
      videoId,
      title,
      channelTitle: typeof record.channelTitle === 'string' ? record.channelTitle : 'YouTube',
      publishedAt,
      thumbnailUrl: thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'youtube',
    })
  }
  return { playerId, fetchedAt, items: highlights }
}

export function videosToHighlights(playerId: string, body: unknown, fetchedAt: string, order: readonly string[]): HighlightList {
  const items = Array.isArray((body as { items?: unknown }).items) ? (body as { items: unknown[] }).items : []
  const byId = new Map<string, HighlightItem>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as {
      id?: unknown
      status?: { privacyStatus?: unknown }
      snippet?: {
        title?: unknown
        channelTitle?: unknown
        publishedAt?: unknown
        thumbnails?: { high?: { url?: unknown }; medium?: { url?: unknown }; default?: { url?: unknown } }
      }
    }
    const videoId = typeof record.id === 'string' ? record.id : ''
    const snippet = record.snippet
    const title = typeof snippet?.title === 'string' ? snippet.title : ''
    const publishedAt = typeof snippet?.publishedAt === 'string' ? snippet.publishedAt : ''
    if (!videoId || !title || !publishedAt || record.status?.privacyStatus !== 'public') continue
    const thumbnail = [snippet?.thumbnails?.high?.url, snippet?.thumbnails?.medium?.url, snippet?.thumbnails?.default?.url]
      .find((url): url is string => typeof url === 'string' && url.startsWith('https://'))
    byId.set(videoId, {
      videoId,
      title,
      channelTitle: typeof snippet?.channelTitle === 'string' ? snippet.channelTitle : 'YouTube',
      publishedAt,
      thumbnailUrl: thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'youtube',
    })
  }
  return { playerId, fetchedAt, items: order.flatMap(id => {
    const video = byId.get(id)
    return video ? [video] : []
  }) }
}

export async function highlightsForPlayer(playerId: string, apiKey: string): Promise<HighlightList> {
  const pinned = pinnedVideoIds(playerId)
  const channelId = pinned.length ? null : channelForPlayer(playerId)
  if (!pinned.length && !channelId) fail(404, 'PLAYER_NOT_FOUND', 'This player has no YouTube highlights configured.')
  const cached = cache.get(playerId)
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS) return cached
  try {
    const fresh = pinned.length
      ? await fetchPinned(playerId, pinned, apiKey)
      : await fetchUploads(playerId, channelId!, apiKey)
    cache.set(playerId, fresh)
    return fresh
  } catch (error) {
    if (cached) return cached
    throw error
  }
}

async function fetchPinned(playerId: string, videoIds: readonly string[], apiKey: string): Promise<HighlightList> {
  const page = await youtubeGet('videos', { part: 'snippet,status', id: videoIds.join(',') }, apiKey)
  return videosToHighlights(playerId, page, new Date().toISOString(), videoIds)
}

async function fetchUploads(playerId: string, channelId: string, apiKey: string): Promise<HighlightList> {
  const channel = await youtubeGet('channels', { part: 'contentDetails', id: channelId }, apiKey)
  const uploads = uploadsPlaylistId(channel)
  if (!uploads) fail(503, 'YOUTUBE_UNAVAILABLE', 'The configured YouTube channel has no public uploads.')
  const page = await youtubeGet('playlistItems', { part: 'snippet', playlistId: uploads, maxResults: '8' }, apiKey)
  return playlistItemsToHighlights(playerId, page, new Date().toISOString())
}

function uploadsPlaylistId(body: unknown): string | null {
  const items = (body as { items?: { contentDetails?: { relatedPlaylists?: { uploads?: unknown } } }[] }).items
  const uploads = items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  return typeof uploads === 'string' && uploads ? uploads : null
}

async function youtubeGet(method: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${method}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('key', apiKey)
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  } catch {
    fail(503, 'YOUTUBE_UNAVAILABLE', 'YouTube highlights timed out.')
  }
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!response.ok) {
    const reason = googleReason(body)
    if (reason === 'quotaExceeded') fail(503, 'YOUTUBE_QUOTA', 'YouTube quota is used up for today.')
    fail(503, 'YOUTUBE_UNAVAILABLE', 'YouTube highlights are unavailable right now.')
  }
  return body
}

function googleReason(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const errors = (body as { error?: { errors?: { reason?: string }[] } }).error?.errors
  return errors?.[0]?.reason
}

function configuredChannels(): Record<string, string> {
  const raw = process.env.YOUTUBE_CHANNELS?.trim()
  if (!raw) return {}
  const channels: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [playerId, channelId] = pair.split('=').map(part => part.trim())
    if (playerId && channelId && /^UC[\w-]{20,}$/.test(channelId)) channels[playerId] = channelId
  }
  return channels
}
