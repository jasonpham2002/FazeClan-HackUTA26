import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api, ApiError } from '../api'
import fazeLogo from '../assets/brand/faze-logo-on-dark.png'
import { EmptyState, ErrorState, linkClass, LoadingState } from '../components/ui/ui'

/**
 * Guards every /admin route on GET /me. This only improves the experience:
 * the backend must still enforce staff access on each endpoint.
 */
export function AdminLayout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe })

  let body
  if (me.isPending) {
    body = <LoadingState label="Checking your session…" />
  } else if (me.isError) {
    const status = me.error instanceof ApiError ? me.error.status : null
    body =
      status === 401 ? (
        <EmptyState title="Sign-in required">
          Sign in with a staff account to open the dashboard.{' '}
          <Link to="/sign-in" className={linkClass}>
            Sign in
          </Link>
        </EmptyState>
      ) : (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      )
  } else if (me.data.role !== 'staff') {
    body = <EmptyState title="Access denied">This area is for event staff. Your account is a fan account.</EmptyState>
  } else {
    body = <Outlet />
  }

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
          <NavLink to="/admin" end className="flex items-center gap-5">
            {/* Toolkit logo for dark backgrounds, unmodified; brand minimum width is 40px. */}
            <img src={fazeLogo} alt="FaZe Clan" width={60} height={40} className="h-10 w-auto" />
            <span className="title-display text-xl">Staff dashboard</span>
          </NavLink>
          <span className="text-[0.8125rem] text-muted">Independent concept for FaZe Clan</span>
          <Link to="/" className={linkClass}>Fan experience</Link>
          {me.data && (
            <span className="ml-auto text-[0.8125rem] text-muted">
              Signed in as <span className="text-text">{me.data.displayName ?? me.data.email}</span> · {me.data.role}
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-16 sm:px-6">{body}</main>
    </>
  )
}
