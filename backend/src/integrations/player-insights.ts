import { z } from 'zod'

export type InsightObservation = {
  text: string
  metricRefs: string[]
  sourceIds: string[]
}

export type PlayerInsight = {
  playerId: string
  snapshotId: string
  generatedAt: string | null
  status: 'ready' | 'pending' | 'unavailable'
  summary: string
  observations: InsightObservation[]
  limitations: string[]
  isDemo: boolean
}

type SnapshotMetrics = {
  rating?: number | null
  ratingDefinition?: string
  kd?: number | null
  adr?: number | null
  headshotPercent?: number | null
  kastPercent?: number | null
  killsPerRound?: number | null
  deathsPerRound?: number | null
}

export type InsightSnapshot = {
  period?: { label?: string }
  mapsPlayed?: number | null
  metrics?: SnapshotMetrics
  source?: { id?: string }
  observedAt?: string
  limitations?: unknown
}

const METRICS = [
  ['rating', 'rating'],
  ['kd', 'K/D'],
  ['adr', 'ADR'],
  ['headshotPercent', 'headshot percentage'],
  ['kastPercent', 'KAST'],
  ['killsPerRound', 'kills per round'],
  ['deathsPerRound', 'deaths per round'],
] as const

const REFS = new Set(METRICS.map(([key]) => `metrics.${key}`))
const PROVIDER = /hltv|liquipedia|https?:\/\/|www\./i
const META_URL = 'https://api.meta.ai/v1/chat/completions'
const cache = new Map<string, PlayerInsight>()

const modelSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  observations: z.array(z.object({
    text: z.string().trim().min(1).max(500),
    metricRefs: z.array(z.string()).max(8).default([]),
  })).max(6).default([]),
  limitations: z.array(z.string().trim().min(1).max(600)).max(6).default([]),
})

const SYSTEM = [
  'You analyze one CS2 player for fans, using only the statistics in the user message.',
  'Explain what those totals say about impact, damage, and round involvement.',
  'Every numeral you write must be copied exactly from the permitted numerals. Do not calculate a new ratio or fill a missing value.',
  'If a statistic is null, say it is unavailable.',
  'Do not claim the player is improving, declining, or on a streak. These are single totals, not a series of matches.',
  'Do not name a website, a stats provider, or a URL, and do not say where the numbers were collected.',
  'Return only a JSON object with summary, observations, and limitations. Each observation has text and metricRefs.',
].join(' ')

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function ratingLabel(definition: string | undefined): string {
  const cleaned = (definition ?? 'Rating').replace(/hltv/ig, '').replace(/\s+/g, ' ').trim()
  return cleaned || 'Rating'
}

export type AnalysisFacts = {
  player: string
  mapsPlayed: number | null
  period: string
  statistics: { key: string; label: string; value: number | null }[]
}

/** The numbers the model may see. Provider names and links are left out. */
export function analysisFacts(handle: string, snapshot: InsightSnapshot): AnalysisFacts {
  const metrics = snapshot.metrics ?? {}
  return {
    player: handle.trim() || 'This player',
    mapsPlayed: finite(snapshot.mapsPlayed),
    period: (snapshot.period?.label ?? 'available maps').replace(/hltv/ig, '').replace(/\s+/g, ' ').trim() || 'available maps',
    statistics: METRICS.map(([key, label]) => ({
      key,
      label: key === 'rating' ? ratingLabel(metrics.ratingDefinition) : label,
      value: finite(metrics[key]),
    })),
  }
}

export function allowedNumbers(facts: AnalysisFacts): number[] {
  const values = facts.statistics.flatMap(item => item.value === null ? [] : [item.value])
  return facts.mapsPlayed === null ? values : [...values, facts.mapsPlayed]
}

export function citedNumbers(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0])).filter(Number.isFinite)
}

export function usesOnlyAllowedNumbers(text: string, allowed: number[]): boolean {
  return citedNumbers(text).every(cited => allowed.some(item => Math.abs(item - cited) < 1e-9))
}

function permittedNumerals(allowed: number[]): string {
  return [...new Set(allowed.map(value => String(value)))].join(', ')
}

function normalizeModel(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = { ...(value as Record<string, unknown>) }
  if (typeof record.limitations === 'string') record.limitations = [record.limitations]
  if (!Array.isArray(record.limitations)) record.limitations = []
  const observations = Array.isArray(record.observations) ? record.observations : []
  record.observations = observations.map(item => {
    if (!item || typeof item !== 'object') return item
    const entry = item as { text?: unknown; metricRefs?: unknown }
    const refs = Array.isArray(entry.metricRefs) ? entry.metricRefs : []
    return {
      text: entry.text,
      metricRefs: refs.map(ref => {
        if (typeof ref !== 'string') return ref
        const prefixed = ref.startsWith('metrics.') ? ref : `metrics.${ref}`
        return REFS.has(prefixed) ? prefixed : ref
      }),
    }
  })
  return record
}

export function acceptModelInsight(raw: string, input: {
  playerId: string
  snapshotId: string
  generatedAt: string
  allowed: number[]
}): PlayerInsight | null {
  let parsed: z.infer<typeof modelSchema>
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    parsed = modelSchema.parse(normalizeModel(JSON.parse(raw.slice(start, end + 1))))
  } catch {
    return null
  }
  const observations = parsed.observations.map(item => ({
    text: item.text,
    metricRefs: item.metricRefs.filter(ref => REFS.has(ref)),
    sourceIds: [],
  }))
  const limitations = parsed.limitations.filter(item => !PROVIDER.test(item))
  const visible = [parsed.summary, ...observations.map(item => item.text), ...limitations].join('\n')
  if (PROVIDER.test(visible) || !usesOnlyAllowedNumbers(visible, input.allowed)) return null
  return {
    playerId: input.playerId,
    snapshotId: input.snapshotId,
    generatedAt: input.generatedAt,
    status: 'ready',
    summary: parsed.summary,
    observations,
    limitations: limitations.length > 0 ? limitations : ['These are overall totals, not a match-by-match trend.'],
    isDemo: false,
  }
}

async function complete(apiKey: string, model: string, user: string): Promise<string> {
  const response = await fetch(META_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 4000,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  })
  if (!response.ok) throw new Error(`Meta analysis failed (${response.status})`)
  const body = await response.json() as { choices?: { message?: { content?: unknown } }[] }
  const content = body.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : (part as { text?: string }).text ?? '').join('')
  }
  throw new Error('Meta analysis returned no text')
}

export async function analyzePlayer(input: {
  playerId: string
  snapshotId: string
  handle: string
  snapshot: InsightSnapshot
  apiKey: string
  model: string
}): Promise<PlayerInsight> {
  const cacheKey = `${input.model}:${input.snapshotId}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const facts = analysisFacts(input.handle, input.snapshot)
  const allowed = allowedNumbers(facts)
  const prompt = `${JSON.stringify(facts)}\nPermitted numerals: ${permittedNumerals(allowed)}`
  let raw = await complete(input.apiKey, input.model, prompt)
  const generatedAt = new Date().toISOString()
  let insight = acceptModelInsight(raw, { ...input, generatedAt, allowed })
  if (!insight) {
    raw = await complete(input.apiKey, input.model, `${prompt}\nThe previous reply was rejected. Return only the JSON object, copy numerals exactly, and do not name a stats site.`)
    insight = acceptModelInsight(raw, { ...input, generatedAt, allowed })
  }
  if (!insight) throw new Error('Meta analysis did not match the supplied statistics')
  cache.set(cacheKey, insight)
  return insight
}
