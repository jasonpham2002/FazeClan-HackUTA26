import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { api, ApiError, dataSource } from '../api'
import { AccessLayout } from '../components/ui/AccessLayout'
import { Icon } from '../components/ui/Icon'
import { AccountMenu } from '../components/ui/AccountMenu'
import { EmptyState, ErrorState, linkClass, LoadingState } from '../components/ui/ui'

/**
 * Guards every /admin route on GET /me. This only improves the experience:
 * the backend must still enforce staff access on each endpoint.
 */
export function AdminLayout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe })
  const overview = useMatch('/admin')
  const eventRoute = useMatch('/admin/events/:eventId/*')
  const [params] = useSearchParams()
  const events = useQuery({
    queryKey: ['events'],
    queryFn: api.listAdminEvents,
    enabled: me.isSuccess && me.data.role === 'staff' && Boolean(overview || eventRoute),
  })
  const selected = overview
    ? events.data?.find(event => event.id === params.get('event')) ?? events.data?.[0]
    : events.data?.find(event => event.id === eventRoute?.params.eventId)
  const overviewLink = selected ? `/admin?event=${encodeURIComponent(selected.id)}` : '/admin'

  let body
  if (me.isPending) {
    body = <LoadingState label="Checking your session…" />
  } else if (me.isError) {
    const status = me.error instanceof ApiError ? me.error.status : null
    body =
      status === 401 ? (
        <EmptyState title="Sign-in required">
          <Link to="/sign-in?role=staff" className={linkClass}>Sign in as staff</Link>
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
    <AccessLayout
      home="/admin"
      title="Staff dashboard"
      sidebar={
        <>
          <nav aria-label="Staff navigation" className="access-nav">
            <NavLink to={overviewLink} end><Icon name="dashboard" /> Dashboard</NavLink>
            {me.isSuccess && me.data.role === 'staff' && <NavLink to="/admin/events/new"><Icon name="plus" /> New event</NavLink>}
          </nav>
          {me.isSuccess && me.data.role === 'staff' && selected && (
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
            {dataSource === 'fixtures' && (
              <nav aria-label="Demo navigation" className="access-nav">
                <Link to="/"><Icon name="arrowRight" /> Fan experience</Link>
              </nav>
            )}
            <p className="access-credit">Independent FaZe Clan concept</p>
          </div>
        </>
      }
      account={me.isSuccess && <AccountMenu account={me.data} />}
    >
      {body}
    </AccessLayout>
  )
}
