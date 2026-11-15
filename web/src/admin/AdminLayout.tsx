import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { api, ApiError, dataSource, signOut } from '../api'
import { AccessLayout } from '../components/ui/AccessLayout'
import { Icon } from '../components/ui/Icon'
import { Button, EmptyState, ErrorState, linkClass, LoadingState } from '../components/ui/ui'

/**
 * Guards every /admin route on GET /me. This only improves the experience:
 * the backend must still enforce staff access on each endpoint.
 */
export function AdminLayout() {
  const queries = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe })
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => queries.resetQueries(),
  })
  const overview = useMatch('/admin')
  const eventRoute = useMatch('/admin/events/:eventId/*')
  const eventId = eventRoute?.params.eventId
  const appRoute = useMatch('/admin/applications/:appId')
  const [params] = useSearchParams()
  const events = useQuery({
    queryKey: ['events'],
    queryFn: api.listAdminEvents,
    enabled: me.data?.role === 'staff' && Boolean(overview || (eventId && eventId !== 'new')),
  })
  const appDetail = useQuery({
    queryKey: ['application', appRoute?.params.appId ?? ''],
    queryFn: () => api.getApplication(appRoute!.params.appId!),
    enabled: me.data?.role === 'staff' && Boolean(appRoute?.params.appId),
  })
  const selected = overview
    ? events.data?.find(event => event.id === params.get('event')) ?? events.data?.[0]
    : eventId && eventId !== 'new'
      ? events.data?.find(event => event.id === eventId) ?? { id: eventId, title: 'Event' }
      : appDetail.data?.event
  const overviewLink = selected ? `/admin?event=${encodeURIComponent(selected.id)}` : '/admin'

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
    body = (
      <EmptyState title="Access denied">
        <div className="space-y-3">
          <p>This area is for event staff. Your account is a fan account.</p>
          <div className="flex flex-wrap items-center gap-3">
            {dataSource === 'live' && (
              <Button size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
                Sign out
              </Button>
            )}
            <Link to="/sign-in" className={linkClass}>
              Switch account
            </Link>
          </div>
        </div>
      </EmptyState>
    )
  } else {
    body = <Outlet />
  }

  return (
    <AccessLayout
      home="/admin"
      title="Staff dashboard"
      sidebar={
        <>
          <nav aria-label="Staff navigation" className="access-nav">
            <NavLink to={overviewLink} end><Icon name="dashboard" /> Dashboard</NavLink>
            {me.data?.role === 'staff' && <NavLink to="/admin/events/new"><Icon name="plus" /> New event</NavLink>}
          </nav>
          {me.data?.role === 'staff' && selected && (
            <div className="min-w-0 border-t border-border pt-3">
              <p className="truncate px-2.5 pb-1 text-xs font-semibold text-subtle" title={selected.title}>{selected.title}</p>
              <nav aria-label="Selected event navigation" className="access-nav">
                <NavLink to={`/admin/events/${selected.id}`} end><Icon name="calendar" /> Event details</NavLink>
                <NavLink to={`/admin/events/${selected.id}/applications`}><Icon name="list" /> Applications</NavLink>
                <NavLink to={`/admin/events/${selected.id}/interview`}><Icon name="interview" /> Interview</NavLink>
              </nav>
            </div>
          )}
          <div className="access-sidebar-bottom">
            <nav aria-label="Demo navigation" className="access-nav">
              <Link to="/"><Icon name="arrowRight" /> Fan experience</Link>
            </nav>
            <p className="access-credit">Independent FaZe Clan concept</p>
          </div>
        </>
      }
      account={me.data && (
        <div className="flex items-center gap-3">
          <div className="access-account">
            <span aria-hidden="true" className="access-avatar">{(me.data.displayName ?? me.data.email).slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="break-words font-semibold">{me.data.displayName ?? me.data.email}</p>
              <p className="text-xs text-muted capitalize">{me.data.role}</p>
            </div>
          </div>
          {dataSource === 'live' && (
            <Button size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </Button>
          )}
        </div>
      )}
    >
      {body}
    </AccessLayout>
  )
}
