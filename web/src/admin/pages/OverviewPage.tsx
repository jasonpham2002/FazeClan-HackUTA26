import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { Analytics, EventRecord } from '../../api/types'
import { CallStatusBadge, ProcessingBadge, PublicationBadge } from '../../components/ui/StatusBadge'
import {
  EmptyState,
  ErrorState,
  inputClass,
  linkButtonClass,
  linkClass,
  LoadingState,
  Section,
} from '../../components/ui/ui'
import { describeRate, formatDateTime, formatRate } from '../../lib/format'

export function OverviewPage() {
  const events = useQuery({ queryKey: ['events'], queryFn: api.listAdminEvents })
  const [params, setParams] = useSearchParams()

  if (!events.data) {
    return events.isError ? (
      <ErrorState error={events.error} onRetry={() => events.refetch()} />
    ) : (
      <LoadingState label="Loading events…" />
    )
  }
  if (events.data.length === 0) {
    return (
      <EmptyState title="No events yet">
        Create an event, publish its interview, and applications will appear here.{' '}
        <Link to="/admin/events/new" className={linkClass}>
          Create the first event
        </Link>
      </EmptyState>
    )
  }

  const selected = events.data.find((e) => e.id === params.get('event')) ?? events.data[0]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="title-display text-4xl">{selected.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            <span className="text-text">
              <PublicationBadge status={selected.publicationStatus} />
            </span>
            <span>{formatDateTime(selected.startsAt, selected.timezone)}</span>
            <span>{selected.location}</span>
            <span className="tabular-nums">Capacity {selected.capacity}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {events.data.length > 1 && (
            <div>
              <label htmlFor="event-select" className="sr-only">
                Event
              </label>
              <select
                id="event-select"
                className={`${inputClass} w-auto`}
                value={selected.id}
                onChange={(e) => setParams({ event: e.target.value })}
              >
                {events.data.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Link to="/admin/events/new" className={linkButtonClass}>
            New event
          </Link>
        </div>
      </div>

      <nav aria-label="Event sections" className="flex flex-wrap gap-2">
        <Link to={`/admin/events/${selected.id}/applications`} className={linkButtonClass}>
          Applications
        </Link>
        <Link to={`/admin/events/${selected.id}/interview`} className={linkButtonClass}>
          Interview
        </Link>
        <Link to={`/admin/events/${selected.id}`} className={linkButtonClass}>
          Event details
        </Link>
      </nav>

      <EventOverview key={selected.id} event={selected} />
    </div>
  )
}

function EventOverview({ event }: { event: EventRecord }) {
  const analytics = useQuery({ queryKey: ['analytics', event.id], queryFn: () => api.getAnalytics(event.id) })
  const queueArgs = { eventId: event.id, status: 'review_pending' as const, page: 1, pageSize: 5 }
  const queue = useQuery({ queryKey: ['applications', queueArgs], queryFn: () => api.listApplications(queueArgs) })

  return (
    <div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        {!analytics.data ? (
          analytics.isError ? (
            <ErrorState error={analytics.error} onRetry={() => analytics.refetch()} />
          ) : (
            <LoadingState label="Loading counts…" />
          )
        ) : (
          <AnalyticsView data={analytics.data} />
        )}
      </div>

      <Section
        title="Review queue"
        meta={analytics.data ? `${analytics.data.reviewsPending} pending` : undefined}
        actions={
          <Link to={`/admin/events/${event.id}/applications?status=review_pending`} className={`${linkClass} text-sm`}>
            View all pending
          </Link>
        }
      >
        {!queue.data ? (
          queue.isError ? (
            <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
          ) : (
            <LoadingState />
          )
        ) : queue.data.items.length === 0 ? (
          <p className="text-sm text-muted">No applications are waiting for review.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {queue.data.items.map((item) => (
              <li key={item.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <Link to={`/admin/applications/${item.id}`} className={linkClass}>
                    {item.applicant.displayName ?? item.applicant.email}
                  </Link>
                  <span className="text-[0.8125rem] text-muted tabular-nums">{formatDateTime(item.submittedAt)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <CallStatusBadge status={item.latestCallStatus} />
                  <ProcessingBadge status={item.processingStatus} />
                </div>
              </li>
            ))}
            {queue.data.total > queue.data.items.length && (
              <li className="pt-3 text-[0.8125rem] text-muted">
                Showing {queue.data.items.length} of {queue.data.total}.
              </li>
            )}
          </ul>
        )}
      </Section>
    </div>
  )
}

function AnalyticsView({ data }: { data: Analytics }) {
  // One list carries every count; no separate tiles repeating the same numbers.
  const funnel: [string, number][] = [
    ['Applications received', data.applications],
    ['Calls attempted', data.callsAttempted],
    ['Calls connected', data.callsConnected],
    ['Interviews completed', data.interviewsCompleted],
    ['Reviews pending', data.reviewsPending],
    ['Invitations issued', data.invitationsIssued],
    ['Invitations accepted', data.invitationsAccepted],
  ]
  const max = Math.max(1, ...funnel.map(([, value]) => value))

  return (
    <div className="flex flex-col gap-10">
      <Section title="Applications and calls">
        <ul className="flex flex-col gap-3.5">
          {funnel.map(([label, value]) => (
            <li
              key={label}
              className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_2.5rem] items-center gap-x-4 text-sm"
            >
              <span className="text-muted">{label}</span>
              <span className="h-2 rounded-full bg-surface-2" aria-hidden="true">
                <span
                  className="block h-2 rounded-full bg-text/70"
                  style={{ width: `${(value / max) * 100}%`, minWidth: value > 0 ? '0.5rem' : 0 }}
                />
              </span>
              <span className="figure text-right text-2xl">{value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-[68ch] text-[0.8125rem] text-subtle">
          Counts are event totals from the server. One applicant can have several call attempts, so calls attempted can
          exceed applications.
        </p>
      </Section>

      <Section title="Rates">
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Connection rate</dt>
            <dd className="figure mt-2 text-4xl">{formatRate(data.connectionRate)}</dd>
            <dd className="mt-2 text-[0.8125rem] text-muted">
              {describeRate(data.connectionRate, 'attempted calls', 'connected')}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Interview completion rate</dt>
            <dd className="figure mt-2 text-4xl">{formatRate(data.completionRate)}</dd>
            <dd className="mt-2 text-[0.8125rem] text-muted">
              {describeRate(data.completionRate, 'connected calls', 'completed')}
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  )
}
