import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { AccessLayout } from '../components/ui/AccessLayout'
import { AccountMenu } from '../components/ui/AccountMenu'
import { Icon } from '../components/ui/Icon'
import { SessionButton } from '../components/ui/SessionButton'
import { EmptyState, ErrorState, linkClass, LoadingState } from '../components/ui/ui'

/**
 * Guards every /admin route on GET /me. This only improves the experience:
 * the backend must still enforce staff access on each endpoint.
 */
export function AdminLayout() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe })
  const overview = useMatch('/admin')
  const eventRoute = useMatch('/admin/events/:eventId/*')
  const eventId = eventRoute?.params.eventId
  const appRoute = useMatch('/admin/applications/:appId')
  const [params] = useSearchParams()
  const events = useQuery({
    queryKey: ['events'],
    queryFn: api.listAdminEvents,
    enabled: me.isSuccess && me.data.role === 'staff' && Boolean(overview || (eventId && eventId !== 'new')),
  })
  const appDetail = useQuery({
    queryKey: ['application', appRoute?.params.appId ?? ''],
    queryFn: () => api.getApplication(appRoute!.params.appId!),
    enabled: me.isSuccess && me.data.role === 'staff' && Boolean(appRoute?.params.appId),
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
          <Link to="/sign-in?role=staff" className={linkClass}>Sign in as staff</Link>
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
            <SessionButton role={me.data.role} />
            <Link to="/sign-in?role=staff" className={linkClass}>
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
            {me.isSuccess && me.data.role === 'staff' && <NavLink to="/admin/insights"><Icon name="chart" /> Insights</NavLink>}
            {me.isSuccess && me.data.role === 'staff' && <NavLink to="/admin/markets"><Icon name="trophy" /> Predictions</NavLink>}
            {me.isSuccess && me.data.role === 'staff' && <NavLink to="/admin/rewards"><Icon name="gift" /> Rewards</NavLink>}
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
            <nav aria-label="Demo navigation" className="access-nav">
              <Link to="/"><Icon name="arrowRight" /> Fan experience</Link>
            </nav>
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
