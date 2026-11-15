import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { EventInsights, InsightsReport, QuestionInsight, Rate } from '../../api/types'
import { Badge, EmptyState, ErrorState, inputClass, linkClass, LoadingState, Notice, Section } from '../../components/ui/ui'
import { EM_DASH, formatDateTime, formatRate } from '../../lib/format'
import { eventSuggestions, isOftenUnanswered, MIN_SAMPLE, retentionSuggestions, unansweredShare } from '../../lib/insights'

/** "78% · 7 of 9", or an em dash when there is no denominator. */
function rateText(rate: Rate | null): string {
  if (!rate || !(rate.denominator > 0)) return EM_DASH
  return `${formatRate(rate)} · ${rate.numerator} of ${rate.denominator}`
}

function dateOnly(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }).format(new Date(iso))
}

export function InsightsPage() {
  const query = useQuery({ queryKey: ['insights'], queryFn: api.getInsights })
  const [params, setParams] = useSearchParams()

  if (!query.data) {
    return query.isError ? (
      <ErrorState error={query.error} onRetry={() => query.refetch()} />
    ) : (
      <LoadingState label="Loading insights…" />
    )
  }
  const report = query.data
  if (report.events.length === 0) {
    return <EmptyState title="No events yet">Insights appear once you have events with applications.</EmptyState>
  }

  // Default to the most recent past event: it has the most to learn from.
  const selected =
    report.events.find((item) => item.event.id === params.get('event')) ??
    report.events.find((item) => item.phase === 'past') ??
    report.events[0]

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="title-display text-4xl">Insights</h1>
        <p className="mt-2 max-w-[68ch] text-muted">
          Turnout, returning fans and interview patterns across your events, to help plan the next one.
        </p>
        {report.includesDemoData && (
          <div className="mt-4 max-w-[78ch]">
            <Notice tone="warn">
              These numbers include synthetic sample history, including two past sample events. They are not real fans.
            </Notice>
          </div>
        )}
      </header>

      <EventsCompared report={report} selectedId={selected.event.id} onSelect={(id) => setParams({ event: id })} />

      <Retention report={report} />

      <section aria-labelledby="deep-dive-title" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-3">
          <div className="min-w-0">
            <h2 id="deep-dive-title" className="title-display text-3xl">{selected.event.title}</h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <Badge tone={selected.phase === 'past' ? 'neutral' : 'info'}>
                {selected.phase === 'past' ? 'Past event' : 'Upcoming'}
              </Badge>
              <span>{formatDateTime(selected.event.startsAt, selected.event.timezone)}</span>
              <span className="tabular-nums">Capacity {selected.event.capacity}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="insights-event" className="text-sm text-muted">
              Event
            </label>
            <select
              id="insights-event"
              className={`${inputClass} w-auto`}
              value={selected.event.id}
              onChange={(e) => setParams({ event: e.target.value })}
            >
              {report.events.map((item) => (
                <option key={item.event.id} value={item.event.id}>
                  {item.event.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <EventDeepDive key={selected.event.id} insight={selected} />
      </section>

      <Definitions />
    </div>
  )
}

function EventsCompared({
  report,
  selectedId,
  onSelect,
}: {
  report: InsightsReport
  selectedId: string
  onSelect: (id: string) => void
}) {
  const headings = ['Event', 'Applied', 'Accepted', 'Attended', 'Show-up rate', 'Places filled', 'Returning applicants']
  return (
    <Section title="Events compared" meta="Newest first. Select an event to see its details below.">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-border text-[0.8125rem] text-muted">
            <tr>
              {headings.map((heading, index) => (
                <th key={heading} scope="col" className={`px-4 py-3 font-medium whitespace-nowrap ${index > 0 ? 'text-right' : ''}`}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.events.map((item) => {
              const { funnel, event } = item
              const isSelected = event.id === selectedId
              const notYet = item.phase === 'upcoming' ? 'Upcoming' : 'Not recorded'
              return (
                <tr key={event.id} className={isSelected ? 'bg-surface-2' : 'transition-colors duration-150 hover:bg-surface-2'}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <button
                      type="button"
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => onSelect(event.id)}
                      className={`${linkClass} text-left`}
                    >
                      {event.title}
                    </button>
                    <div className="text-[0.8125rem] text-muted">{dateOnly(event.startsAt, event.timezone)}</div>
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">{funnel.applied}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{funnel.accepted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.attendanceRecorded ? funnel.attended : <span className="text-muted">{notYet}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {item.showUp ? rateText(item.showUp) : <span className="text-muted">{EM_DASH}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {item.fill ? rateText(item.fill) : <span className="text-muted">{EM_DASH}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {rateText({ numerator: item.audience.returningFans, denominator: funnel.applied })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Retention({ report }: { report: InsightsReport }) {
  const { retention } = report
  const suggestions = retentionSuggestions(retention)
  return (
    <Section
      title="Did attendees come back?"
      meta={`${retention.repeatFans} of ${retention.fans} fans have applied to more than one event`}
    >
      {retention.cohorts.length === 0 ? (
        <p className="text-sm text-muted">This needs at least one past event followed by a later event.</p>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-5">
          {retention.cohorts.map((cohort) => {
            const share = cohort.attendees > 0 ? cohort.cameBack / cohort.attendees : 0
            return (
              <li key={cohort.eventId}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">{cohort.title}</span>
                  {cohort.attendees === 0 ? (
                    <span className="text-muted">Attendance not recorded</span>
                  ) : (
                    <span className="tabular-nums text-muted">
                      <span className="text-text">{cohort.cameBack}</span> of {cohort.attendees} attendees came back ·{' '}
                      {cohort.attendees - cohort.cameBack} haven't applied again
                    </span>
                  )}
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <span className="block h-full bg-accent" style={{ width: `${share * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="mt-5 flex max-w-3xl flex-col gap-2">
          {suggestions.map((item) => (
            <Notice key={item.id} tone={item.tone}>
              <strong>{item.title}.</strong> {item.detail}
            </Notice>
          ))}
        </div>
      )}
    </Section>
  )
}

function EventDeepDive({ insight }: { insight: EventInsights }) {
  const suggestions = eventSuggestions(insight)
  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section title="For next time">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing stands out yet. Suggestions appear once at least {MIN_SAMPLE} fans have applied, so a handful of
                people can't swing them.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {suggestions.map((item) => (
                  <Notice key={item.id} tone={item.tone}>
                    <strong>{item.title}.</strong> {item.detail}
                  </Notice>
                ))}
              </div>
            )}
          </Section>

          <Funnel insight={insight} />
        </div>

        <div className="flex min-w-0 flex-col gap-10">
          <Audience insight={insight} />
          <Interests insight={insight} />
        </div>
      </div>

      <Questions questions={insight.questions} />
    </div>
  )
}

function Funnel({ insight }: { insight: EventInsights }) {
  const { funnel, dropOff } = insight
  const steps: { label: string; value: number | null; lost?: string; pending?: string }[] = [
    { label: 'Applied', value: funnel.applied },
    {
      label: 'Completed interview',
      value: funnel.interviewed,
      lost: dropOff.noInterview ? `${dropOff.noInterview} without a completed interview` : undefined,
    },
    {
      label: 'Invited',
      value: funnel.invited,
      lost: dropOff.notInvited ? `${dropOff.notInvited} waitlisted or still in review` : undefined,
    },
    {
      label: 'Accepted',
      value: funnel.accepted,
      lost: dropOff.invitedNotAccepted ? `${dropOff.invitedNotAccepted} invited but didn't accept` : undefined,
    },
    {
      label: 'Attended',
      value: insight.attendanceRecorded ? funnel.attended : null,
      lost: dropOff.acceptedNotAttended ? `${dropOff.acceptedNotAttended} accepted but not marked as attended` : undefined,
      pending: insight.phase === 'upcoming' ? 'After the event' : 'Attendance not recorded',
    },
  ]
  const max = Math.max(1, funnel.applied)

  return (
    <Section title="From application to attendance" meta={`Demand ${rateText(insight.demand)} places`}>
      <ol className="flex flex-col gap-4">
        {steps.map((step) => (
          <li key={step.label}>
            <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem] items-center gap-x-4 text-sm">
              <span className="text-muted">{step.label}</span>
              <span className="h-2 rounded-full bg-surface-2" aria-hidden="true">
                {step.value !== null && (
                  <span
                    className="block h-2 rounded-full bg-accent"
                    style={{ width: `${(step.value / max) * 100}%`, minWidth: step.value > 0 ? '0.5rem' : 0 }}
                  />
                )}
              </span>
              <span className="figure text-right text-2xl">{step.value ?? EM_DASH}</span>
            </div>
            {(step.lost || (step.value === null && step.pending)) && (
              <p className="mt-1 text-[0.8125rem] text-muted sm:pl-[10.5rem]">
                {step.value === null ? step.pending : step.lost}
              </p>
            )}
          </li>
        ))}
      </ol>
      {insight.showUp && (
        <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Show-up rate</dt>
            <dd className="figure mt-1.5 text-3xl">{formatRate(insight.showUp)}</dd>
            <dd className="mt-1 text-[0.8125rem] text-muted">
              {insight.showUp.numerator} of {insight.showUp.denominator} accepted fans attended
            </dd>
          </div>
          {insight.fill && (
            <div>
              <dt className="text-sm text-muted">Places filled</dt>
              <dd className="figure mt-1.5 text-3xl">{formatRate(insight.fill)}</dd>
              <dd className="mt-1 text-[0.8125rem] text-muted">
                {insight.fill.numerator} of {insight.fill.denominator} places
              </dd>
            </div>
          )}
        </dl>
      )}
    </Section>
  )
}

function Audience({ insight }: { insight: EventInsights }) {
  const { newFans, returningFans } = insight.audience
  const total = newFans + returningFans
  return (
    <Section title="New and returning applicants">
      {total === 0 ? (
        <p className="text-sm text-muted">No applications yet.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className="block h-full bg-accent" style={{ width: `${(returningFans / total) * 100}%` }} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
              <dt className="text-muted">Returning</dt>
              <dd className="font-semibold tabular-nums">{returningFans}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-surface-2 ring-1 ring-border-strong" />
              <dt className="text-muted">First event</dt>
              <dd className="font-semibold tabular-nums">{newFans}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.8125rem] text-subtle">New fans are welcome; a first event is not a weaker application.</p>
        </>
      )}
    </Section>
  )
}

function Interests({ insight }: { insight: EventInsights }) {
  const max = Math.max(1, ...insight.interests.map((item) => item.count))
  return (
    <Section title="What fans said they want" meta="Stated interests from interviews">
      {insight.interests.length === 0 ? (
        <p className="text-sm text-muted">No interview results with stated interests yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insight.interests.map((item) => (
            <li key={item.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2rem] items-center gap-x-4 text-sm">
              <span className="truncate" title={item.label}>{item.label}</span>
              <span className="h-2 rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-2 rounded-full bg-text/60" style={{ width: `${(item.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Questions({ questions }: { questions: QuestionInsight[] }) {
  return (
    <Section title="How each interview question went">
      {questions.length === 0 ? (
        <p className="text-sm text-muted">No interview results yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-[0.8125rem] whitespace-nowrap text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">Question</th>
                  <th scope="col" className="w-24 px-3 py-2 text-right font-medium">Answered</th>
                  <th scope="col" className="w-24 px-3 py-2 text-right font-medium">Partial</th>
                  <th scope="col" className="w-24 px-3 py-2 text-right font-medium">Skipped</th>
                  <th scope="col" className="w-24 py-2 pl-3 text-right font-medium">Not asked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {questions.map((question, index) => {
                  const flagged = isOftenUnanswered(question)
                  const { count, asked } = unansweredShare(question)
                  return (
                    <tr key={question.questionId}>
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                        <span className="text-muted tabular-nums">{index + 1}.</span> {question.prompt}
                        {flagged && (
                          <div className="mt-1">
                            <Badge tone="warn">
                              Often unanswered · {count} of {asked}
                            </Badge>
                          </div>
                        )}
                      </th>
                      <td className="px-3 py-2.5 text-right tabular-nums">{question.answered}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{question.partial}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{question.skipped}</td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-muted">{question.notAsked}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.8125rem] text-subtle">
            Counts cover fans with an interview result. "Not asked" usually means the call ended early, not that the
            question was a problem.
          </p>
        </>
      )}
    </Section>
  )
}

function Definitions() {
  const items: [string, string][] = [
    ['Returning applicant', 'Applied to at least one event that started earlier.'],
    ['Came back', 'Attended an event, then applied to a later one.'],
    ['Show-up rate', 'Fans marked as attended, out of fans who accepted their invitation.'],
    ['Places filled', 'Fans marked as attended, out of the event capacity.'],
    ['Attendance', "Counted only when staff record it on the application, so unrecorded events show no turnout."],
  ]
  return (
    <Section title="How these numbers are counted">
      <dl className="grid max-w-4xl gap-x-10 gap-y-3 text-sm sm:grid-cols-2">
        {items.map(([term, text]) => (
          <div key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="text-muted">{text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-[78ch] text-[0.8125rem] text-subtle">
        Everything here is about groups of fans and comes only from activity recorded on this platform. It never scores
        or ranks individual fans. With small groups, read the counts, not just the percentages.{' '}
        <Link to="/admin" className={linkClass}>
          Back to dashboard
        </Link>
      </p>
    </Section>
  )
}
