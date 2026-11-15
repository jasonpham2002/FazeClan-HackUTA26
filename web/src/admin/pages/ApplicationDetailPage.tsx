import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Answer, ApplicationDetail, Question, TranscriptSegment } from '../../api/types'
import { Icon } from '../../components/ui/Icon'
import {
  ApplicationStatusBadge,
  CallStatusBadge,
  CompletenessBadge,
  ProcessingBadge,
} from '../../components/ui/StatusBadge'
import { Badge, Button, ErrorState, LoadingState, Notice, Section, Tag } from '../../components/ui/ui'
import { formatDateTime, formatDuration, formatOffset } from '../../lib/format'
import { normalizeOrder } from '../../lib/interviewConfig'
import { applyLiveScript, fetchLiveLines } from '../../lib/liveTranscript'
import { DecisionPanel } from '../components/DecisionPanel'

const activityLabels = {
  application: 'Applied',
  invitation_accepted: 'Accepted invitation',
  attendance: 'Attended',
} as const

export function ApplicationDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['application', id], queryFn: () => api.getApplication(id) })
  const live = useQuery({
    queryKey: ['call-transcript', id],
    queryFn: () => fetchLiveLines(id),
    enabled: id.length > 0,
    refetchInterval: 2000,
    retry: false,
  })

  if (!query.data) {
    return query.isError ? (
      <ErrorState error={query.error} onRetry={() => query.refetch()} />
    ) : (
      <LoadingState label="Loading application…" />
    )
  }
  return (
    <>
      {query.isError && (
        <div className="mb-4">
          <Notice tone="danger">
            Could not refresh this application; showing the last loaded data.{' '}
            <button type="button" className="underline" onClick={() => query.refetch()}>
              Try again
            </button>
          </Notice>
        </div>
      )}
      {/* Keyed so open/highlight/form state never carries over between applicants. */}
      <ApplicationDetailView
        key={query.data.id}
        app={applyLiveScript(query.data, live.data ?? [])}
        live={Boolean(live.data?.length)}
        liveUnavailable={live.isError && query.data.transcript.length === 0}
      />
    </>
  )
}

function ApplicationDetailView({ app, live, liveUnavailable }: { app: ApplicationDetail; live: boolean; liveUnavailable: boolean }) {
  const { result } = app
  const selectedAttempt = app.attempts.find((a) => a.id === app.selectedAttemptId) ?? null
  const latestAttempt = app.attempts.at(-1) ?? null

  const questions = useMemo(() => normalizeOrder(app.interviewVersion.config.questions), [app])
  const transcript = useMemo(() => {
    const callId = result?.callAttemptId ?? app.selectedAttemptId
    const segments = callId ? app.transcript.filter((s) => s.callAttemptId === callId) : app.transcript
    return [...segments].sort((a, b) => a.sequence - b.sequence)
  }, [app, result])
  const segmentById = useMemo(() => new Map(transcript.map((s) => [s.id, s])), [transcript])
  const answerByQuestion = useMemo(() => new Map((result?.answers ?? []).map((a) => [a.questionId, a])), [result])

  // Which question(s) each transcript line is cited by, so the link reads both ways.
  const citedBy = useMemo(() => {
    const orderById = new Map(questions.map((q) => [q.id, q.order]))
    const map = new Map<string, number[]>()
    for (const answer of result?.answers ?? []) {
      const order = orderById.get(answer.questionId)
      if (order === undefined) continue
      for (const segmentId of answer.transcriptSegmentIds) map.set(segmentId, [...(map.get(segmentId) ?? []), order])
    }
    return map
  }, [questions, result])

  const questionIds = new Set(questions.map((q) => q.id))
  const orphanAnswers = (result?.answers ?? []).filter((a) => !questionIds.has(a.questionId))
  const versionMismatch = result !== null && result.interviewVersionId !== app.interviewVersion.versionId
  const startedAt = transcript[0]?.timestamp ?? null

  // Without a structured result the transcript is the only evidence, so open it.
  const [transcriptOpen, setTranscriptOpen] = useState(live || (result === null && transcript.length > 0))
  const [highlight, setHighlight] = useState<string | null>(null)

  useEffect(() => {
    if (live) setTranscriptOpen(true)
  }, [live])

  useEffect(() => {
    if (highlight && transcriptOpen) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document
        .getElementById(`segment-${highlight}`)
        ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    }
  }, [highlight, transcriptOpen])

  const jumpTo = (segmentId: string) => {
    setTranscriptOpen(true)
    setHighlight(segmentId)
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link
          to={`/admin/events/${app.event.id}/applications`}
          className="inline-flex h-9 items-center gap-1.5 text-sm text-muted transition-colors duration-150 hover:text-text"
        >
          <Icon name="arrowLeft" />
          Applications for {app.event.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="title-display text-4xl">{app.applicant.displayName ?? app.applicant.email}</h1>
          <ApplicationStatusBadge status={app.status} />
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Meta label="Email">{app.applicant.email}</Meta>
          <Meta label="Applied">{formatDateTime(app.submittedAt)}</Meta>
          <Meta label="Event">{app.event.title}</Meta>
          <Meta label="Interview version">
            Version {app.interviewVersion.versionNumber}
            <span className="text-muted"> · published {formatDateTime(app.interviewVersion.publishedAt)}</span>
          </Meta>
        </dl>
      </header>

      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <div className="flex flex-col gap-4">
            <InterviewStatus app={app} live={live} />
            {liveUnavailable && (
              <Notice tone="warn">
                The live call script could not be read, and this application has no transcript stored for staff review.
              </Notice>
            )}

            {versionMismatch && (
              <Notice tone="warn">
                The result was produced for interview version ID {result.interviewVersionId}, but this application is
                pinned to {app.interviewVersion.versionId}. Answers may not line up with the questions shown.
              </Notice>
            )}

            {result && (
              <div>
                <p className="max-w-[68ch] text-[1.0625rem] leading-relaxed">
                  {result.summary || <span className="text-muted">No summary was provided.</span>}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Stated interests</span>
                  {result.interests.length > 0 ? (
                    result.interests.map((interest) => <Tag key={interest}>{interest}</Tag>)
                  ) : (
                    <span className="text-muted">None recorded</span>
                  )}
                </div>
                {result.reviewNotes.length > 0 && (
                  <ul className="mt-3 flex max-w-[68ch] flex-col gap-1 text-sm text-muted">
                    {result.reviewNotes.map((note, index) => (
                      <li key={index}>Note: {note}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[0.8125rem] text-subtle">
                  Summaries are generated from the transcript. Check the supporting excerpts before deciding.
                </p>
              </div>
            )}
          </div>

          <Section
            title="Questions and answers"
            meta={`Version ${app.interviewVersion.versionNumber}, as this applicant was asked`}
          >
            <ol className="flex flex-col divide-y divide-border">
              {questions.map((question) => (
                <QAItem
                  key={question.id}
                  question={question}
                  answer={answerByQuestion.get(question.id)}
                  hasResult={result !== null}
                  segmentById={segmentById}
                  startedAt={startedAt}
                  onJump={jumpTo}
                />
              ))}
            </ol>
            {orphanAnswers.length > 0 && (
              <div className="mt-4">
                <Notice tone="warn">
                  The result contains {orphanAnswers.length} answer(s) for question IDs that are not part of this
                  interview version: {orphanAnswers.map((a) => a.questionId).join(', ')}.
                </Notice>
              </div>
            )}
          </Section>

          <Section
            title="Transcript"
            meta={transcript.length > 0 ? `${transcript.length} lines` : undefined}
            actions={
              transcript.length > 0 && (
                <Button size="sm" aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen((open) => !open)}>
                  {transcriptOpen ? 'Hide transcript' : 'Show transcript'}
                </Button>
              )
            }
          >
            {transcript.length === 0 ? (
              <p className="text-sm text-muted">No transcript was recorded.</p>
            ) : transcriptOpen ? (
              <Transcript segments={transcript} highlight={highlight} citedBy={citedBy} />
            ) : (
              <p className="text-sm text-muted">
                Hidden. Open an answer's evidence and choose "View in transcript" to jump to the exact line.
              </p>
            )}
          </Section>

          <Section title="Call attempts">
            {app.attempts.length === 0 ? (
              <p className="text-sm text-muted">No call has been requested yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {app.attempts.map((attempt, index) => (
                  <li
                    key={attempt.id}
                    className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="text-muted">Attempt {index + 1}</span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <CallStatusBadge status={attempt.status} />
                      {attempt.processingStatus && <ProcessingBadge status={attempt.processingStatus} />}
                      <span className="text-muted tabular-nums">
                        {formatDateTime(attempt.startedAt)} · {formatDuration(attempt.durationSeconds)}
                        {attempt.failureCode ? ` · ${attempt.failureCode}` : ''}
                      </span>
                      {attempt.id === app.selectedAttemptId && <Tag>Shown above</Tag>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {!selectedAttempt && latestAttempt && (
              <p className="mt-3 text-[0.8125rem] text-muted">No attempt produced an interview to review.</p>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-6">
          <DecisionPanel app={app} />

          <Section title="Recorded activity">
            {app.activity.length === 0 ? (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {app.activity.map((item) => (
                  <li key={item.id} className="text-sm">
                    <p>
                      <span className="font-medium">{activityLabels[item.type] ?? item.type}</span>
                      {item.eventTitle && <span className="text-muted"> · {item.eventTitle}</span>}
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                      {formatDateTime(item.timestamp)} · Source: {item.source}
                    </p>
                    {item.isDemo && (
                      <div className="mt-1">
                        <Badge tone="warn">Synthetic demo record</Badge>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[0.8125rem] text-subtle">
              Only activity observed on this platform is listed. Applying, accepting, and attending are separate records.
            </p>
          </Section>

          <Section title="Past applications">
            {app.pastApplications.length === 0 ? (
              <p className="text-sm text-muted">No earlier applications.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {app.pastApplications.map((past) => (
                  <li key={past.id} className="text-sm">
                    <p className="font-medium">{past.eventTitle}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
                      <ApplicationStatusBadge status={past.status} />
                      {formatDateTime(past.submittedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  )
}

/** One plain-language line about where the interview stands, so gaps are never silent. */
function InterviewStatus({ app, live }: { app: ApplicationDetail; live: boolean }) {
  const selected = app.attempts.find((a) => a.id === app.selectedAttemptId) ?? null
  const latest = app.attempts.at(-1) ?? null

  if (live) {
    return (
      <Notice tone="info">
        This is the live FaceTime script. Each question below uses the applicant's reply from that script. It is not stored in the database yet.
      </Notice>
    )
  }
  if (!latest) return <Notice tone="info">This applicant has not had an interview call yet.</Notice>
  if (!selected) {
    return (
      <Notice tone="warn">
        No interview is available to review. The latest call attempt was {latest.status}. This is not a decision about
        the applicant.
      </Notice>
    )
  }
  if (selected.processingStatus === 'failed') {
    return (
      <Notice tone="danger">
        <strong>Answer extraction failed.</strong> The call took place and its transcript was kept, but structured
        answers are not available. Read the transcript below.
      </Notice>
    )
  }
  if (selected.processingStatus === 'pending' || (!app.result && selected.status === 'completed')) {
    return <Notice tone="info">The call has finished and its answers are still being processed.</Notice>
  }
  if (selected.status !== 'completed') {
    return (
      <Notice tone="warn">
        <strong>Partial interview.</strong> The call ended early ({selected.failureCode ?? selected.status}) after{' '}
        {formatDuration(selected.durationSeconds)}. Unasked questions are marked below.
      </Notice>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <CallStatusBadge status={selected.status} />
      <ProcessingBadge status={selected.processingStatus} />
      <span className="text-muted tabular-nums">Call duration {formatDuration(selected.durationSeconds)}</span>
    </div>
  )
}

function QAItem({
  question,
  answer,
  hasResult,
  segmentById,
  startedAt,
  onJump,
}: {
  question: Question
  answer: Answer | undefined
  hasResult: boolean
  segmentById: Map<string, TranscriptSegment>
  startedAt: string | null
  onJump: (segmentId: string) => void
}) {
  const evidence = (answer?.transcriptSegmentIds ?? []).map((id) => ({ id, segment: segmentById.get(id) }))
  const found = evidence.filter((e) => e.segment)
  const missing = evidence.filter((e) => !e.segment)
  const claimsContent = answer?.completeness === 'answered' || answer?.completeness === 'partial'

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-6 first:pt-1 last:pb-0 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
      <span aria-hidden="true" className="figure pt-0.5 text-2xl text-subtle">
        {String(question.order).padStart(2, '0')}
      </span>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <h3 className="max-w-[60ch] text-base leading-snug font-semibold">
            <span className="sr-only">Question {question.order}: </span>
            {question.prompt}
          </h3>
          {answer ? <CompletenessBadge value={answer.completeness} /> : <Badge tone="warn">No answer available</Badge>}
        </div>
        <p className="text-[0.8125rem] text-muted">
          {question.purpose || 'No purpose given'} · {question.required ? 'Required' : 'Optional'}
        </p>

        {!answer ? (
          <p className="text-sm text-muted">
            {hasResult
              ? 'The interview result does not include this question.'
              : 'There is no structured result for this interview, so no answer can be shown.'}
          </p>
        ) : (
          <>
            <p className="max-w-[68ch] leading-relaxed">
              {answer.summary.trim() || <span className="text-muted">No answer recorded.</span>}
            </p>

            {claimsContent && evidence.length === 0 && (
              <Notice tone="warn">No supporting transcript evidence was linked to this summary.</Notice>
            )}
            {missing.length > 0 && (
              <Notice tone="warn">
                {missing.length} referenced transcript segment(s) could not be found: {missing.map((e) => e.id).join(', ')}.
              </Notice>
            )}

            {found.length > 0 && (
              <details className="group text-sm">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md text-muted transition-colors duration-150 hover:text-text [&::-webkit-details-marker]:hidden">
                  <Icon name="chevronDown" className="size-4 -rotate-90 transition-transform duration-150 group-open:rotate-0" />
                  Evidence · {found.length} transcript excerpt{found.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-1 flex flex-col gap-2">
                  {found.map(({ id, segment }) => (
                    <li key={id} className="max-w-[68ch] rounded-lg bg-surface px-4 py-3">
                      <blockquote className="leading-relaxed before:content-['“'] after:content-['”']">
                        {segment!.text}
                      </blockquote>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
                        <span>
                          {segment!.speaker === 'agent' ? 'AI host' : 'Applicant'}
                          {startedAt && <span className="tabular-nums"> · {formatOffset(startedAt, segment!.timestamp)}</span>}
                        </span>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 font-medium text-text underline decoration-border-strong hover:decoration-text"
                          onClick={() => onJump(id)}
                        >
                          View in transcript
                          <Icon name="arrowDown" className="size-3.5" />
                        </button>
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/** Transcript text is untrusted: it is rendered as plain text nodes only. */
function Transcript({
  segments,
  highlight,
  citedBy,
}: {
  segments: TranscriptSegment[]
  highlight: string | null
  citedBy: Map<string, number[]>
}) {
  const startedAt = segments[0].timestamp
  return (
    <ol
      aria-label="Interview transcript"
      className="max-h-[34rem] overflow-y-auto rounded-xl border border-border bg-surface py-2"
    >
      {segments.map((segment) => {
        const isAgent = segment.speaker === 'agent'
        const isHighlighted = highlight === segment.id
        const cited = citedBy.get(segment.id)
        return (
          <li
            key={segment.id}
            id={`segment-${segment.id}`}
            className={`grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 px-4 py-2.5 text-sm transition-colors duration-200 sm:grid-cols-[3rem_5.5rem_minmax(0,1fr)] sm:px-5 ${
              isHighlighted ? 'bg-warn/12' : ''
            }`}
          >
            <span className="text-[0.8125rem] leading-6 text-subtle tabular-nums">
              {formatOffset(startedAt, segment.timestamp)}
            </span>
            <span className={`leading-6 font-medium ${isAgent ? 'text-muted' : 'text-text'}`}>
              {isAgent ? 'AI host' : 'Applicant'}
            </span>
            <div className="col-start-2 min-w-0 sm:col-start-3">
              <p className={`max-w-[68ch] leading-6 whitespace-pre-wrap ${isAgent ? 'text-muted' : 'text-text'}`}>
                {segment.text}
              </p>
              {(cited || isHighlighted) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.8125rem]">
                  {isHighlighted && <Badge tone="warn">Linked evidence</Badge>}
                  {cited && (
                    <span className="text-muted">
                      Cited for question{cited.length === 1 ? '' : 's'} {cited.join(', ')}
                    </span>
                  )}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
