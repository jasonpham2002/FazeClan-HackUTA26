import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, dataSource } from '../api'
import { AccessLayout } from '../components/ui/AccessLayout'
import { Icon } from '../components/ui/Icon'
import { AccountMenu } from '../components/ui/AccountMenu'
import { FanDetailsForm } from '../components/ui/FanDetailsForm'
import { ApplicationStatusBadge, CallStatusBadge } from '../components/ui/StatusBadge'
import { Button, Card, EmptyState, ErrorState, linkButtonClass, LoadingState, Notice } from '../components/ui/ui'
import { formatDateTime } from '../lib/format'
import { canRequestCall, eventUnavailable, fanStatusText, normalizePhone } from './logic'

const fixture = dataSource === 'fixtures'
const meOptions = { queryKey: ['fan', 'me'], queryFn: api.getFanMe }
const myAppsOptions = { queryKey: ['fan', 'applications'], queryFn: api.listMyApplications }
const pageTitle = 'title-display text-4xl sm:text-6xl'

function SignInRequired() {
  return <EmptyState title="Sign in to continue"><Link to="/sign-in" className={linkButtonClass}>Sign in</Link></EmptyState>
}
function LoadError({ error, retry }: { error: unknown; retry: () => unknown }) {
  if (error instanceof ApiError && error.status === 401) return <SignInRequired />
  return <ErrorState error={error} onRetry={() => void retry()} />
}

function ProfileSettingsLink({ className }: { className: string }) {
  if (fixture) return <Link to="/profile/edit" className={className}>Change demo profile</Link>
  return <Link to="/profile/edit" className={className}>Manage profile</Link>
}

export function FanLayout() {
  const me = useQuery(meOptions)
  return (
    <AccessLayout
      home="/"
      title="Fan experience"
      sidebar={
        <>
          <nav aria-label="Fan navigation" className="access-nav">
            <NavLink to="/" end><Icon name="calendar" /> Events</NavLink>
            <NavLink to="/profile"><Icon name="profile" /> My profile</NavLink>
            {fixture && me.isSuccess && (
              <NavLink to="/profile/edit"><Icon name="arrowRight" /> Demo profile</NavLink>
            )}
            {!me.isSuccess && !me.isPending && (
              <NavLink to="/sign-in"><Icon name="arrowRight" /> Sign in</NavLink>
            )}
          </nav>
          {fixture && (
            <nav aria-label="Demo navigation" className="access-nav access-sidebar-bottom">
              <Link to="/admin"><Icon name="dashboard" /> Staff dashboard</Link>
            </nav>
          )}
        </>
      }
      account={me.isSuccess && <AccountMenu account={me.data} />}
      footer={
        <p>Independent concept for FaZe Clan · Event admission is reviewed by staff.</p>
      }
    >
      <Outlet />
    </AccessLayout>
  )
}

export function FanEventsPage() {
  const events = useQuery({ queryKey: ['fan', 'events'], queryFn: api.listFanEvents })
  return <div className="space-y-8"><section className="max-w-4xl space-y-5 py-8"><p className="text-sm font-semibold uppercase tracking-widest text-muted">Community / IRL</p><h1 className="title-display text-5xl sm:text-7xl">Off the screen.<br />Into the community.</h1><p className="max-w-xl text-lg text-muted">Meet other fans, share a great night, and be part of what comes next. Find an event and apply for access.</p></section>
    {events.isPending ? <LoadingState /> : events.isError ? <ErrorState error={events.error} onRetry={() => events.refetch()} /> : !events.data.length ? <EmptyState title="More nights are on the way">There are no published events yet. Check back soon.</EmptyState> : <div className="grid gap-5 md:grid-cols-2">{events.data.map(event => <Card key={event.id} title={event.title}><div className="space-y-4"><p className="text-muted">{event.description}</p><p className="text-sm">{formatDateTime(event.startsAt, event.timezone)}<br />{event.location}</p>{eventUnavailable(event) && <Notice tone="warn">{eventUnavailable(event)}</Notice>}<Link to={`/events/${event.id}`} className={linkButtonClass}>View event</Link></div></Card>)}</div>}
  </div>
}

export function FanEventPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queries = useQueryClient()
  const event = useQuery({ queryKey: ['fan', 'event', id], queryFn: () => api.getFanEvent(id) })
  const me = useQuery(meOptions)
  const apps = useQuery({ ...myAppsOptions, enabled: Boolean(me.data) })
  const [consent, setConsent] = useState(false)
  const apply = useMutation({ mutationFn: () => api.createFanApplication(id, consent), onSuccess: async result => { await queries.invalidateQueries(); navigate(`/applications/${result.id}`) } })
  if (event.isPending) return <LoadingState />
  if (event.isError) return <ErrorState error={event.error} onRetry={() => event.refetch()} />
  const current = apps.data?.find(app => app.event.id === id)
  const unavailable = eventUnavailable(event.data)
  return <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]"><section className="space-y-5"><Link to="/" className="text-sm text-muted underline">Back to events</Link><h1 className={pageTitle}>{event.data.title}</h1><p className="text-lg text-muted">{event.data.description}</p><p>{formatDateTime(event.data.startsAt, event.data.timezone)}<br />{event.data.location}</p><p className="text-sm text-muted">Apply, chat with an AI host, and watch for your invitation. Staff make the final decision.</p></section>
    <Card title={current ? 'Your application' : 'Apply for access'}>{me.isPending || (me.data && apps.isPending) ? <LoadingState /> : me.isError ? <LoadError error={me.error} retry={() => me.refetch()} /> : apps.isError ? <ErrorState error={apps.error} onRetry={() => apps.refetch()} /> : current ? <div className="space-y-4"><ApplicationStatusBadge status={current.status} /><p>{fanStatusText(current)}</p><Link to={`/applications/${current.id}`} className={linkButtonClass}>View application</Link></div> : unavailable ? <Notice tone="warn">{unavailable}</Notice> : <form className="space-y-5" onSubmit={submit => { submit.preventDefault(); if (!apply.isPending) apply.mutate() }}>
      {fixture && <Notice tone="warn">Use fictional details. This is a shared demo account; no real call will be placed.</Notice>}
      <dl className="space-y-3"><div><dt className="text-sm text-muted">Applicant</dt><dd>{me.data?.displayName || me.data?.email}</dd></div><div><dt className="text-sm text-muted">FaceTime destination</dt><dd>{me.data?.phone || 'No number on profile'}</dd></div></dl><ProfileSettingsLink className="text-sm underline" />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={consent} onChange={change => setConsent(change.target.checked)} disabled={apply.isPending} required /><span>I agree to receive an AI interview{fixture ? ' (simulated in this demo)' : ' over FaceTime'}. My answers will be transcribed for event-staff review.</span></label>
      {apply.isError && <ErrorState error={apply.error} />}<Button type="submit" variant="primary" disabled={apply.isPending || !me.data?.phone || !normalizePhone(me.data.phone)}>{apply.isPending ? 'Submitting…' : 'Submit application'}</Button>
    </form>}</Card>
  </div>
}

export function FanApplicationPage() {
  const { id = '' } = useParams()
  const queries = useQueryClient()
  const [confirmed, setConfirmed] = useState('')
  const app = useQuery({ queryKey: ['fan', 'application', id], queryFn: () => api.getMyApplication(id), refetchInterval: query => {
    const value = query.state.data
    return value && (value.status === 'review_pending' || ['queued', 'dialing', 'connected'].includes(value.call?.status || '')) && value.call?.processingStatus !== 'failed' ? 3000 : false
  } })
  const mutation = useMutation({ mutationFn: (action: 'call' | 'accept' | 'missed' | 'completed') => action === 'call' ? api.requestFanCall(id) : action === 'accept' ? api.acceptFanInvitation(id) : api.simulateFanCall(id, action), onSuccess: async () => { setConfirmed(''); await queries.invalidateQueries() }, onError: error => { if (error instanceof ApiError && error.status === 409) void queries.invalidateQueries({ queryKey: ['fan', 'application', id] }) } })
  if (app.isPending) return <LoadingState />
  if (app.isError && (!app.data || (app.error instanceof ApiError && [401,403,404].includes(app.error.status)))) return <LoadError error={app.error} retry={() => app.refetch()} />
  if (!app.data) return null
  const value = app.data
  const phoneKey = `${id}:${value.profile.phone}`
  const acceptUnavailable = value.invitation?.capacityAvailable === false || Boolean(value.invitation?.expiresAt && Date.parse(value.invitation.expiresAt) <= Date.now())
  return <div className="space-y-6"><Link to="/profile" className="text-sm underline">My profile</Link><h1 className={pageTitle}>{value.event.title}</h1><div className="flex flex-wrap gap-5"><ApplicationStatusBadge status={value.status} /><CallStatusBadge status={value.call?.status || null} /></div><p className="text-lg text-muted" role="status">{fanStatusText(value)}</p>
    {app.isError && <ErrorState error={app.error} onRetry={() => app.refetch()} />}
    <div className="grid gap-6 md:grid-cols-2"><Card title="Your event"><p>{formatDateTime(value.event.startsAt, value.event.timezone)}<br />{value.event.location}</p><p className="mt-4 text-sm text-muted">Application received {formatDateTime(value.submittedAt)}<br />Interview version {value.interviewVersion.versionNumber}</p></Card><Card title={canRequestCall(value) ? 'Ready when you are' : 'Next steps'}><div className="space-y-4">
      {canRequestCall(value) ? <><p className="text-sm text-muted">FaceTime destination</p><p className="font-semibold">{value.profile.phone || 'No phone number on file'}</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={confirmed === phoneKey} onChange={change => setConfirmed(change.target.checked ? phoneKey : '')} disabled={mutation.isPending} /><span>I confirm this is my number and I am ready for the {fixture ? 'simulated interview' : 'FaceTime call'}.</span></label><Button variant="primary" disabled={mutation.isPending || confirmed !== phoneKey || !value.profile.phone || !normalizePhone(value.profile.phone)} onClick={() => mutation.mutate('call')}>{fixture ? 'Simulate call request' : 'Call me now'}</Button></> : value.status === 'invited' ? <>{acceptUnavailable && <Notice tone="warn">This invitation has expired or all available spots have been claimed. Contact event staff.</Notice>}<Button variant="primary" disabled={mutation.isPending || acceptUnavailable} onClick={() => mutation.mutate('accept')}>Accept invitation</Button></> : <p>{fanStatusText(value)}</p>}
      {mutation.isError && <ErrorState error={mutation.error} />}<Button onClick={() => app.refetch()} disabled={app.isFetching || mutation.isPending}>Refresh status</Button>
    </div></Card></div>
    {fixture && <Card title="Connected demo walkthrough"><div className="space-y-4"><Notice tone="warn">No real call or AI evaluation occurs. Sample interview completion creates explicitly synthetic answers in the shared staff store.</Notice>{['queued','dialing','connected'].includes(value.call?.status || '') && <div className="flex flex-wrap gap-3"><Button onClick={() => mutation.mutate('completed')} disabled={mutation.isPending}>Simulate completed interview</Button><Button onClick={() => mutation.mutate('missed')} disabled={mutation.isPending}>Simulate missed call</Button></div>}<Link to={`/admin/applications/${id}`} className={linkButtonClass}>Review in staff dashboard</Link></div></Card>}
  </div>
}

export function FanProfilePage() {
  const [params] = useSearchParams()
  const me = useQuery(meOptions)
  const apps = useQuery({ ...myAppsOptions, enabled: Boolean(me.data) })
  const activity = useQuery({ queryKey: ['fan', 'activity'], queryFn: api.listMyActivity, enabled: Boolean(me.data) })
  if (me.isPending) return <LoadingState />
  if (me.isError) return <LoadError error={me.error} retry={() => me.refetch()} />
  if (!fixture && me.data.role === 'fan' && !me.data.phone && params.get('setup') === '1') {
    return <Navigate to="/profile/edit" replace />
  }
  return <div className="space-y-7"><h1 className={pageTitle}>Your community profile</h1><div className="grid gap-6 lg:grid-cols-[1fr_2fr]"><Card title={me.data.displayName || 'Community member'}><p className="break-all">{me.data.email}<br />{me.data.phone || 'No phone on profile'}</p><ProfileSettingsLink className={`${linkButtonClass} mt-4`} /></Card><div className="space-y-6"><Card title="Your applications">{apps.isPending ? <LoadingState /> : apps.isError ? <LoadError error={apps.error} retry={() => apps.refetch()} /> : !apps.data.length ? <EmptyState title="Your first night starts here"><Link to="/">Explore events</Link></EmptyState> : <ul className="divide-y divide-border">{apps.data.map(app => <li key={app.id} className="space-y-3 py-4"><h2 className="font-semibold">{app.event.title}</h2><ApplicationStatusBadge status={app.status} /><div><Link to={`/applications/${app.id}`} className={linkButtonClass}>View application</Link></div></li>)}</ul>}</Card>
      <Card title="Recorded activity">{activity.isPending ? <LoadingState /> : activity.isError ? <LoadError error={activity.error} retry={() => activity.refetch()} /> : !activity.data.length ? <EmptyState title="No activity recorded yet">New fans are welcome. Your activity appears as it is recorded.</EmptyState> : <ul className="divide-y divide-border">{activity.data.map(item => <li key={item.id} className="space-y-1 py-3"><p className="font-semibold">{{ application: 'Application submitted', invitation_accepted: 'Invitation accepted', attendance: 'Attendance confirmed' }[item.type]}</p><p>{item.eventTitle}</p><p className="text-sm text-muted">{formatDateTime(item.timestamp)} · {item.source}{item.isDemo ? ' · Demo record' : ''}</p></li>)}</ul>}</Card></div></div></div>
}

export function FanProfileEditPage() {
  const me = useQuery(meOptions)
  if (me.isPending) return <LoadingState label="Checking your session…" />
  if (me.isError) return <LoadError error={me.error} retry={() => me.refetch()} />

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className={pageTitle}>{fixture ? 'Your demo profile' : 'Your profile details'}</h1>
      <Card>
        {fixture && <div className="mb-4"><Notice tone="warn">Use sample details. They stay in this browser.</Notice></div>}
        <FanDetailsForm
          account={me.data}
          lockEmail={!fixture}
          onSave={details => fixture
            ? api.setFixtureFan(details)
            : api.updateFanProfile({ displayName: details.displayName, phone: details.phone })}
        />
      </Card>
    </div>
  )
}
