import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import camo from '../../assets/brand/tiger-camo-bw.jpg'
import { api } from '../../api'
import type { Player } from '../../api/types'
import { isUnverified, PREVIEW_LABEL } from '../fazeid-ui'
import { PlayersPage } from '../PlayersPage'
import './experience.css'

/** Writes scroll progress through the pinned scene into --p, once per frame. */
function useScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)
  const [motion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const element = ref.current
    if (!element || !motion) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      const travel = element.offsetHeight - window.innerHeight
      const p = travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 1
      element.style.setProperty('--p', p.toFixed(4))
      // The lineup only takes clicks once it has risen into view.
      element.dataset.phase = p > 0.6 ? 'lineup' : 'intro'
    }
    // Browsers already deliver scroll at most once per frame, so update directly.
    const schedule = () => update()
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [motion])
  return { ref, motion }
}

/**
 * A generic, faceless figure for players with no approved photo. It depicts
 * nobody: it only gives the lineup a human shape until real cut-outs exist.
 */
function Silhouette({ number }: { number: string }) {
  const id = `sil-${number}`
  return (
    <svg viewBox="0 0 300 500" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="absolute inset-0 size-full">
      <defs>
        <pattern id={`${id}-camo`} patternUnits="userSpaceOnUse" width="300" height="500">
          <image href={camo} width="300" height="500" preserveAspectRatio="xMidYMid slice" opacity="0.35" />
        </pattern>
        <linearGradient id={`${id}-body`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#262626" />
          <stop offset="1" stopColor="#0c0c0c" />
        </linearGradient>
      </defs>
      <g>
        <ellipse cx="150" cy="150" rx="52" ry="62" fill={`url(#${id}-body)`} stroke="rgb(228 0 43 / 0.45)" strokeWidth="2" />
        <path d="M30 500 C30 360 70 285 150 280 C230 285 270 360 270 500 Z" fill={`url(#${id}-body)`} />
        <path d="M30 500 C30 360 70 285 150 280 C230 285 270 360 270 500 Z" fill={`url(#${id}-camo)`} opacity="0.6" />
        <path d="M120 212 L120 250 C130 268 170 268 180 250 L180 212 Z" fill="#141414" />
        <path d="M98 96 C110 70 190 70 202 96" fill="none" stroke="rgb(228 0 43 / 0.75)" strokeWidth="3" />
        <path d="M30 500 C30 360 70 285 150 280 C230 285 270 360 270 500" fill="none" stroke="rgb(255 70 100 / 0.8)" strokeWidth="3" />
        <text x="150" y="410" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="92" fill="rgb(245 245 245 / 0.85)">{number}</text>
      </g>
    </svg>
  )
}

function LineupPlayer({ player, index, active, onActive }: {
  player: Player; index: number; active: boolean; onActive: (id: string | null) => void
}) {
  const k = index - 2
  const style = { '--k': k, '--abs': Math.abs(k), '--d': (Math.abs(k) * 0.12).toFixed(2) } as CSSProperties
  const number = String(index + 1).padStart(2, '0')
  const [failed, setFailed] = useState(false)
  const photo = player.imageUrl && !failed ? player.imageUrl : null
  return (
    <Link
      to={`/players/${encodeURIComponent(player.id)}`}
      className="xp-player"
      style={style}
      data-active={active}
      onMouseEnter={() => onActive(player.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={event => {
        onActive(player.id)
        // A keyboard user tabbing into the lineup during the intro is taken straight to it.
        const scene = event.currentTarget.closest<HTMLElement>('.xp')
        if (scene?.dataset.phase === 'intro') {
          window.scrollTo({ top: scene.offsetTop + (scene.offsetHeight - window.innerHeight) * 0.97, behavior: 'instant' })
        }
      }}
      onBlur={() => onActive(null)}
      aria-label={`${player.handle}, ${player.role ?? 'role not listed'}. Open profile`}
    >
      <span className={`xp-figure${photo ? ' has-photo' : ''}`}>
        {photo ? <img src={photo} alt="" onError={() => setFailed(true)} /> : <Silhouette number={number} />}
        {player.isDemo && <span className="xp-sample">Sample</span>}
        <span className="xp-tag">
          <strong>{player.handle}</strong>
          {player.role && <span>{player.role}</span>}
        </span>
      </span>
      <span className="xp-reflection" aria-hidden="true" />
    </Link>
  )
}

export function PlayersExperience() {
  const { ref, motion } = useScrollProgress()
  const { hash, key } = useLocation()
  const navigation = useNavigationType()

  // /players#lineup (the Roster link on a profile) skips the intro and lands on the finished lineup.
  useEffect(() => {
    const scene = ref.current
    if (!scene || navigation === 'POP') return // Back and Forward keep the browser's own position
    if (hash !== '#lineup') {
      window.scrollTo({ top: 0, behavior: 'instant' }) // a fresh visit starts the intro from the top
      return
    }
    const travel = scene.offsetHeight - window.innerHeight
    window.scrollTo({ top: scene.offsetTop + Math.max(0, travel) * 0.97, behavior: 'instant' })
  }, [hash, key, navigation, ref])
  const players = useQuery({ queryKey: ['players'], queryFn: api.listPlayers })
  const [active, setActive] = useState<string | null>(null)
  const lineup = (players.data ?? []).filter(player => player.rosterStatus === 'active').slice(0, 5)
  const spotlight = lineup.find(player => player.id === active) ?? null

  return (
    <>
      <div ref={ref} className="xp" data-motion={motion ? 'on' : 'off'}>
        <div className="xp-stage">
          <div className="xp-camo" aria-hidden="true" />
          <div className="xp-light xp-light-1" aria-hidden="true" />
          <div className="xp-light xp-light-2" aria-hidden="true" />
          <div className="xp-beams" aria-hidden="true" />
          <div className="xp-floor" aria-hidden="true" />
          <div className="xp-horizon" aria-hidden="true" />
          <div className="xp-ghost" aria-hidden="true">FAZE</div>

          <div className="xp-title">
            <div className="xp-title-inner">
              <h1 className="xp-word" aria-label="FaZe ID">
                <span className="xp-faze">FAZE</span>
                <span className="xp-id">ID</span>
              </h1>
              <p className="xp-tagline">Every player. Every stat. Every moment that counts.</p>
            </div>
          </div>
          <div className="xp-cue" aria-hidden="true">Scroll<span /></div>

          <div className="xp-spotlight" aria-hidden="true">{spotlight?.handle ?? ''}</div>
          <div className="xp-lineup-head">
            <h2>{motion ? 'The lineup' : 'FaZe ID · The lineup'}</h2>
            <p>
              Pick a player.
              {lineup.some(player => player.isDemo) ? ' Placeholder players until the verified roster is imported.'
                : lineup.some(player => !player.imageUrl) ? ' Approved portraits appear here once they are cleared for use.' : ''}
            </p>
            {lineup.some(isUnverified) && (
              <p className="xp-preview">{PREVIEW_LABEL}</p>
            )}
          </div>
          <nav className="xp-lineup" aria-label="Active roster">
            {lineup.map((player, index) => (
              <LineupPlayer key={player.id} player={player} index={index} active={active === player.id} onActive={setActive} />
            ))}
          </nav>
          <p className="xp-end" aria-hidden="true">Full roster below</p>
        </div>
      </div>
      <div className="mt-16 sm:mt-24">
        <PlayersPage embedded />
      </div>
    </>
  )
}
