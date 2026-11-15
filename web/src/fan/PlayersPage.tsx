import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Player } from '../api/types'
import { Icon } from '../components/ui/Icon'
import { EmptyState, ErrorState, LoadingState, Notice } from '../components/ui/ui'
import { formatDateTime } from '../lib/format'
import { pageTitle, PlayerPortrait, RosterBadge, SampleBadge, useFan } from './fazeid-ui'

function PlayerCard({ player, following }: { player: Player; following: boolean }) {
  return (
    <li>
      <Link
        to={`/players/${encodeURIComponent(player.id)}`}
        className="group relative block overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        <PlayerPortrait player={player} className="aspect-[4/5] w-full transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pt-14 pb-4 text-white">
          <p className="title-display text-3xl break-words">{player.handle}</p>
          <p className="mt-1 text-sm text-white/75">{player.role ?? 'Role not listed'}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <RosterBadge status={player.rosterStatus} />
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              {following ? 'Following' : 'View profile'}
              <Icon name={following ? 'check' : 'arrowRight'} className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}

function Group({ title, players, follows }: { title: string; players: Player[]; follows: string[] }) {
  if (!players.length) return null
  return (
    <section>
      <h2 className="heading-section mb-4 border-b border-border pb-3">{title}</h2>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {players.map(player => <PlayerCard key={player.id} player={player} following={follows.includes(player.id)} />)}
      </ul>
    </section>
  )
}

export function PlayersPage() {
  const { fan } = useFan()
  const players = useQuery({ queryKey: ['players'], queryFn: api.listPlayers })
  const follows = useQuery({ queryKey: ['fan', 'follows'], queryFn: api.listFollows, enabled: Boolean(fan) })

  if (players.isPending) return <LoadingState label="Loading the roster…" />
  if (players.isError) return <ErrorState error={players.error} onRetry={() => players.refetch()} />
  if (!players.data.length) {
    return <EmptyState title="Player data is not available yet">The verified roster appears here once it has been imported.</EmptyState>
  }

  const list = players.data
  const checkedAt = list.map(player => player.checkedAt).sort().at(-1) ?? null
  const followed = follows.data ?? []
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4 pt-4">
        <h1 className={pageTitle}>FaZe CS2 roster</h1>
        <p className="text-lg text-muted">Pick a player to see their numbers, their next matches and their best moments.</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span>Roster checked {formatDateTime(checkedAt)}. Refreshed by hand, not a live feed.</span>
          {list.some(player => player.isDemo) && <SampleBadge />}
        </p>
      </header>
      {list.some(player => player.isDemo) && (
        <Notice tone="warn">
          These are placeholder players, not the real roster. Verified names, photos and statistics replace them when the team’s data import is ready.
        </Notice>
      )}
      <Group title="Active roster" players={list.filter(player => player.rosterStatus === 'active')} follows={followed} />
      <Group title="Coaching staff" players={list.filter(player => player.rosterStatus === 'coach')} follows={followed} />
      <Group title="Benched and former players" players={list.filter(player => player.rosterStatus === 'benched' || player.rosterStatus === 'former')} follows={followed} />
    </div>
  )
}
