/* The FaZe ID parts of the fan profile: points, followed players, picks and redemptions. */
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { EventRecord } from '../api/types'
import { Icon } from '../components/ui/Icon'
import { Badge, Card, EmptyState, ErrorState, linkButtonClass, linkClass, LoadingState, Notice } from '../components/ui/ui'
import { formatDateTime } from '../lib/format'
import { PickStateBadge, pickState, PlayerPortrait } from './fazeid-ui'
import { redemptionLabels } from './RewardsPage'

export function FazeIdProfile() {
  const points = useQuery({ queryKey: ['fan', 'points'], queryFn: api.getMyPoints })
  const follows = useQuery({ queryKey: ['fan', 'follows'], queryFn: api.listFollows })
  const players = useQuery({ queryKey: ['players'], queryFn: api.listPlayers })
  const markets = useQuery({ queryKey: ['markets'], queryFn: api.listMarkets })
  const redemptions = useQuery({ queryKey: ['fan', 'redemptions'], queryFn: api.listMyRedemptions })

  const followed = (players.data ?? []).filter(player => follows.data?.includes(player.id))
  const picks = (markets.data ?? []).filter(market => market.myPick)

  return (
    <>
      <Card
        title="FaZe ID points"
        actions={<Link to="/rewards" className={linkButtonClass}><Icon name="gift" /> Rewards</Link>}
      >
        {points.isPending ? <LoadingState /> : points.isError ? <ErrorState error={points.error} onRetry={() => points.refetch()} /> : (
          <div className="space-y-4">
            <p className="figure text-6xl tabular-nums">{points.data.balance}<span className="ml-2 font-sans text-base font-semibold text-muted">points</span></p>
            {!points.data.entries.length ? (
              <EmptyState title="No points yet">
                Points are added when staff confirm a correct prediction or your attendance. <Link to="/matches" className={linkClass}>Make a prediction</Link>.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {points.data.entries.map(entry => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{entry.reason}</p>
                      <p className="text-sm text-muted">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <span className={`figure text-2xl tabular-nums ${entry.delta > 0 ? 'text-ok' : 'text-muted'}`}>
                      {entry.delta > 0 ? '+' : '−'}{Math.abs(entry.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card title="Players you follow" actions={<Link to="/players" className={`${linkClass} text-sm`}>Roster</Link>}>
        {follows.isPending || players.isPending ? <LoadingState />
          : follows.isError ? <ErrorState error={follows.error} onRetry={() => follows.refetch()} />
          : players.isError ? <ErrorState error={players.error} onRetry={() => players.refetch()} />
          : !followed.length ? <EmptyState title="You are not following anyone yet"><Link to="/players" className={linkClass}>Choose a player</Link> to follow.</EmptyState>
          : (
            <ul className="flex flex-wrap gap-3">
              {followed.map(player => (
                <li key={player.id}>
                  <Link to={`/players/${encodeURIComponent(player.id)}`} className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-2 py-1 pr-4 pl-1 font-semibold transition-colors duration-150 hover:border-border-strong">
                    <PlayerPortrait player={player} className="size-9 rounded-full" />
                    {player.handle}
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card title="Your predictions" actions={<Link to="/matches" className={`${linkClass} text-sm`}>Matches</Link>}>
        {markets.isPending ? <LoadingState /> : markets.isError ? <ErrorState error={markets.error} onRetry={() => markets.refetch()} />
          : !picks.length ? <EmptyState title="No predictions yet"><Link to="/matches" className={linkClass}>See open predictions</Link>.</EmptyState>
          : (
            <ul className="divide-y divide-border">
              {picks.map(market => (
                <li key={market.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{market.title}</p>
                    <p className="text-sm text-muted">
                      Your pick: {market.options.find(option => option.id === market.myPick?.optionId)?.label ?? 'Unknown option'} · {market.award} points if correct
                    </p>
                  </div>
                  <PickStateBadge state={pickState(market)} />
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card title="Redemptions">
        {redemptions.isPending ? <LoadingState /> : redemptions.isError ? <ErrorState error={redemptions.error} onRetry={() => redemptions.refetch()} />
          : !redemptions.data.length ? <EmptyState title="Nothing redeemed yet" />
          : (
            <ul className="divide-y divide-border">
              {redemptions.data.map(item => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div>
                    <p className="font-semibold">{item.rewardTitle}</p>
                    <p className="text-sm text-muted">{item.cost} points · {formatDateTime(item.createdAt)}</p>
                  </div>
                  <Badge tone={item.status === 'fulfilled' ? 'ok' : item.status === 'canceled' ? 'gray' : 'info'}>{redemptionLabels[item.status] ?? item.status}</Badge>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
  )
}

/** Wraps the apply form on an event page: shows the points requirement instead when the fan is short. */
export function EligibilityGate({ event, children }: { event: EventRecord; children: ReactNode }) {
  const needed = event.minimumPoints ?? 0
  const points = useQuery({ queryKey: ['fan', 'points'], queryFn: api.getMyPoints, enabled: needed > 0 })
  if (needed <= 0) return children
  if (points.isPending) return <LoadingState label="Checking your points…" />
  if (points.isError) return <ErrorState error={points.error} onRetry={() => points.refetch()} />
  if (points.data.balance >= needed) return children
  return (
    <div className="space-y-3">
      <Notice tone="warn">
        This experience needs {needed} FaZe ID points to apply. You have {points.data.balance}. Nothing is charged for applying.
      </Notice>
      <Link to="/matches" className={linkButtonClass}>Earn points with predictions</Link>
    </div>
  )
}

/** A short eligibility line for any event page. */
export function EligibilityNote({ event }: { event: EventRecord }) {
  const needed = event.minimumPoints ?? 0
  if (needed <= 0) return null
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <Icon name="lock" className="size-4 text-accent-text" />
      Exclusive experience: {needed} FaZe ID points needed to apply. Points are not spent.
    </p>
  )
}
