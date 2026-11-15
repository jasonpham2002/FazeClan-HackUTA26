import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import logo from '../assets/brand/faze-logo-on-dark.png'
import { AccountMenu } from '../components/ui/AccountMenu'
import { Icon } from '../components/ui/Icon'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import type { Me } from '../api/types'
import './fazeid.css'

/** Fans' top navigation. Players come first: they are the main way into FaZe ID. */
const LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: '/players', label: 'Players' },
  { to: '/matches', label: 'Matches' },
  { to: '/', label: 'Fan events', end: true },
  { to: '/rewards', label: 'Rewards' },
  { to: '/profile', label: 'My FaZe ID', end: true },
]

function NavLinks({ extra, onNavigate }: { extra: { to: string; label: string; end?: boolean }[]; onNavigate?: () => void }) {
  return (
    <>
      {[...LINKS, ...extra].map(link => (
        <NavLink key={link.to} to={link.to} end={link.end ?? false} onClick={onNavigate}>
          {link.label}
        </NavLink>
      ))}
    </>
  )
}

export function FanShell({ account, signInVisible, extraLinks, children }: {
  account: Me | null
  signInVisible: boolean
  extraLinks: { to: string; label: string }[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])

  return (
    <div className="fz-shell">
      <a href="#fz-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-4">Skip to content</a>
      <header className="fz-topbar">
        <div className="fz-container">
          <div className="fz-topbar-row">
            <Link to="/players" className="fz-brand" aria-label="FaZe ID home">
              <img src={logo} alt="" width={44} height={29} />
              <span className="fz-wordmark">FaZe <span>ID</span></span>
            </Link>
            <nav aria-label="FaZe ID" className="fz-nav"><NavLinks extra={extraLinks} /></nav>
            <div className="fz-actions">
              <span className="fz-theme"><ThemeToggle /></span>
              {account ? <AccountMenu account={account} /> : signInVisible && (
                <Link to="/sign-in" className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-hover">
                  Sign in
                </Link>
              )}
              <button
                type="button"
                className="fz-menu-button size-10 items-center justify-center rounded-md border border-border bg-surface-2"
                aria-expanded={open}
                aria-controls="fz-mobile-nav"
                aria-label={open ? 'Close menu' : 'Open menu'}
                onClick={() => setOpen(value => !value)}
              >
                <Icon name={open ? 'close' : 'list'} className="size-5" />
              </button>
            </div>
          </div>
          <div id="fz-mobile-nav" className="fz-mobile-panel" data-open={open}>
            <nav aria-label="FaZe ID menu" className="fz-nav"><NavLinks extra={extraLinks} onNavigate={() => setOpen(false)} /></nav>
            <div className="mt-3 border-t border-border pt-3"><ThemeToggle /></div>
          </div>
        </div>
      </header>
      <main id="fz-main" tabIndex={-1} className="fz-main">
        <div className="fz-container">{children}</div>
      </main>
      <footer className="fz-footer">
        <div className="fz-container flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p>FaZe ID is an independent concept for FaZe Clan. Event admission is reviewed by staff.</p>
          <Link to="/admin" className="inline-flex items-center gap-1.5 hover:text-text"><Icon name="dashboard" /> Staff dashboard</Link>
        </div>
      </footer>
    </div>
  )
}
