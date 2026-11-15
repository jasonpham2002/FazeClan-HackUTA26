import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { ApplicationStatus, CallStatus } from '../../api/types'
import {
  ApplicationStatusBadge,
  applicationStatusLabels,
  CallStatusBadge,
  callStatusLabels,
  DecisionBadge,
  ProcessingBadge,
} from '../../components/ui/StatusBadge'
import { Button, EmptyState, ErrorState, inputClass, linkClass, LoadingState } from '../../components/ui/ui'
import { formatDateTime } from '../../lib/format'

const PAGE_SIZE = 10

export function ApplicationListPage() {
  const { id: eventId = '' } = useParams()
  // Filters live in the URL so a refresh or shared link shows the same queue.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as ApplicationStatus | ''
  const callStatus = (params.get('callStatus') ?? '') as CallStatus | ''
  const search = params.get('search') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [searchDraft, setSearchDraft] = useState(search)

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const queryArgs = {
    eventId,
    status: status || undefined,
    callStatus: callStatus || undefined,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  }
  const query = useQuery({
    queryKey: ['applications', queryArgs],
    queryFn: () => api.listApplications(queryArgs),
    placeholderData: keepPreviousData,
  })
  const hasFilters = !!(status || callStatus || search)
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1

  return (
    <>
      <h1 className="title-display text-3xl">Applications</h1>

      <form
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          setFilter('search', searchDraft.trim())
        }}
      >
        <div className="flex gap-2">
          <input
            aria-label="Search by applicant name or email"
            placeholder="Search name or email"
            className={inputClass}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Button type="submit">Search</Button>
        </div>
        <select
          aria-label="Application status"
          className={inputClass}
          value={status}
          onChange={(event) => setFilter('status', event.target.value)}
        >
          <option value="">Any application status</option>
          {Object.entries(applicationStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Latest call status"
          className={inputClass}
          value={callStatus}
          onChange={(event) => setFilter('callStatus', event.target.value)}
        >
          <option value="">Any call status</option>
          {Object.entries(callStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchDraft('')
              setParams(new URLSearchParams())
            }}
          >
            Clear filters
          </Button>
        )}
      </form>

      <div className="mt-5">
        {!query.data ? (
          query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <LoadingState label="Loading applications…" />
          )
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState title={hasFilters ? 'No applications match these filters' : 'No applications yet'}>
            {hasFilters ? 'Try clearing a filter.' : 'Applications appear here as fans apply.'}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="border-b border-border text-[0.8125rem] text-muted">
                  <tr>
                    {['Applicant', 'Event', 'Submitted', 'Application', 'Latest call', 'Result', 'Decision'].map((heading) => (
                      <th key={heading} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y divide-border ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
                  {query.data.items.map((item) => (
                    <tr key={item.id} className="transition-colors duration-150 hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <Link to={`/admin/applications/${item.id}`} className={linkClass}>
                          {item.applicant.displayName ?? item.applicant.email}
                        </Link>
                        <div className="text-[0.8125rem] text-muted">{item.applicant.email}</div>
                      </td>
                      <td className="px-4 py-3">{item.event.title}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(item.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <ApplicationStatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3">
                        <CallStatusBadge status={item.latestCallStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <ProcessingBadge status={item.processingStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <DecisionBadge decision={item.decision} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted tabular-nums">
              <span>
                {query.data.total} application{query.data.total === 1 ? '' : 's'} · newest first · page {page} of {totalPages}
              </span>
              <span className="flex gap-2">
                <Button size="sm" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}>
                  Previous
                </Button>
                <Button size="sm" disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))}>
                  Next
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
    </>
  )
}
