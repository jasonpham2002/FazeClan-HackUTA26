import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, dataSource, requestMagicLink, signOut, updateLiveProfile } from '../api'
import type { FixtureFanInput } from '../api/types'
import { AccessLayout } from '../components/ui/AccessLayout'
import { Icon } from '../components/ui/Icon'
import { ApplicationStatusBadge, CallStatusBadge } from '../components/ui/StatusBadge'
import { Button, Card, EmptyState, ErrorState, Field, inputClass, linkButtonClass, LoadingState, Notice } from '../components/ui/ui'
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

export function FanLayout() {
  const queries = useQueryClient()
  const me = useQuery(meOptions)
  const logout = useMutation({ mutationFn: signOut, onSuccess: () => queries.resetQueries() })
  return (
    <AccessLayout
      home="/"
      title="Fan experience"
      sidebar={
        <>
          <nav aria-label="Fan navigation" className="access-nav">
            <NavLink to="/" end><Icon name="calendar" /> Events</NavLink>
            <NavLink to="/profile"><Icon name="profile" /> My profile</NavLink>
            <NavLink to="/sign-in"><Icon name="arrowRight" /> {fixture ? 'Demo profile' : 'Sign in'}</NavLink>
          </nav>
          {(fixture || me.data?.role === 'staff') && (
            <nav aria-label="Demo navigation" className="access-nav access-sidebar-bottom">
              <Link to="/admin"><Icon name="dashboard" /> Staff dashboard</Link>
            </nav>
          )}
        </>
      }
      account={me.data && (
        <div className="flex items-center gap-3">
          <div className="access-account">
            <span aria-hidden="true" className="access-avatar">{(me.data.displayName || me.data.email).slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="break-words font-semibold">{me.data.displayName || me.data.email}</p>
              <p className="text-xs text-muted capitalize">{me.data.role}</p>
            </div>
          </div>
          {!fixture && (
            <Button size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </Button>
          )}
        </div>
      )}
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
  const apps = useQuery({ ...myAppsOptions, enabled: me.data?.role === 'fan' })
  const [consent, setConsent] = useState(false)
  const apply = useMutation({ mutationFn: () => api.createFanApplication(id, consent), onSuccess: async result => { await queries.invalidateQueries(); navigate(`/applications/${result.id}`) } })
  if (event.isPending) return <LoadingState />
  if (event.isError) return <ErrorState error={event.error} onRetry={() => event.refetch()} />
  const current = apps.data?.find(app => app.event.id === id)
  const unavailable = eventUnavailable(event.data)
  return <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]"><section className="space-y-5"><Link to="/" className="text-sm text-muted underline">Back to events</Link><h1 className={pageTitle}>{event.data.title}</h1><p className="text-lg text-muted">{event.data.description}</p><p>{formatDateTime(event.data.startsAt, event.data.timezone)}<br />{event.data.location}</p><p className="text-sm text-muted">Apply, chat with an AI host, and watch for your invitation. Staff make the final decision.</p></section>
    <Card title={current ? 'Your application' : 'Apply for access'}>{me.isPending || (me.data?.role === 'fan' && apps.isPending) ? <LoadingState /> : me.isError ? <LoadError error={me.error} retry={() => me.refetch()} /> : apps.isError ? <ErrorState error={apps.error} onRetry={() => apps.refetch()} /> : me.data?.role === 'staff' ? <Notice>Sign in as a fan to apply.</Notice> : current ? <div className="space-y-4"><ApplicationStatusBadge status={current.status} /><p>{fanStatusText(current)}</p><Link to={`/applications/${current.id}`} className={linkButtonClass}>View application</Link></div> : unavailable ? <Notice tone="warn">{unavailable}</Notice> : <form className="space-y-5" onSubmit={submit => { submit.preventDefault(); if (!apply.isPending) apply.mutate() }}>
      {fixture && <Notice tone="warn">Use fictional details. This is a shared demo account; no real call will be placed.</Notice>}
      <dl className="space-y-3"><div><dt className="text-sm text-muted">Applicant</dt><dd>{me.data?.displayName || me.data?.email}</dd></div>{fixture && <div><dt className="text-sm text-muted">Demo phone</dt><dd>{me.data?.phone || 'No number on profile'}</dd></div>}</dl><Link to="/sign-in" className="text-sm underline">{fixture ? 'Change demo profile' : 'Manage profile'}</Link>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={consent} onChange={change => setConsent(change.target.checked)} disabled={apply.isPending} required /><span>I agree to the demo interview. Staff can review its sample transcript and answers.</span></label>
      {apply.isError && <ErrorState error={apply.error} />}<Button type="submit" variant="primary" disabled={apply.isPending || (fixture && (!me.data?.phone || !normalizePhone(me.data.phone)))}>{apply.isPending ? 'Submitting…' : 'Submit application'}</Button>
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
      {canRequestCall(value) && !fixture ? <><Notice>This runs a sample interview for staff review.</Notice><Button variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate('call')}>Run sample interview</Button></> : canRequestCall(value) ? <><p className="text-sm text-muted">Demo phone</p><p className="font-semibold">{value.profile.phone || 'No phone number on file'}</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={confirmed === phoneKey} onChange={change => setConfirmed(change.target.checked ? phoneKey : '')} disabled={mutation.isPending} /><span>I confirm this is my number and I am ready for the simulated interview.</span></label><Button variant="primary" disabled={mutation.isPending || confirmed !== phoneKey || !value.profile.phone || !normalizePhone(value.profile.phone)} onClick={() => mutation.mutate('call')}>Simulate call request</Button></> : value.status === 'invited' ? <>{acceptUnavailable && <Notice tone="warn">This invitation has expired or all available spots have been claimed. Contact event staff.</Notice>}<Button variant="primary" disabled={mutation.isPending || acceptUnavailable} onClick={() => mutation.mutate('accept')}>Accept invitation</Button></> : <p>{fanStatusText(value)}</p>}
      {mutation.isError && <ErrorState error={mutation.error} />}<Button onClick={() => app.refetch()} disabled={app.isFetching || mutation.isPending}>Refresh status</Button>
    </div></Card></div>
    {fixture && <Card title="Connected demo walkthrough"><div className="space-y-4"><Notice tone="warn">No real call or AI evaluation occurs. Sample interview completion creates explicitly synthetic answers in the shared staff store.</Notice>{['queued','dialing','connected'].includes(value.call?.status || '') && <div className="flex flex-wrap gap-3"><Button onClick={() => mutation.mutate('completed')} disabled={mutation.isPending}>Simulate completed interview</Button><Button onClick={() => mutation.mutate('missed')} disabled={mutation.isPending}>Simulate missed call</Button></div>}<Link to={`/admin/applications/${id}`} className={linkButtonClass}>Review in staff dashboard</Link></div></Card>}
  </div>
}

export function FanProfilePage() {
  const me = useQuery(meOptions)
  const apps = useQuery({ ...myAppsOptions, enabled: Boolean(me.data) })
  const activity = useQuery({ queryKey: ['fan', 'activity'], queryFn: api.listMyActivity, enabled: Boolean(me.data) })
  if (me.isPending) return <LoadingState />
  if (me.isError) return <LoadError error={me.error} retry={() => me.refetch()} />
  return <div className="space-y-7"><h1 className={pageTitle}>Your community profile</h1><div className="grid gap-6 lg:grid-cols-[1fr_2fr]"><Card title={me.data.displayName || 'Community member'}><p className="break-all">{me.data.email}<br />{me.data.phone || 'No phone on profile'}</p><Link to="/sign-in" className={`${linkButtonClass} mt-4`}>{fixture ? 'Change demo profile' : 'Manage profile'}</Link></Card><div className="space-y-6"><Card title="Your applications">{apps.isPending ? <LoadingState /> : apps.isError ? <LoadError error={apps.error} retry={() => apps.refetch()} /> : !apps.data.length ? (me.data.role === 'staff' ? <EmptyState title="Staff account"><Link to="/admin" className={linkButtonClass}>Open staff dashboard</Link></EmptyState> : <EmptyState title="Your first night starts here"><Link to="/">Explore events</Link></EmptyState>) : <ul className="divide-y divide-border">{apps.data.map(app => <li key={app.id} className="space-y-3 py-4"><h2 className="font-semibold">{app.event.title}</h2><ApplicationStatusBadge status={app.status} /><div><Link to={`/applications/${app.id}`} className={linkButtonClass}>View application</Link></div></li>)}</ul>}</Card>
      <Card title="Recorded activity">{activity.isPending ? <LoadingState /> : activity.isError ? <LoadError error={activity.error} retry={() => activity.refetch()} /> : !activity.data.length ? <EmptyState title="No activity recorded yet">New fans are welcome. Your activity appears as it is recorded.</EmptyState> : <ul className="divide-y divide-border">{activity.data.map(item => <li key={item.id} className="space-y-1 py-3"><p className="font-semibold">{{ application: 'Application submitted', invitation_accepted: 'Invitation accepted', attendance: 'Attendance confirmed' }[item.type]}</p><p>{item.eventTitle}</p><p className="text-sm text-muted">{formatDateTime(item.timestamp)} · {item.source}{item.isDemo ? ' · Demo record' : ''}</p></li>)}</ul>}</Card></div></div></div>
}

export function FanSignInPage() {
  if (!fixture) return <LiveSignIn />
  return <FixtureProfile />
}

function LiveSignIn() {
  const queries = useQueryClient()
  const me = useQuery(meOptions)
  const [email, setEmail] = useState('')
  const [values, setValues] = useState<{ displayName: string; phone: string } | null>(null)
  const draft = values || { displayName: me.data?.displayName || '', phone: me.data?.phone || '' }
  const trimmedPhone = draft.phone.trim()
  const normalizedPhone = trimmedPhone ? normalizePhone(trimmedPhone) : null
  const phoneInvalid = Boolean(trimmedPhone && !normalizedPhone)
  const mutation = useMutation({
    mutationFn: () => requestMagicLink(email.trim().toLowerCase(), new URL('/', window.location.origin).href),
  })
  const saveProfile = useMutation({
    mutationFn: () =>
      updateLiveProfile({
        displayName: draft.displayName.trim() || me.data?.email.split('@')[0] || 'Fan',
        phone: normalizedPhone,
      }),
    onSuccess: async () => {
      setValues(null)
      await queries.invalidateQueries()
    },
  })
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      setValues(null)
      queries.resetQueries()
    },
  })
  return <div className="mx-auto max-w-xl space-y-6"><h1 className={pageTitle}>{me.data ? 'Manage profile' : 'Sign in'}</h1>
    {me.data && <Card title={`Signed in as ${me.data.email}`}>
      <form className="space-y-5" onSubmit={submit => { submit.preventDefault(); if (!saveProfile.isPending && !phoneInvalid) saveProfile.mutate() }}>
        <Field label="Display name" htmlFor="live-display-name">
          <input id="live-display-name" value={draft.displayName} onChange={change => setValues({ ...draft, displayName: change.target.value })}
            className={inputClass} type="text" required maxLength={80} disabled={saveProfile.isPending} />
        </Field>
        <Field label="FaceTime phone number" htmlFor="live-phone" hint="Optional E.164 format, e.g. +12025550123"
          error={phoneInvalid ? 'Enter a valid E.164 phone number (e.g. +12025550123) or leave blank.' : undefined}>
          <input id="live-phone" value={draft.phone} onChange={change => setValues({ ...draft, phone: change.target.value })}
            className={inputClass} type="tel" maxLength={24} disabled={saveProfile.isPending} />
        </Field>
        {saveProfile.isError && <ErrorState error={saveProfile.error} />}
        {saveProfile.isSuccess && <Notice tone="ok">Profile saved.</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" disabled={saveProfile.isPending || phoneInvalid || !draft.displayName.trim()}>
            {saveProfile.isPending ? 'Saving…' : 'Save profile'}
          </Button>
          <Button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Sign out
          </Button>
        </div>
      </form>
    </Card>}
    <Card title={me.data ? 'Switch account' : undefined}>
      <form className="space-y-5" onSubmit={submit => { submit.preventDefault(); if (!mutation.isPending) mutation.mutate() }}>
        <Field label="Demo email" htmlFor="live-email" hint="Use an @example.test address, then open the link in Mailpit.">
          <input id="live-email" value={email} onChange={change => setEmail(change.target.value)}
            className={inputClass} type="email" required pattern=".+@example[.]test" maxLength={254} />
        </Field>
        {mutation.isError && <ErrorState error={mutation.error} />}
        {mutation.isSuccess && <Notice>
          <a className="font-semibold underline" href="http://127.0.0.1:8025" target="_blank" rel="noopener noreferrer">
            Open Mailpit
          </a>{' '}and click the sign-in link in your latest message.
        </Notice>}
        <Button type="submit" variant="primary" disabled={mutation.isPending}>Send sign-in link</Button>
      </form>
    </Card>
  </div>
}

function FixtureProfile() {
  const me = useQuery(meOptions)
  const queries = useQueryClient()
  const navigate = useNavigate()
  const [values, setValues] = useState<FixtureFanInput | null>(null)
  const draft = values || { displayName: me.data?.displayName || 'Demo Fan', email: me.data?.email || 'fan@example.com', phone: me.data?.phone || '+12025550123' }
  const mutation = useMutation({ mutationFn: () => api.setFixtureFan(draft), onSuccess: async () => { await queries.invalidateQueries(); navigate('/profile') } })
  return <div className="mx-auto max-w-xl space-y-6"><h1 className={pageTitle}>Your demo profile</h1><Card><form className="space-y-5" onSubmit={submit => { submit.preventDefault(); if (!mutation.isPending) mutation.mutate() }}><Notice tone="warn">Fictional account configuration only. No authentication takes place. Use sample details, which stay in this browser.</Notice>{(['displayName','email','phone'] as const).map(name => <Field key={name} label={{displayName:'Display name',email:'Email',phone:'FaceTime phone number'}[name]} htmlFor={`fan-${name}`}><input id={`fan-${name}`} type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'} className={inputClass} value={draft[name]} onChange={change => setValues({ ...draft, [name]: change.target.value })} required disabled={mutation.isPending} maxLength={name === 'phone' ? 24 : 120} /></Field>)}{mutation.isError && <ErrorState error={mutation.error} />}<Button type="submit" variant="primary" disabled={mutation.isPending}>Save demo profile</Button></form></Card></div>
}
