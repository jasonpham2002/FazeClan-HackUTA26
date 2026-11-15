import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { Reward, RewardKind } from '../api/types'
import { Icon } from '../components/ui/Icon'
import { Badge, Button, EmptyState, ErrorState, linkButtonClass, linkClass, LoadingState, Notice, Section } from '../components/ui/ui'
import { formatDateTime } from '../lib/format'
import { pageTitle, SampleBadge, useFan } from './fazeid-ui'
import { eventUnavailable } from './logic'

export const rewardKindLabels: Record<RewardKind, string> = {
  merch: 'Merchandise',
  raffle: 'Raffle entry',
  early_access: 'Early access',
  priority: 'Priority access',
}

export const redemptionLabels = { requested: 'Requested', fulfilled: 'Fulfilled', canceled: 'Canceled' } as const

function RewardRow({ reward, balance, canRedeem }: { reward: Reward; balance: number | null; canRedeem: boolean }) {
  const queries = useQueryClient()
  // One key per confirmation, reused if the request is retried, so a retry can never charge twice.
  const [key, setKey] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const redeem = useMutation({
    mutationFn: () => api.redeemReward(reward.id, key!),
    onSuccess: () => { setKey(null); setDone(true) },
    onSettled: () => Promise.all([
      queries.invalidateQueries({ queryKey: ['rewards'] }),
      queries.invalidateQueries({ queryKey: ['fan', 'points'] }),
      queries.invalidateQueries({ queryKey: ['fan', 'redemptions'] }),
    ]),
  })
  const soldOut = reward.stock !== null && reward.stock <= 0
  const short = balance !== null && balance < reward.cost
  let blocked: string | null = null
  if (!reward.active) blocked = 'Proposed benefit. Not available to redeem yet.'
  else if (soldOut) blocked = 'Out of stock.'
  else if (!canRedeem) blocked = 'Sign in as a fan to redeem.'
  else if (short) blocked = `You need ${reward.cost - balance!} more points.`

  return (
    <li className="grid gap-4 border-t border-border py-5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-lg font-bold">{reward.title}</h3>
          <span className="text-sm text-muted">{rewardKindLabels[reward.kind] ?? reward.kind}</span>
          {reward.isDemo && <SampleBadge label="Proposed, sample" />}
        </div>
        <p className="text-muted">{reward.description}</p>
        <p className="text-sm text-subtle">{reward.terms}</p>
        <p className="text-sm">
          {reward.stock === null ? 'Not stock-limited' : soldOut ? 'Out of stock' : `${reward.stock} left`}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <p className="figure text-3xl tabular-nums">{reward.cost}<span className="ml-1.5 font-sans text-sm font-semibold text-muted">points</span></p>
        {blocked ? <p className="text-sm text-muted sm:text-right">{blocked}</p>
          : key === null ? <Button variant="primary" icon="gift" onClick={() => { setDone(false); redeem.reset(); setKey(crypto.randomUUID()) }}>Redeem</Button>
          : (
            <div className="space-y-2 rounded-lg border border-border-strong bg-surface-2 p-3 sm:max-w-xs">
              <p className="text-sm">Spend {reward.cost} of your {balance} points on {reward.title}?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={redeem.isPending} onClick={() => redeem.mutate()}>
                  {redeem.isPending ? 'Redeeming…' : redeem.isError ? 'Try again' : 'Confirm'}
                </Button>
                <Button size="sm" disabled={redeem.isPending} onClick={() => { setKey(null); redeem.reset() }}>Cancel</Button>
              </div>
            </div>
          )}
        {redeem.isError && (
          <p role="alert" className="max-w-xs text-sm text-danger sm:text-right">
            Not redeemed. {redeem.error instanceof ApiError ? redeem.error.message : 'Try again.'} No points were taken.
          </p>
        )}
        {done && <p role="status" className="max-w-xs text-sm text-ok sm:text-right">Redemption recorded. It is listed in My FaZe ID.</p>}
      </div>
    </li>
  )
}

export function RewardsPage() {
  const { fan, signedOut } = useFan()
  const rewards = useQuery({ queryKey: ['rewards'], queryFn: api.listRewards })
  const points = useQuery({ queryKey: ['fan', 'points'], queryFn: api.getMyPoints, enabled: Boolean(fan) })
  const events = useQuery({ queryKey: ['fan', 'events'], queryFn: api.listFanEvents })
  const balance = points.data?.balance ?? null
  const exclusive = (events.data ?? []).filter(event => (event.minimumPoints ?? 0) > 0 && !eventUnavailable(event))

  return (
    <div className="space-y-10">
      <header className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl space-y-4">
          <h1 className={pageTitle}>Rewards and access</h1>
          <p className="text-lg text-muted">
            Points come from correct predictions and confirmed attendance. Spend them on rewards, or keep them to qualify for exclusive experiences.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-5 py-4">
          <p className="text-sm font-semibold text-muted">Your balance</p>
          {fan
            ? points.isPending ? <div className="skeleton mt-2 h-10 w-28" />
              : points.isError ? <p className="mt-1 text-sm text-danger">Could not load your points.</p>
              : <p className="figure mt-1 text-5xl tabular-nums">{balance}<span className="ml-2 font-sans text-base font-semibold text-muted">points</span></p>
            : <p className="mt-1 text-sm">{signedOut ? <Link to="/sign-in" className={linkClass}>Sign in to see your points</Link> : 'Fan accounts earn points.'}</p>}
          {fan && <Link to="/profile" className={`${linkClass} mt-2 inline-block text-sm`}>See how you earned them</Link>}
        </div>
      </header>

      <Section title="Rewards" meta="Proposed benefits for this concept. Nothing here is a FaZe commitment.">
        {rewards.isPending ? <LoadingState label="Loading rewards…" />
          : rewards.isError ? <ErrorState error={rewards.error} onRetry={() => rewards.refetch()} />
          : !rewards.data.length ? <EmptyState title="No rewards are listed yet" />
          : <ul>{rewards.data.map(reward => <RewardRow key={reward.id} reward={reward} balance={balance} canRedeem={Boolean(fan) && balance !== null} />)}</ul>}
      </Section>

      <Section title="Exclusive experiences" meta="Points unlock the application. They are not spent.">
        {events.isPending ? <LoadingState label="Loading events…" />
          : events.isError ? <ErrorState error={events.error} onRetry={() => events.refetch()} />
          : !exclusive.length ? <EmptyState title="No exclusive experiences are open right now" />
          : (
            <ul className="grid gap-4 md:grid-cols-2">
              {exclusive.map(event => {
                const needed = event.minimumPoints ?? 0
                const eligible = balance !== null && balance >= needed
                return (
                  <li key={event.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-bold">{event.title}</h3>
                      {balance !== null && <Badge tone={eligible ? 'ok' : 'warn'}>{eligible ? 'You can apply' : `${needed - balance} more points needed`}</Badge>}
                    </div>
                    <p className="text-sm text-muted">{formatDateTime(event.startsAt, event.timezone)} · {event.location}</p>
                    <p className="flex items-center gap-1.5 text-sm"><Icon name="lock" className="size-4 text-accent-text" /> Needs {needed} points to apply</p>
                    <p className="text-sm text-muted">Then an AI interview, and event staff decide who is invited. Qualifying does not guarantee a place.</p>
                    <Link to={`/events/${event.id}`} className={`${linkButtonClass} mt-2 self-start`}>View event</Link>
                  </li>
                )
              })}
            </ul>
          )}
      </Section>

      <Notice>
        Earn more by <Link to="/matches" className={linkClass}>making predictions</Link> on upcoming matches.
      </Notice>
    </div>
  )
}
