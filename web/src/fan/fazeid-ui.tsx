/* Small pieces shared by the FaZe ID fan pages. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import camo from '../assets/brand/tiger-camo-bw.jpg'
import { api, ApiError } from '../api'
import type { MarketState, Player, PredictionMarket, RosterStatus, StatKey } from '../api/types'
import { Badge, type BadgeTone } from '../components/ui/ui'
import { EM_DASH } from '../lib/format'

export const pageTitle = 'title-display text-4xl sm:text-6xl'

/** The signed-in fan, or null when nobody is signed in (a 401 is not an error here). */
export function useFan() {
  const me = useQuery({ queryKey: ['fan', 'me'], queryFn: api.getFanMe })
  const signedOut = me.isError && me.error instanceof ApiError && me.error.status === 401
  return { fan: me.data?.role === 'fan' ? me.data : null, signedOut, isPending: me.isPending }
}

/** A player whose roster entry has no source yet: shown as a preview, not as verified data. */
export const isUnverified = (player: Player) => !player.isDemo && !player.sourceUrl

export const PREVIEW_LABEL = 'Demo preview — data pending verification'

export function SampleBadge({ label = 'Sample data' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs font-semibold text-warn">
      {label}
    </span>
  )
}

const rosterLabels: Record<RosterStatus, [string, BadgeTone]> = {
  active: ['Active roster', 'ok'],
  benched: ['Benched', 'warn'],
  former: ['Former player', 'gray'],
  coach: ['Coach', 'info'],
}

export function RosterBadge({ status }: { status: RosterStatus }) {
  const [label, tone] = rosterLabels[status] ?? [status, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}

/** A player photo, or a deliberate placeholder when no approved image was supplied. */
export function PlayerPortrait({ player, className = '' }: { player: Player; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (player.imageUrl && !failed) {
    // Cut-outs sit on the same lit camo backdrop as the placeholder, feet at the bottom edge.
    return (
      <div className={`fz-photo-bg relative isolate overflow-hidden ${className}`}>
        <img src={player.imageUrl} alt={player.handle} loading="lazy" onError={() => setFailed(true)} className="absolute inset-x-0 bottom-0 h-[92%] w-full object-contain object-bottom brightness-110 contrast-105" />
      </div>
    )
  }
  // Placeholder players carry a number; a real player gets the first letter of their tag, never invented artwork.
  const clean = player.handle.replace(/[^A-Za-z0-9]/g, '')
  const mark = (player.isDemo ? clean.slice(-2) : clean.slice(0, 1)).toUpperCase() || '?'
  return (
    <div role="img" aria-label={`No photo supplied for ${player.handle}`} className={`relative isolate grid place-items-center overflow-hidden bg-[#161616] [container-type:inline-size] ${className}`}>
      <img src={camo} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-25 mix-blend-luminosity" />
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_35%,rgb(228_0_43/0.28),transparent_70%)]" />
      <span aria-hidden="true" className="figure text-[clamp(2.5rem,38cqw,7rem)] text-white/80">{mark}</span>
    </div>
  )
}

export const statLabels: Record<StatKey, string> = {
  rating: 'Rating',
  kd: 'K/D',
  adr: 'ADR',
  headshotPercent: 'Headshot %',
}

/** A missing value is unavailable, never zero. */
export function formatStat(key: StatKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return EM_DASH
  if (key === 'headshotPercent') return `${value.toFixed(1)}%`
  if (key === 'adr') return value.toFixed(1)
  return value.toFixed(2)
}

export function formatDate(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EM_DASH
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(date)
}

export type PickState = 'open' | 'submitted' | 'locked' | 'redeemed' | 'claimable' | 'incorrect' | 'settled' | 'void'

/** FaZe vs Falcons, 3 November 2026. Winners can still redeem this result. */
export const CLAIMABLE_MATCH_ID = 'hltv-match-2399994'

/** What a market means to this fan: the market state combined with their own pick. */
export function pickState(market: PredictionMarket): PickState {
  if (market.state === 'void') return 'void'
  if (market.state === 'settled') {
    if (!market.myPick || !market.result) return 'settled'
    if (market.myPick.optionId !== market.result.optionId) return 'incorrect'
    if (market.matchId === CLAIMABLE_MATCH_ID && !market.redeemed) return 'claimable'
    return 'redeemed'
  }
  if (market.state === 'locked') return 'locked'
  return market.myPick ? 'submitted' : 'open'
}

const pickLabels: Record<PickState, [string, BadgeTone]> = {
  open: ['Open for picks', 'info'],
  submitted: ['Pick submitted', 'ok'],
  locked: ['Locked', 'warn'],
  redeemed: ['Redeemed', 'ok'],
  claimable: ['Winner', 'ok'],
  incorrect: ['Lost', 'danger'],
  settled: ['Settled', 'neutral'],
  void: ['Void', 'neutral'],
}

export function PickStateBadge({ state }: { state: PickState }) {
  const [label, tone] = pickLabels[state]
  return <Badge tone={tone}>{label}</Badge>
}

const marketLabels: Record<MarketState, [string, BadgeTone]> = {
  open: ['Open', 'info'],
  locked: ['Locked, awaiting result', 'warn'],
  settled: ['Settled', 'ok'],
  void: ['Void', 'neutral'],
}

export function MarketStateBadge({ state }: { state: MarketState }) {
  const [label, tone] = marketLabels[state] ?? [state, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}
