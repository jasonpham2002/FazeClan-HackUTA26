import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import logo from '../../assets/brand/faze-logo-on-dark.png'
import { ThemeToggle } from './ThemeToggle'
import './access-layout.css'

type AccessLayoutProps = {
  home: string
  title: string
  sidebar: ReactNode
  account?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function AccessLayout({ home, title, sidebar, account, footer, children }: AccessLayoutProps) {
  return (
    <div className="access-frame">
      <a href="#access-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-4">
        Skip to content
      </a>
      <div className="access-shell">
        <aside className="access-sidebar">
          <Link to={home} className="access-brand">
            <img src={logo} alt="" width={42} height={28} />
            <span>FaZe Access</span>
          </Link>
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="access-header access-toolbar">
            <span className="font-semibold">{title}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
              <ThemeToggle />
              {account}
            </div>
          </header>
          <main id="access-main" tabIndex={-1} className="access-content flex-1">{children}</main>
          {footer && (
            <footer className="access-content flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border text-sm text-muted">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}
