import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface Split { rating: number; maps: number }
interface Season {
  label: string
  kind: 'year' | 'recent'
  rating: number
  maps: number
  online: Split | null
  lan: Split | null
  majors: Split | null
}
interface SeasonReport { metric: string; collectedAt: string; seasons: Season[] }

async function loadSeasons(playerId: string): Promise<SeasonReport | null> {
  const response = await fetch(`/players/${encodeURIComponent(playerId)}/seasons`, { credentials: 'include' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('The yearly statistics could not be loaded.')
  return response.json() as Promise<SeasonReport>
}

function cell(split: Split | null) {
  if (!split) return '—'
  return `${split.rating.toFixed(2)} · ${split.maps}`
}

interface PlayedMatch {
  id: string
  tournament: { name: string }
  stage: string | null
  participants: string[]
  startsAt: string
  status: string
  result: { winner: string; score: string | null } | null
}

function RecentMatchBoxes({ playerId }: { playerId: string }) {
  const schedule = useQuery({
    queryKey: ['player', playerId, 'schedule'],
    queryFn: async () => {
      const response = await fetch(`/players/${encodeURIComponent(playerId)}/matches`, { credentials: 'include' })
      if (!response.ok) throw new Error('Matches could not be loaded.')
      return response.json() as Promise<{ matches: PlayedMatch[] }>
    },
  })
  const [pickedId, setPickedId] = useState<string | null>(null)
  const finished = (schedule.data?.matches ?? [])
    .filter(match => match.status === 'finished' && match.result)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 5)
  if (schedule.isPending || schedule.isError || finished.length === 0) return null
  const picked = finished.find(match => match.id === pickedId) ?? finished[0]
  const opponent = (match: PlayedMatch) => match.participants.find(name => name !== 'FaZe') ?? 'Opponent'
  const won = (match: PlayedMatch) => match.result?.winner === 'FaZe'
  const when = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted">Recent matches</h3>
      <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {finished.map(match => {
          const active = match.id === picked.id
          return (
            <li key={match.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setPickedId(match.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                  active ? 'border-accent bg-surface-2' : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">vs {opponent(match)}</span>
                  <span className="text-xs text-subtle">{when(match.startsAt)} · {won(match) ? 'W' : 'L'} {match.result?.score}</span>
                </span>
                <span className="figure shrink-0 text-xl whitespace-nowrap tabular-nums">{match.result?.score}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-bold">vs {opponent(picked)}</h3>
          <p className="text-sm font-semibold text-accent-text">{won(picked) ? 'Won' : 'Lost'} {picked.result?.score}</p>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {picked.tournament.name}{picked.stage ? ` · ${picked.stage}` : ''} · {when(picked.startsAt)}
        </p>
        <p className="mt-3 text-xs text-subtle">Series result for FaZe. A player rating for this single match was not supplied, so none is shown.</p>
      </div>
    </div>
  )
}

export function SeasonChart({ playerId }: { playerId: string }) {
  const query = useQuery({ queryKey: ['player', playerId, 'seasons'], queryFn: () => loadSeasons(playerId) })
  if (query.isPending) return <p className="text-sm text-muted">Loading yearly statistics…</p>
  if (query.isError) return <p className="text-sm text-danger">The yearly statistics could not be loaded.</p>
  if (!query.data) return null
  const years = query.data.seasons.filter(season => season.kind === 'year')
  const width = 640
  const height = 220
  const pad = 36
  const ratings = years.map(season => season.rating)
  const min = Math.min(...ratings) - 0.04
  const max = Math.max(...ratings) + 0.04
  const coords = years.map((season, index) => {
    const x = years.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (years.length - 1)
    const y = pad + ((max - season.rating) / (max - min)) * (height - pad * 2)
    return { season, x, y }
  })
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  return (
    <section className="space-y-4" aria-label="Rating by year">
      <figure>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${query.data.metric} by year`} className="h-auto w-full">
          <defs>
            <linearGradient id="fz-year-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[pad, height / 2, height - pad].map(y => <line key={y} x1={pad} x2={width - pad} y1={y} y2={y} stroke="var(--color-border)" />)}
          <text x={pad - 8} y={pad + 4} textAnchor="end" fontSize="12" fill="var(--color-subtle)">{max.toFixed(2)}</text>
          <text x={pad - 8} y={height - pad + 4} textAnchor="end" fontSize="12" fill="var(--color-subtle)">{min.toFixed(2)}</text>
          <path d={`M${coords[0].x} ${height - pad} ${line.slice(1)} L${coords.at(-1)!.x} ${height - pad} Z`} fill="url(#fz-year-fill)" />
          <path d={line} fill="none" stroke="var(--color-accent-text)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {coords.map((point, index) => {
            const latest = index === coords.length - 1
            return (
              <g key={point.season.label}>
                <circle cx={point.x} cy={point.y} r={latest ? 6 : 4.5} fill={latest ? 'var(--color-accent)' : 'var(--color-bg)'} stroke={latest ? 'var(--color-text)' : 'var(--color-accent-text)'} strokeWidth="2.5" />
                {latest && <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--color-text)">{point.season.rating.toFixed(2)}</text>}
                <text x={point.x} y={height - 10} textAnchor="middle" fontSize="12" fill="var(--color-subtle)">{point.season.label}</text>
              </g>
            )
          })}
        </svg>
        <figcaption className="mt-1 text-xs text-subtle">
          {query.data.metric} in each year. The cards above use Rating 3.0, which is a different scale.
        </figcaption>
      </figure>
      <RecentMatchBoxes playerId={playerId} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{query.data.metric} by period, with map counts for all matches, online, LAN, and majors</caption>
          <thead className="text-xs font-semibold text-muted">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-semibold">Period</th>
              <th className="py-2 pr-3 font-semibold">Rating</th>
              <th className="py-2 pr-3 font-semibold">Maps</th>
              <th className="py-2 pr-3 font-semibold">Online</th>
              <th className="py-2 pr-3 font-semibold">LAN</th>
              <th className="py-2 font-semibold">Majors</th>
            </tr>
          </thead>
          <tbody>
            {query.data.seasons.map(season => (
              <tr key={season.label} className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">{season.label}</th>
                <td className="py-2 pr-3 tabular-nums">{season.rating.toFixed(2)}</td>
                <td className="py-2 pr-3 tabular-nums">{season.maps}</td>
                <td className="py-2 pr-3 tabular-nums">{cell(season.online)}</td>
                <td className="py-2 pr-3 tabular-nums">{cell(season.lan)}</td>
                <td className="py-2 tabular-nums">{cell(season.majors)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
