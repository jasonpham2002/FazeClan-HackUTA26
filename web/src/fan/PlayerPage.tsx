import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import type {
  EsportsMatch, HighlightVideo, MatchStatLine, Player, PlayerStats, PredictionMarket, StatKey,
} from '../api/types'
import { Icon } from '../components/ui/Icon'
import { Badge, Button, EmptyState, ErrorState, linkButtonClass, linkClass, LoadingState, Notice } from '../components/ui/ui'
import { formatDateTime } from '../lib/format'
import { canChart, observations, plot, standoutMatch } from '../lib/playerStats'
import {
  formatDate, formatStat, isUnverified, PickStateBadge, PREVIEW_LABEL, pickState, PlayerPortrait, RosterBadge, SampleBadge, statLabels, useFan,
} from './fazeid-ui'
import { eventUnavailable } from './logic'
import { SeasonChart } from './SeasonChart'
import { useReveal } from './useReveal'

const SHOWN_STATS = ['rating', 'adr'] as const
const STAT_SCALE = { rating: 3, adr: 100 } as const

function StatMeter({ value, max }: { value: number | null; max: number }) {
  const segments = 20
  const filled = value === null ? 0 : Math.round(Math.min(1, Math.max(0, value / max)) * segments)
  return (
    <span className="mt-3 flex h-2 gap-1" aria-hidden="true">
      {Array.from({ length: segments }, (_, index) => (
        <span key={index} className={`h-full flex-1 rounded-sm ${index < filled ? 'bg-accent' : 'bg-border'}`} />
      ))}
    </span>
  )
}

// ---------- Player switcher ----------

function PlayerSwitcher({ currentId }: { currentId: string }) {
  const players = useQuery({ queryKey: ['players'], queryFn: api.listPlayers })
  if (!players.data || players.data.length < 2) return null
  return (
    <nav aria-label="Switch player" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
      <Link to="/players" className="mr-2 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <Icon name="arrowLeft" /> Roster
      </Link>
      {players.data.map(player => (
        <NavLink
          key={player.id}
          to={`/players/${encodeURIComponent(player.id)}`}
          aria-current={player.id === currentId ? 'page' : undefined}
          className={({ isActive }) =>
            `inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
              isActive ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text'
            }`
          }
        >
          <PlayerPortrait player={player} className="size-7 rounded-full" />
          {player.handle}
        </NavLink>
      ))}
    </nav>
  )
}

// ---------- Section 1: identity ----------

function FollowButton({ player }: { player: Player }) {
  const { fan, signedOut } = useFan()
  const queries = useQueryClient()
  const follows = useQuery({ queryKey: ['fan', 'follows'], queryFn: api.listFollows, enabled: Boolean(fan) })
  const following = follows.data?.includes(player.id) ?? false
  const toggle = useMutation({
    mutationFn: () => api.setFollow(player.id, !following),
    // The button changes only after the saved list is read back.
    onSettled: () => queries.invalidateQueries({ queryKey: ['fan', 'follows'] }),
  })
  if (signedOut) return <Link to="/sign-in" className={linkButtonClass}>Sign in to follow</Link>
  if (!fan) return null
  if (follows.isError) return <Notice tone="danger">Could not load who you follow. Reload to try again.</Notice>
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant={following ? 'secondary' : 'primary'}
        icon={following ? 'check' : 'plus'}
        aria-pressed={following}
        disabled={follows.isPending || toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {toggle.isPending ? 'Saving…' : following ? 'Following' : `Follow ${player.handle}`}
      </Button>
      {toggle.isError && (
        <p role="alert" className="text-sm text-danger">
          Not saved. {toggle.error instanceof ApiError ? toggle.error.message : 'Try again.'}
        </p>
      )}
    </div>
  )
}

/** The broadcast-style introduction: text left, portrait right, the handle echoed huge behind. */
function Identity({ player }: { player: Player }) {
  const rise = (i: number) => ({ '--i': i }) as CSSProperties
  const long = player.handle.length > 7
  return (
    <header className="fz-hero">
      <span aria-hidden="true" className="fz-hero-ghost">{player.handle}</span>
      <div className="grid gap-8 p-5 sm:p-8 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-end md:gap-10 lg:p-12">
        <div className="order-2 min-w-0 space-y-6 md:order-1">
          <div className="fz-rise flex flex-wrap items-center gap-x-4 gap-y-2" style={rise(0)}>
            <span className="text-white"><RosterBadge status={player.rosterStatus} /></span>
            {player.isDemo && <SampleBadge label="Placeholder player" />}
            {isUnverified(player) && <SampleBadge label={PREVIEW_LABEL} />}
          </div>
          <div className="space-y-3">
            <h1 className={`fz-display fz-rise ${long ? 'text-[clamp(3rem,9vw,6.5rem)]' : 'text-[clamp(4rem,12vw,9rem)]'}`} style={rise(1)}>
              {player.handle}
            </h1>
            <p className="fz-rise text-lg text-muted sm:text-xl" style={rise(2)}>
              {[player.role, player.displayName, player.team].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="fz-rise space-y-4" style={rise(3)}>
            <FollowButton player={player} />
            <p className="text-sm text-subtle">
              Roster status checked {formatDateTime(player.checkedAt)}.{' '}
              {player.sourceUrl
                ? <a href={player.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>Source</a>
                : 'No source link supplied.'}
            </p>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <div className="fz-hero-portrait fz-portrait-in mx-auto w-full max-w-[17rem] sm:max-w-xs md:max-w-none">
            <PlayerPortrait player={player} className="aspect-[4/5] w-full" />
          </div>
          {player.imageCredit && <p className="mt-2 text-right text-xs text-subtle">Photo: {player.imageCredit}</p>}
        </div>
      </div>
    </header>
  )
}

/** Page-level section on the profile: a large display heading, then content that fades in on first view. */
function Section({ title, meta, actions, children }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const ref = useReveal<HTMLElement>()
  return (
    <section ref={ref} className="scroll-mt-24">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-4 sm:mb-8">
        <div className="min-w-0 space-y-2">
          <h2 className="fz-section-title">{title}</h2>
          {meta && <div className="fz-meta flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

// ---------- Section 1: analytics ----------

function StatRail({ stats, metric, onSelect }: { stats: PlayerStats; metric: StatKey; onSelect: (key: StatKey) => void }) {
  return (
    <div role="group" aria-label="Statistics for this period" className="grid gap-3 sm:grid-cols-2">
      {SHOWN_STATS.map(key => {
        const { value, definition } = stats.metrics[key]
        const selected = key === metric
        const counted = observations(stats.recentMatches, key).length
        const scale = STAT_SCALE[key]
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(key)}
            className={`relative flex min-h-28 flex-col items-start rounded-xl border border-border px-5 py-4 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text ${
              selected ? 'bg-surface-2' : 'bg-surface'
            }`}
          >
            <span className="text-sm font-semibold text-muted">{statLabels[key]}</span>
            <span className={`figure mt-1 text-4xl whitespace-nowrap tabular-nums ${value === null ? 'text-subtle' : ''}`}>
              {formatStat(key, value)}
            </span>
            <StatMeter value={value} max={scale} />
            <span className="mt-1.5 text-xs text-subtle">
              {value === null ? 'Unavailable from the source' : `of ${scale}${counted ? ` · ${counted} ${counted === 1 ? 'match' : 'matches'}` : ''}`}
            </span>
            {definition && <span className="text-xs text-subtle">{definition.replace(/hltv/ig, '').replace(/\s+/g, ' ').trim()}</span>}
            <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-0.5 rounded-b-xl transition-colors duration-150 ${selected ? 'bg-accent' : 'bg-transparent'}`} />
          </button>
        )
      })}
    </div>
  )
}

const W = 640
const H = 220
const PAD = 32

function PerformanceChart({ lines, metric, selectedId, onSelect }: {
  lines: MatchStatLine[]; metric: StatKey; selectedId: string | null; onSelect: (id: string) => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const points = observations(lines, metric)
  if (!canChart(lines, metric)) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        Not enough comparable matches to chart {statLabels[metric]}. A chart needs at least two matches with this value.
      </p>
    )
  }
  const { coords, min, max } = plot(points, W, H, PAD)
  const path = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const labelled = coords.find(point => point.line.matchId === (hoverId ?? selectedId))
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${statLabels[metric]} per match across ${points.length} matches, from ${formatStat(metric, min)} to ${formatStat(metric, max)}. The same values are listed below.`}
        className="h-auto w-full"
        onMouseLeave={() => setHoverId(null)}
      >
        <defs>
          <linearGradient id="fz-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[PAD, H / 2, H - PAD].map(y => <line key={y} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="var(--color-border)" strokeWidth="1" />)}
        <text x={PAD - 6} y={PAD + 4} textAnchor="end" fontSize="12" fill="var(--color-subtle)">{formatStat(metric, max)}</text>
        <text x={PAD - 6} y={H - PAD + 4} textAnchor="end" fontSize="12" fill="var(--color-subtle)">{formatStat(metric, min)}</text>
        <path d={`M${coords[0].x} ${H - PAD} ${path.slice(1)} L${coords.at(-1)!.x} ${H - PAD} Z`} fill="url(#fz-chart-fill)" className="fz-swap" />
        <path d={path} pathLength={1} className="fz-chart-line" fill="none" stroke="var(--color-accent-text)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((point, index) => {
          const active = point.line.matchId === selectedId
          return (
            <g key={point.line.matchId} onMouseEnter={() => setHoverId(point.line.matchId)} onClick={() => onSelect(point.line.matchId)} className="fz-chart-dot cursor-pointer" style={{ '--i': index } as CSSProperties}>
              <circle cx={point.x} cy={point.y} r="18" fill="transparent" />
              <circle
                cx={point.x} cy={point.y} r={active ? 7 : 5}
                fill={active ? 'var(--color-accent)' : 'var(--color-bg)'}
                stroke={active ? 'var(--color-text)' : 'var(--color-accent-text)'} strokeWidth="2.5"
              />
              <text x={point.x} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--color-subtle)">
                {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(point.line.playedAt))}
              </text>
            </g>
          )
        })}
        {labelled && (
          <text
            x={Math.min(Math.max(labelled.x, PAD + 20), W - PAD - 20)} y={Math.max(labelled.y - 14, 14)}
            textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--color-text)" pointerEvents="none"
          >
            {formatStat(metric, labelled.value)}
          </text>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-subtle">
        {statLabels[metric]} in each match of this period. Select a point or a match below to see its numbers.
      </figcaption>
    </figure>
  )
}

function MatchDetail({ line, standout, metric }: { line: MatchStatLine; standout: boolean; metric: StatKey }) {
  return (
    <div className="fz-swap rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-bold">vs {line.opponent}</h3>
        {standout && <Badge tone="accent">Best {statLabels[metric]} of this period</Badge>}
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {line.tournament} · {formatDate(line.playedAt)}
        {line.result && ` · ${line.result === 'win' ? 'Won' : 'Lost'}${line.score ? ` ${line.score}` : ''}`}
        {line.mapsPlayed !== null && ` · ${line.mapsPlayed} ${line.mapsPlayed === 1 ? 'map' : 'maps'}`}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        {SHOWN_STATS.map(key => (
          <div key={key}>
            <dt className="text-xs font-semibold text-muted">{statLabels[key]}</dt>
            <dd className={`figure mt-1 text-2xl tabular-nums ${line[key] === null ? 'text-subtle' : ''}`}>{formatStat(key, line[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-subtle">
        {line.sourceUrl
          ? <a href={line.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>Match source</a>
          : 'No source link supplied for this match.'}
      </p>
    </div>
  )
}

function AiAnalysis({ playerId, stats }: { playerId: string; stats: PlayerStats }) {
  const insight = useQuery({
    queryKey: ['player', playerId, 'insight', stats.snapshotId],
    queryFn: () => api.getPlayerInsight(playerId, stats.snapshotId),
  })
  let body
  if (insight.isPending) body = <LoadingState label="Loading the analysis…" />
  else if (insight.isError) {
    body = <Notice tone="danger">The analysis could not be loaded. The statistics on this page are unaffected.</Notice>
  } else if (insight.data.snapshotId !== stats.snapshotId) {
    // Never show an older explanation beside newer numbers.
    body = <Notice tone="warn">An analysis exists for an older set of statistics, so it is not shown.</Notice>
  } else if (insight.data.status === 'pending') {
    body = <Notice>The analysis for these statistics is being generated. Check back shortly.</Notice>
  } else if (insight.data.status !== 'ready') {
    body = <p className="text-sm text-muted">No analysis has been generated for these statistics yet.</p>
  } else {
    const data = insight.data
    const extraLabels: Record<string, string> = {
      'metrics.kastPercent': 'KAST',
      'metrics.killsPerRound': 'Kills per round',
      'metrics.deathsPerRound': 'Deaths per round',
    }
    const refLabel = (ref: string) => extraLabels[ref] ?? statLabels[ref.replace('metrics.', '') as StatKey] ?? ref
    body = (
      <div className="space-y-4">
        {data.isDemo && <SampleBadge label="Placeholder text, not a real AI result" />}
        <p>{data.summary}</p>
        {data.observations.length > 0 && (
          <ul className="space-y-3">
            {data.observations.map((item, index) => (
              <li key={index} className="border-t border-border pt-3 text-sm">
                <p>{item.text}</p>
                {item.metricRefs.length > 0 && (
                  <p className="mt-1.5 text-xs text-subtle">Based on: {item.metricRefs.map(refLabel).join(', ')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.limitations.length > 0 && (
          <div className="text-xs text-subtle">
            <p className="font-semibold">Limits of this analysis</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
        <p className="text-xs text-subtle">Meta AI · {formatDateTime(data.generatedAt)}</p>
      </div>
    )
  }
  return (
    <aside aria-labelledby="ai-analysis-title" className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="ai-analysis-title" className="heading-section">Player analysis</h3>
        <span className="rounded-md border border-info/40 bg-info/10 px-2 py-0.5 text-xs font-semibold text-info">Meta AI</span>
      </div>
      {body}
    </aside>
  )
}

function Analytics({ player }: { player: Player }) {
  const stats = useQuery({ queryKey: ['player', player.id, 'stats'], queryFn: () => api.getPlayerStats(player.id) })
  const [metric, setMetric] = useState<StatKey>('rating')
  const [picked, setPicked] = useState<string | null>(null)

  if (player.rosterStatus === 'coach') {
    return (
      <Section title="Performance">
        <EmptyState title="Coaches have no player statistics">
          Rating and ADR describe players in the server. Team matches and tournament progress are below.
        </EmptyState>
      </Section>
    )
  }
  if (stats.isPending) return <Section title="Performance"><LoadingState label="Loading statistics…" /></Section>
  if (stats.isError) {
    const missing = stats.error instanceof ApiError && stats.error.status === 404
    return (
      <Section title="Performance">
        {missing
          ? <EmptyState title="No statistics imported for this player yet">Numbers appear here once a sourced snapshot is imported. Nothing is estimated in the meantime.</EmptyState>
          : <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
      </Section>
    )
  }

  const data = stats.data
  const lines = data.recentMatches
  const best = standoutMatch(lines, metric)
  const selected = lines.find(line => line.matchId === picked) ?? best ?? lines.at(-1) ?? null
  const sorted = [...lines].sort((a, b) => b.playedAt.localeCompare(a.playedAt))
  return (
    <Section
      title="Performance"
      meta={`${data.period.label.replace(/hltv/ig, '').replace(/\s+/g, ' ').trim()}${data.period.start && data.period.end ? ` · ${formatDate(data.period.start)} to ${formatDate(data.period.end)}` : ''}${data.mapsPlayed !== null ? ` · ${data.mapsPlayed} maps` : ''}`}
      actions={data.isDemo ? <SampleBadge label="Demo numbers — not real statistics" /> : undefined}
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <StatRail stats={data} metric={metric} onSelect={setMetric} />
          {canChart(lines, metric) ? (
            <PerformanceChart key={metric} lines={lines} metric={metric} selectedId={selected?.matchId ?? null} onSelect={setPicked} />
          ) : (
            <SeasonChart playerId={player.id} />
          )}
          {sorted.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">Recent matches</h3>
              <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {sorted.map(line => {
                  const active = line.matchId === selected?.matchId
                  return (
                    <li key={line.matchId}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPicked(line.matchId)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                          active ? 'border-accent bg-surface-2' : 'border-border bg-surface hover:border-border-strong'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">vs {line.opponent}</span>
                          <span className="text-xs text-subtle">
                            {formatDate(line.playedAt)}
                            {line.result && ` · ${line.result === 'win' ? 'W' : 'L'}${line.score ? ` ${line.score}` : ''}`}
                          </span>
                        </span>
                        <span className="figure shrink-0 text-xl whitespace-nowrap tabular-nums">{formatStat(metric, line[metric])}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {selected && <MatchDetail key={`-${metric}`} line={selected} metric={metric} standout={selected.matchId === best?.matchId} />}
        </div>
        <AiAnalysis playerId={player.id} stats={data} />
      </div>
      <p className="mt-5 text-sm text-subtle">Numbers updated {formatDateTime(data.retrievedAt)}.</p>
    </Section>
  )
}

// ---------- Section 2: matches ----------

function MatchRow({ match, market }: { match: EsportsMatch; market?: PredictionMarket }) {
  const opponent = match.participants.slice(1).join(', ') || 'Opponent to be confirmed'
  const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', timeZone: match.timezone }).format(new Date(match.startsAt))
  const month = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: match.timezone }).format(new Date(match.startsAt))
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <div className="fz-date-block" aria-hidden="true">
        <span className="figure text-2xl leading-none">{day}</span>
        <span className="text-xs font-semibold text-muted uppercase">{month}</span>
      </div>
      <div className="min-w-0">
        <p className="font-bold">vs {opponent}</p>
        <p className="text-sm text-muted">
          {match.tournament.name}{match.stage ? ` · ${match.stage}` : ''}
        </p>
        <p className="text-sm text-subtle">{formatDateTime(match.startsAt, match.timezone)}</p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-3 sm:col-start-3 sm:justify-end">
        {match.result
          ? <Badge tone={match.result.winner === match.participants[0] ? 'ok' : 'gray'}>
              {match.result.winner === match.participants[0] ? 'Won' : 'Lost'}{match.result.score ? ` ${match.result.score}` : ''}
            </Badge>
          : match.status === 'live' ? <Badge tone="accent">Live</Badge> : null}
        {market && <PickStateBadge state={pickState(market)} />}
        <Link to={`/matches#${match.id}`} className={`${linkClass} text-sm`}>
          {market && pickState(market) === 'claimable'
            ? 'Redeem points'
            : market && market.state === 'open' && !market.myPick ? 'Make a prediction' : 'Match details'}
        </Link>
      </div>
    </li>
  )
}

function Schedule({ player }: { player: Player }) {
  const schedule = useQuery({ queryKey: ['player', player.id, 'schedule'], queryFn: () => api.getPlayerSchedule(player.id) })
  const markets = useQuery({ queryKey: ['markets'], queryFn: api.listMarkets })
  const calendarLink = (
    <Link to="/matches" className={linkButtonClass}><Icon name="calendar" /> Open the full FaZe calendar</Link>
  )
  if (schedule.isPending) return <Section title="Matches and tournament progress"><LoadingState label="Loading matches…" /></Section>
  if (schedule.isError) {
    return <Section title="Matches and tournament progress" actions={calendarLink}><ErrorState error={schedule.error} onRetry={() => schedule.refetch()} /></Section>
  }
  const { matches, tournaments } = schedule.data
  const marketFor = (id: string) => markets.data?.find(market => market.matchId === id)
  const upcoming = matches.filter(match => match.status === 'upcoming' || match.status === 'live').sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const recent = matches.filter(match => match.status === 'finished').sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 12)
  return (
    <Section
      title="Matches and tournament progress"
      meta={matches.some(match => match.isDemo) ? <SampleBadge label="Placeholder fixtures" /> : undefined}
      actions={calendarLink}
    >
      {tournaments.length > 0 && (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2">
          {tournaments.map(item => (
            <li key={item.id} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="flex items-center gap-2 font-bold"><Icon name="trophy" className="size-4 text-accent-text" />{item.name}</p>
              <p className="mt-1 text-sm text-muted">
                {item.stage ? `Current stage: ${item.stage}` : 'Stage not listed'}
                {item.standing ? ` · ${item.standing}` : ''}
              </p>
              <p className="mt-1 text-xs text-subtle">
                Checked {formatDateTime(item.refreshedAt)}
                {item.sourceUrl && <> · <a href={item.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>Bracket and source</a></>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-muted">Upcoming</h3>
          {upcoming.length
            ? <ul className="divide-y divide-border">{upcoming.map(match => <MatchRow key={match.id} match={match} market={marketFor(match.id)} />)}</ul>
            : <p className="py-3 text-sm text-muted">No upcoming matches are listed.</p>}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted">Recent results</h3>
          {recent.length
            ? <ul className="divide-y divide-border">{recent.map(match => <MatchRow key={match.id} match={match} market={marketFor(match.id)} />)}</ul>
            : <p className="py-3 text-sm text-muted">No results are listed yet.</p>}
        </div>
      </div>
    </Section>
  )
}

// ---------- Section 3: highlights ----------

const VIDEO_ID = /^[\w-]{6,20}$/
const isYouTubeLink = (url: string) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)

function HighlightsSection({ player }: { player: Player }) {
  const highlights = useQuery({ queryKey: ['player', player.id, 'highlights'], queryFn: () => api.getPlayerHighlights(player.id) })
  const [playing, setPlaying] = useState<HighlightVideo | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => { if (playing) frame.current?.focus() }, [playing])

  const title = 'Highlights'
  if (highlights.isPending) return <Section title={title}><LoadingState label="Loading highlights…" /></Section>
  if (highlights.isError) {
    return <Section title={title}><ErrorState error={highlights.error} onRetry={() => highlights.refetch()} /></Section>
  }
  const { items, fetchedAt, isDemo } = highlights.data
  if (!items.length) {
    return (
      <Section title={title}>
        <EmptyState title={`No highlights for ${player.handle} yet`}>
          Only videos that actually feature this player are shown here, so this stays empty until some are found.
        </EmptyState>
      </Section>
    )
  }
  return (
    <Section
      title={title}
      meta={fetchedAt ? `From YouTube · checked ${formatDateTime(fetchedAt)}` : undefined}
      actions={isDemo ? <SampleBadge label="Placeholders, no real videos" /> : undefined}
    >
      {playing && (
        <div ref={frame} tabIndex={-1} className="mb-5 overflow-hidden rounded-xl border border-border bg-black focus-visible:outline-2 focus-visible:outline-accent-text">
          <div className="aspect-video">
            <iframe
              title={playing.title}
              src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1${playing.startSeconds ? `&start=${Math.floor(playing.startSeconds)}` : ''}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              className="size-full"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3">
            <p className="min-w-0 truncate text-sm font-semibold">{playing.title}</p>
            <div className="flex items-center gap-2">
              {isYouTubeLink(playing.watchUrl) && (
                <a href={playing.watchUrl} target="_blank" rel="noreferrer" className={`${linkClass} inline-flex items-center gap-1 text-sm`}>
                  Watch on YouTube <Icon name="external" />
                </a>
              )}
              <Button size="sm" icon="close" onClick={() => setPlaying(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((video, index) => {
          const embeddable = VIDEO_ID.test(video.videoId)
          const linkable = isYouTubeLink(video.watchUrl)
          const thumb = (
            <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg border border-border bg-surface-2">
              {video.thumbnailUrl
                ? <img src={video.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
                : <span className="px-3 text-center text-xs text-subtle">No thumbnail supplied</span>}
              {(embeddable || linkable) && (
                <span className="absolute grid size-12 place-items-center rounded-full bg-accent text-white shadow-[0_6px_20px_rgb(0_0_0/0.5)]">
                  <Icon name="play" className="size-5" />
                </span>
              )}
              {embeddable && video.startSeconds ? (
                <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
                  Starts at {Math.floor(video.startSeconds / 60)}:{String(Math.floor(video.startSeconds % 60)).padStart(2, '0')}
                </span>
              ) : null}
            </div>
          )
          const caption = (
            <>
              <p className="mt-2 line-clamp-2 font-semibold">{video.title}</p>
              <p className="text-sm text-muted">{video.channelTitle} · {formatDate(video.publishedAt)}</p>
            </>
          )
          return (
            <li key={video.videoId || index}>
              {embeddable ? (
                <button type="button" onClick={() => setPlaying(video)} className="group block w-full text-left" aria-label={`Play: ${video.title}`}>
                  {thumb}{caption}
                </button>
              ) : linkable ? (
                <a href={video.watchUrl} target="_blank" rel="noreferrer" className="group block">{thumb}{caption}</a>
              ) : (
                <div>{thumb}{caption}<p className="text-xs text-subtle">No video is attached to this placeholder.</p></div>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

// ---------- Section 4: fan events ----------

function FanEventsSection() {
  const { fan } = useFan()
  const events = useQuery({ queryKey: ['fan', 'events'], queryFn: api.listFanEvents })
  const points = useQuery({ queryKey: ['fan', 'points'], queryFn: api.getMyPoints, enabled: Boolean(fan) })
  const title = 'Fan events and exclusive experiences'
  const all = <Link to="/" className={linkButtonClass}>All fan events</Link>
  if (events.isPending) return <Section title={title}><LoadingState label="Loading events…" /></Section>
  if (events.isError) return <Section title={title} actions={all}><ErrorState error={events.error} onRetry={() => events.refetch()} /></Section>
  const open = events.data.filter(event => !eventUnavailable(event)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return (
    <Section title={title} actions={all}>
      <p className="mb-4 max-w-[70ch] text-sm text-muted">
        These are FaZe community events. No player is confirmed to appear at any of them. You apply, talk to an AI host, and event staff decide who is invited.
      </p>
      {!open.length ? (
        <EmptyState title="No events are open right now">New community nights and exclusive experiences are listed here when they open.</EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {open.map(event => {
            const needed = event.minimumPoints ?? 0
            const balance = points.data?.balance
            return (
              <li key={event.id}>
                <Link
                  to={`/events/${event.id}`}
                  className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg font-bold">{event.title}</span>
                    {needed > 0
                      ? <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-text"><Icon name="lock" className="size-3.5" /> Exclusive · {needed} points</span>
                      : <span className="text-xs font-semibold text-muted">Open to all fans</span>}
                  </span>
                  <span className="text-sm text-muted">{formatDateTime(event.startsAt, event.timezone)} · {event.location}</span>
                  {needed > 0 && balance !== undefined && (
                    <span className="text-sm">
                      {balance >= needed
                        ? `You have ${balance} points, so you can apply.`
                        : `You have ${balance} of the ${needed} points needed to apply.`}
                    </span>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold">
                    View details and eligibility <Icon name="arrowRight" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

// ---------- Page ----------

export function PlayerPage() {
  const { id = '' } = useParams()
  const player = useQuery({ queryKey: ['player', id], queryFn: () => api.getPlayer(id) })
  return (
    <div className="space-y-8">
      <PlayerSwitcher currentId={id} />
      {player.isPending ? <LoadingState label="Loading the player…" />
        : player.isError ? <ErrorState error={player.error} onRetry={() => player.refetch()} />
        : (
          // Keyed so chart and video selections reset when switching players.
          <div key={player.data.id} className="space-y-20 sm:space-y-28">
            <Identity player={player.data} />
            <Analytics player={player.data} />
            <Schedule player={player.data} />
            <HighlightsSection player={player.data} />
            <FanEventsSection />
          </div>
        )}
    </div>
  )
}
