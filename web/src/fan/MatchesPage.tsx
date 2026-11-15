import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { EsportsMatch, PredictionMarket } from '../api/types'
import { Badge, Button, EmptyState, ErrorState, linkButtonClass, linkClass, LoadingState, Notice, Section } from '../components/ui/ui'
import { formatDateTime } from '../lib/format'
import { pageTitle, PickStateBadge, pickState, SampleBadge, useFan } from './fazeid-ui'

function describeLock(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (!Number.isFinite(minutes) || minutes <= 0) return 'at the deadline'
  if (minutes < 60) return `in about ${minutes} min`
  if (minutes < 48 * 60) return `in about ${Math.round(minutes / 60)} h`
  return `in about ${Math.round(minutes / 1440)} days`
}

export function MarketCard({ market }: { market: PredictionMarket }) {
  const { fan, signedOut } = useFan()
  const queries = useQueryClient()
  const [choice, setChoice] = useState('')
  const state = pickState(market)
  const submit = useMutation({
    mutationFn: () => api.submitPick(market.id, choice),
    // Whatever happened, show what the server now has: the pick is "submitted" only when it is read back.
    onSettled: () => queries.invalidateQueries({ queryKey: ['markets'] }),
  })
  const label = (optionId?: string) => market.options.find(option => option.id === optionId)?.label ?? 'Unknown option'
  const name = `pick-${market.id}`

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-bold">{market.type === 'match_winner' ? 'Who wins?' : 'Where do they finish?'}</h3>
          <p className="text-sm text-muted">{market.title}</p>
        </div>
        <PickStateBadge state={state} />
      </div>
      <p className="mt-2 text-sm">
        Free to enter. A correct pick earns <strong>{market.award} points</strong>.
      </p>

      {state === 'open' && (
        fan ? (
          <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); if (choice && !submit.isPending) submit.mutate() }}>
            <fieldset disabled={submit.isPending}>
              <legend className="sr-only">Your pick for {market.title}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {market.options.map(option => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                      choice === option.id ? 'border-accent bg-surface-2' : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <input type="radio" name={name} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} className="size-4 accent-[var(--color-accent)]" />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={!choice || submit.isPending}>
                {submit.isPending ? 'Saving…' : 'Submit pick'}
              </Button>
              <p className="text-sm text-muted">Picks are final. Locks {describeLock(market.locksAt)}: {formatDateTime(market.locksAt)}.</p>
            </div>
            {submit.isError && (
              <Notice tone="danger">
                Pick not saved. {submit.error instanceof ApiError ? submit.error.message : 'Try again.'}
              </Notice>
            )}
          </form>
        ) : (
          <p className="mt-4 text-sm">
            {signedOut ? <Link to="/sign-in" className={linkClass}>Sign in as a fan to make a pick</Link> : 'Sign in as a fan to make a pick.'}
            {' '}Locks {formatDateTime(market.locksAt)}.
          </p>
        )
      )}

      {state !== 'open' && (
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Your pick</dt>
            <dd className="font-semibold">{market.myPick ? label(market.myPick.optionId) : 'No pick made'}</dd>
          </div>
          {market.result && (
            <div>
              <dt className="text-muted">Confirmed result</dt>
              <dd className="font-semibold">
                {label(market.result.optionId)}{' '}
                <a href={market.result.sourceUrl} target="_blank" rel="noreferrer" className={`${linkClass} font-normal`}>Source</a>
              </dd>
            </div>
          )}
        </dl>
      )}
      {state === 'submitted' && <p className="mt-2 text-sm text-muted">Saved {formatDateTime(market.myPick!.submittedAt)}. Locks {formatDateTime(market.locksAt)}.</p>}
      {state === 'locked' && <p className="mt-2 text-sm text-muted">Picks closed {formatDateTime(market.locksAt)}. Staff confirm the result before any points are awarded.</p>}
      {state === 'correct' && <p className="mt-2 text-sm text-ok">You earned {market.award} points. See them in <Link to="/profile" className={linkClass}>My FaZe ID</Link>.</p>}
      {state === 'void' && <p className="mt-2 text-sm text-muted">This prediction was voided. No points were awarded.</p>}
    </div>
  )
}

function MatchBlock({ match, markets }: { match: EsportsMatch; markets: PredictionMarket[] }) {
  const [home, ...others] = match.participants
  return (
    <li id={match.id} className="scroll-mt-24 space-y-3 border-t border-border py-5 first:border-t-0 target:rounded-xl target:outline-2 target:outline-offset-8 target:outline-accent-text">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="title-display text-2xl sm:text-3xl">{home} <span className="text-subtle">vs</span> {others.join(', ') || 'To be confirmed'}</h3>
          <p className="mt-1 text-sm text-muted">{match.tournament.name}{match.stage ? ` · ${match.stage}` : ''}</p>
          <p className="text-sm text-subtle">
            {formatDateTime(match.startsAt, match.timezone)}
            {match.sourceUrl && <> · <a href={match.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>Match source</a></>}
          </p>
        </div>
        {match.result
          ? <Badge tone={match.result.winner === home ? 'ok' : 'gray'}>{match.result.winner} won{match.result.score ? ` ${match.result.score}` : ''}</Badge>
          : match.status === 'live' ? <Badge tone="accent">Live</Badge>
          : match.status === 'canceled' ? <Badge>Canceled</Badge> : <Badge tone="info">Upcoming</Badge>}
      </div>
      {markets.map(market => <MarketCard key={market.id} market={market} />)}
    </li>
  )
}

export function MatchesPage() {
  const matches = useQuery({ queryKey: ['matches'], queryFn: api.listMatches })
  const markets = useQuery({ queryKey: ['markets'], queryFn: api.listMarkets })
  const { hash } = useLocation()
  const ready = matches.isSuccess
  useEffect(() => {
    if (ready && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [ready, hash])

  const list = matches.data ?? []
  const allMarkets = markets.data ?? []
  const forMatch = (id: string) => allMarkets.filter(market => market.matchId === id)
  const upcoming = list.filter(match => match.status === 'upcoming' || match.status === 'live').sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const finished = list.filter(match => match.status === 'finished' || match.status === 'canceled').sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const tournamentMarkets = allMarkets.filter(market => !market.matchId || !list.some(match => match.id === market.matchId))
  const sample = list.some(match => match.isDemo) || allMarkets.some(market => market.isDemo)

  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4 pt-4">
        <h1 className={pageTitle}>Matches and predictions</h1>
        <p className="text-lg text-muted">
          The FaZe CS2 calendar. Call a result before it locks and earn FaZe ID points when staff confirm you were right. It is always free.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {sample && <SampleBadge label="Placeholder fixtures and predictions" />}
          <Link to="/" className={`${linkClass} text-sm`}>Looking for community events? They are listed separately.</Link>
        </div>
      </header>

      {markets.isError && <Notice tone="danger">Predictions could not be loaded, so only the match calendar is shown.</Notice>}

      {matches.isPending ? <LoadingState label="Loading matches…" />
        : matches.isError ? <ErrorState error={matches.error} onRetry={() => matches.refetch()} />
        : !list.length ? <EmptyState title="No matches are listed yet">The calendar fills in when fixtures are imported.</EmptyState>
        : (
          <>
            <Section title="Upcoming matches">
              {upcoming.length
                ? <ul>{upcoming.map(match => <MatchBlock key={match.id} match={match} markets={forMatch(match.id)} />)}</ul>
                : <p className="text-sm text-muted">No upcoming matches are listed.</p>}
            </Section>
            {tournamentMarkets.length > 0 && (
              <Section title="Tournament predictions">
                <div className="grid gap-4 lg:grid-cols-2">{tournamentMarkets.map(market => <MarketCard key={market.id} market={market} />)}</div>
              </Section>
            )}
            <Section title="Recent results">
              {finished.length
                ? <ul>{finished.map(match => <MatchBlock key={match.id} match={match} markets={forMatch(match.id)} />)}</ul>
                : <p className="text-sm text-muted">No results are listed yet.</p>}
            </Section>
          </>
        )}
      <p><Link to="/players" className={linkButtonClass}>Back to the roster</Link></p>
    </div>
  )
}
