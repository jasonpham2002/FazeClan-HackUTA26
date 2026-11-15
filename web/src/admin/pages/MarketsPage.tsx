import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import type { AdminMarket, MarketInput, MarketType } from '../../api/types'
import { Button, Card, EmptyState, ErrorState, Field, inputClass, linkClass, LoadingState, Notice, Section } from '../../components/ui/ui'
import { MarketStateBadge, SampleBadge } from '../../fan/fazeid-ui'
import { formatDateTime } from '../../lib/format'

const PLACEMENT_OPTIONS = 'Champion\nRunner-up\nSemi-finalist\nQuarter-finals or earlier'

function SettleForm({ market, onDone }: { market: AdminMarket; onDone: () => void }) {
  const queries = useQueryClient()
  const [optionId, setOptionId] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [confirming, setConfirming] = useState(false)
  const settle = useMutation({
    mutationFn: () => api.settleMarket(market.id, { optionId, sourceUrl }),
    onSuccess: onDone,
    onSettled: () => queries.invalidateQueries({ queryKey: ['admin', 'markets'] }),
  })
  const winners = market.picksByOption[optionId] ?? 0
  const chosen = market.options.find(option => option.id === optionId)
  const id = `settle-${market.id}`

  return (
    <form
      className="mt-4 space-y-4 rounded-lg border border-border-strong bg-surface-2 p-4"
      onSubmit={event => { event.preventDefault(); if (optionId && sourceUrl.trim()) setConfirming(true) }}
    >
      <fieldset disabled={settle.isPending || confirming} className="space-y-4">
        <legend className="font-bold">Confirm the result</legend>
        {market.state === 'open' && (
          <Notice tone="warn">Picks are still open. Settling closes this prediction for everyone.</Notice>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {market.options.map(option => (
            <label key={option.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${optionId === option.id ? 'border-accent bg-surface' : 'border-border'}`}>
              <span className="flex items-center gap-3 font-semibold">
                <input type="radio" name={id} value={option.id} checked={optionId === option.id} onChange={() => setOptionId(option.id)} className="size-4 accent-[var(--color-accent)]" />
                {option.label}
              </span>
              <span className="text-muted">{market.picksByOption[option.id] ?? 0} picks</span>
            </label>
          ))}
        </div>
        <Field label="Source that confirms this result" htmlFor={`${id}-source`} hint="A link to the official result. Do not settle from a guess or an unverified import.">
          <input id={`${id}-source`} type="url" required placeholder="https://" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={!optionId || !sourceUrl.trim()}>Review settlement</Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
      </fieldset>
      {confirming && (
        <div role="alertdialog" aria-labelledby={`${id}-confirm`} className="space-y-3 rounded-lg border border-accent bg-surface p-4">
          <p id={`${id}-confirm`} className="font-bold">
            Settle as “{chosen?.label}” and award {market.award} points to {winners} {winners === 1 ? 'fan' : 'fans'}?
          </p>
          <p className="text-sm text-muted">
            This awards {winners * market.award} points in total and cannot be edited afterwards. {market.pickCount - winners} other {market.pickCount - winners === 1 ? 'pick gets' : 'picks get'} nothing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={settle.isPending} onClick={() => settle.mutate()}>
              {settle.isPending ? 'Settling…' : 'Settle and award points'}
            </Button>
            <Button disabled={settle.isPending} onClick={() => { setConfirming(false); settle.reset() }}>Go back</Button>
          </div>
          {settle.isError && <ErrorState error={settle.error} />}
          {settle.isError && <p className="text-sm text-danger">Not settled. No points were awarded.</p>}
        </div>
      )}
    </form>
  )
}

function MarketRow({ market }: { market: AdminMarket }) {
  const [settling, setSettling] = useState(false)
  const winning = market.options.find(option => option.id === market.result?.optionId)
  return (
    <li className="border-t border-border py-5 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-bold">{market.title}</h3>
          <p className="text-sm text-muted">
            {market.type === 'match_winner' ? 'Match winner' : 'Tournament placement'} · {market.award} points for a correct pick · {market.pickCount} {market.pickCount === 1 ? 'pick' : 'picks'}
          </p>
          <p className="text-sm text-subtle">
            {market.state === 'open' ? 'Locks' : 'Locked'} {formatDateTime(market.locksAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {market.isDemo && <SampleBadge />}
          <MarketStateBadge state={market.state} />
          {(market.state === 'open' || market.state === 'locked') && !settling && (
            <Button size="sm" onClick={() => setSettling(true)}>Settle result</Button>
          )}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {market.options.map(option => (
          <li key={option.id} className={option.id === market.result?.optionId ? 'font-bold text-ok' : 'text-muted'}>
            {option.label}: {market.picksByOption[option.id] ?? 0}
          </li>
        ))}
      </ul>
      {market.result && (
        <p className="mt-2 text-sm">
          Settled as <strong>{winning?.label ?? 'Unknown option'}</strong> on {formatDateTime(market.result.settledAt)}.{' '}
          {(market.picksByOption[market.result.optionId] ?? 0) * market.award} points awarded.{' '}
          <a href={market.result.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>Source</a>
        </p>
      )}
      {settling && <SettleForm market={market} onDone={() => setSettling(false)} />}
    </li>
  )
}

function CreateMarket() {
  const queries = useQueryClient()
  const matches = useQuery({ queryKey: ['matches'], queryFn: api.listMatches })
  const [type, setType] = useState<MarketType>('match_winner')
  const [matchId, setMatchId] = useState('')
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState('')
  const [award, setAward] = useState('100')
  const [locksAt, setLocksAt] = useState('')
  const [saved, setSaved] = useState(false)
  const upcoming = (matches.data ?? []).filter(match => match.status === 'upcoming')

  const create = useMutation({
    mutationFn: () => {
      const input: MarketInput = {
        type, title, matchId: type === 'match_winner' ? matchId || null : null, tournamentId: null,
        options: options.split('\n'), award: Number(award), locksAt: locksAt ? new Date(locksAt).toISOString() : '',
      }
      return api.createMarket(input)
    },
    onSuccess: () => { setSaved(true); setTitle(''); setOptions(''); setMatchId(''); setLocksAt('') },
    onSettled: () => queries.invalidateQueries({ queryKey: ['admin', 'markets'] }),
  })

  function pickMatch(id: string) {
    setMatchId(id)
    const match = upcoming.find(item => item.id === id)
    if (!match) return
    // Prefill from the fixture; staff can still edit every field.
    setTitle(`${match.participants.join(' vs ')}${match.stage ? ` · ${match.stage}` : ''}`)
    setOptions(match.participants.join('\n'))
    const local = new Date(Date.parse(match.startsAt) - new Date(match.startsAt).getTimezoneOffset() * 60000)
    setLocksAt(local.toISOString().slice(0, 16))
  }

  return (
    <Card title="New prediction">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); setSaved(false); if (!create.isPending) create.mutate() }}>
        <Field label="Type" htmlFor="market-type">
          <select
            id="market-type" value={type} className={inputClass}
            onChange={event => { const next = event.target.value as MarketType; setType(next); if (next === 'placement' && !options.trim()) setOptions(PLACEMENT_OPTIONS) }}
          >
            <option value="match_winner">Match winner</option>
            <option value="placement">Tournament placement</option>
          </select>
        </Field>
        {type === 'match_winner' && (
          <Field label="Match" htmlFor="market-match" hint={matches.isError ? 'Matches could not be loaded. Fill in the fields by hand.' : 'Choosing a match fills in the fields below.'}>
            <select id="market-match" value={matchId} onChange={event => pickMatch(event.target.value)} className={inputClass}>
              <option value="">No linked match</option>
              {upcoming.map(match => <option key={match.id} value={match.id}>{match.participants.join(' vs ')} · {formatDateTime(match.startsAt)}</option>)}
            </select>
          </Field>
        )}
        <div className="md:col-span-2">
          <Field label="Title fans see" htmlFor="market-title">
            <input id="market-title" required value={title} onChange={event => setTitle(event.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Options, one per line" htmlFor="market-options" hint="At least two. They are frozen once fans start picking, so make them explicit and non-overlapping.">
            <textarea id="market-options" required rows={4} value={options} onChange={event => setOptions(event.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Points for a correct pick" htmlFor="market-award">
          <input id="market-award" type="number" min={1} step={1} required value={award} onChange={event => setAward(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Picks lock at" htmlFor="market-lock" hint="In your local time. The server enforces this deadline.">
          <input id="market-lock" type="datetime-local" required value={locksAt} onChange={event => setLocksAt(event.target.value)} className={inputClass} />
        </Field>
        <div className="space-y-3 md:col-span-2">
          <Button type="submit" variant="primary" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create prediction'}</Button>
          {create.isError && <ErrorState error={create.error} />}
          {create.isError && <p className="text-sm text-danger">Not saved.</p>}
          {saved && !create.isPending && <Notice tone="ok">Prediction created. It is in the list below as read back from the server.</Notice>}
        </div>
      </form>
    </Card>
  )
}

export function MarketsPage() {
  const markets = useQuery({ queryKey: ['admin', 'markets'], queryFn: api.listAdminMarkets })
  const order = { locked: 0, open: 1, settled: 2, void: 3 } as const
  const sorted = [...(markets.data ?? [])].sort((a, b) => order[a.state] - order[b.state] || a.locksAt.localeCompare(b.locksAt))
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="title-display text-4xl sm:text-5xl">Predictions</h1>
        <p className="max-w-[70ch] text-muted">
          Create free predictions for fans and confirm results. Settling awards points to every fan with the correct pick, once.
        </p>
      </header>
      <Section title="All predictions" meta={markets.data ? `${markets.data.length} total` : undefined}>
        {markets.isPending ? <LoadingState label="Loading predictions…" />
          : markets.isError ? <ErrorState error={markets.error} onRetry={() => markets.refetch()} />
          : !sorted.length ? <EmptyState title="No predictions yet">Create the first one below.</EmptyState>
          : <ul>{sorted.map(market => <MarketRow key={market.id} market={market} />)}</ul>}
      </Section>
      <CreateMarket />
    </div>
  )
}
