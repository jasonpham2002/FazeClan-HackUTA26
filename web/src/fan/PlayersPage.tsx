import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Player } from '../api/types'
import { Icon } from '../components/ui/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/ui'
import { isUnverified, PlayerPortrait, PREVIEW_LABEL, RosterBadge, SampleBadge, useFan } from './fazeid-ui'
import { useReveal } from './useReveal'

function PlayerCard({ player, index, following }: { player: Player; index: number; following: boolean }) {
  return (
    <li className="fz-rise" style={{ '--i': index + 2 } as CSSProperties}>
      <Link to={`/players/${encodeURIComponent(player.id)}`} className="fz-roster-card group h-full" aria-label={`${player.handle}, ${player.role ?? 'role not listed'}. View profile`}>
        <div className="relative overflow-hidden">
          <PlayerPortrait player={player} className="fz-portrait-wrap aspect-square w-full sm:aspect-[4/3]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0d0d0d] to-transparent" />
          <span aria-hidden="true" className="fz-card-index figure absolute top-3 left-2 text-lg text-white/55 sm:left-4">
            {String(index + 1).padStart(2, '0')}
          </span>
          {following && (
            <span className="absolute top-3 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white sm:right-3">
              <Icon name="check" className="size-3.5" /> Following
            </span>
          )}
        </div>
        <div className="p-4 text-white sm:p-5">
          <p className="fz-display text-[clamp(1.75rem,3.2vw,2.5rem)]">{player.handle}</p>
          <p className="mt-1.5 text-sm text-white/75">{player.role ?? 'Role not listed'}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-white"><RosterBadge status={player.rosterStatus} /></span>
            <span className="fz-card-cta inline-flex items-center gap-1 text-sm font-semibold">
              Profile <Icon name="arrowRight" className="size-4" />
            </span>
          </div>
        </div>
        <span aria-hidden="true" className="fz-card-bar" />
      </Link>
    </li>
  )
}

function Group({ title, players, follows, offset }: { title: string; players: Player[]; follows: string[]; offset: number }) {
  const ref = useReveal<HTMLElement>()
  if (!players.length) return null
  return (
    <section ref={ref} aria-label={title} className="space-y-5">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 className="fz-section-title">{title}</h2>
        <span className="fz-meta">{players.length} {players.length === 1 ? 'person' : 'people'}</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        {players.map((player, index) => (
          <PlayerCard key={player.id} player={player} index={offset + index} following={follows.includes(player.id)} />
        ))}
      </ul>
    </section>
  )
}

/** embedded when shown under the FaZe ID scene, which already has the page's main heading. */
export function PlayersPage({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? 'h2' : 'h1'
  const { fan } = useFan()
  const players = useQuery({ queryKey: ['players'], queryFn: api.listPlayers })
  const follows = useQuery({ queryKey: ['fan', 'follows'], queryFn: api.listFollows, enabled: Boolean(fan) })

  const list = players.data ?? []
  const active = list.filter(player => player.rosterStatus === 'active')
  const coaches = list.filter(player => player.rosterStatus === 'coach')
  const others = list.filter(player => player.rosterStatus === 'benched' || player.rosterStatus === 'former')
  const sample = list.some(player => player.isDemo)
  const followed = follows.data ?? []

  return (
    <div className="space-y-16 sm:space-y-20">
      <header className="relative space-y-4 pt-2">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-24 -z-10 size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgb(228_0_43/0.22),transparent)]" />
        <Heading className="fz-display fz-rise text-[clamp(3.5rem,11vw,8.5rem)]" style={{ '--i': 1 } as CSSProperties}>
          The FaZe<br /><span className="text-accent-text">CS2 roster</span>
        </Heading>
        {list.some(isUnverified) && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <SampleBadge label={PREVIEW_LABEL} />
            Statistics and highlights use demo data.
          </p>
        )}
        {sample && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <SampleBadge label="Placeholder players" />
            Real names, photos and statistics replace these when the team’s verified import is ready.
          </p>
        )}
      </header>

      {players.isPending ? <LoadingState label="Loading the roster…" />
        : players.isError ? <ErrorState error={players.error} onRetry={() => players.refetch()} />
        : !list.length ? <EmptyState title="Player data is not available yet">The verified roster appears here once it has been imported.</EmptyState>
        : (
          <>
            <Group title="Active roster" players={active} follows={followed} offset={0} />
            <Group title="Coaching staff" players={coaches} follows={followed} offset={active.length} />
            <Group title="Benched and former" players={others} follows={followed} offset={active.length + coaches.length} />
          </>
        )}
    </div>
  )
}
