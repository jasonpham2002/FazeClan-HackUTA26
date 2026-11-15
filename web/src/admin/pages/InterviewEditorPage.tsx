import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import type { InterviewConfig, InterviewState, Question } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  describeError,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Notice,
  Section,
} from '../../components/ui/ui'
import { formatDateTime } from '../../lib/format'
import {
  addQuestion,
  configsEqual,
  issueFor,
  LIMITS,
  moveQuestion,
  normalizeOrder,
  removeQuestion,
  validateConfig,
} from '../../lib/interviewConfig'
import { EventTabs } from '../components/EventTabs'

export function InterviewEditorPage() {
  const { id: eventId = '' } = useParams()
  const query = useQuery({ queryKey: ['interview', eventId], queryFn: () => api.getInterview(eventId) })
  // Kept here because the editor below remounts after each successful save.
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <>
      <EventTabs eventId={eventId} />
      {!query.data ? (
        query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <LoadingState label="Loading interview…" />
        )
      ) : (
        // Remounting on a new saved draft resets the form to what the server holds.
        <InterviewEditor
          key={query.data.draftUpdatedAt ?? 'new'}
          eventId={eventId}
          state={query.data}
          notice={notice}
          setNotice={setNotice}
        />
      )}
    </>
  )
}

function InterviewEditor({
  eventId,
  state,
  notice,
  setNotice,
}: {
  eventId: string
  state: InterviewState
  notice: string | null
  setNotice: (notice: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [config, setConfig] = useState<InterviewConfig>(() => ({
    ...state.draft,
    questions: normalizeOrder(state.draft.questions),
  }))

  const issues = useMemo(() => validateConfig(config), [config])
  const dirty = !configsEqual(config, state.draft)
  const valid = issues.length === 0

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['interview', eventId] })

  const save = useMutation({
    mutationFn: () => api.saveInterviewDraft(eventId, config),
    onSuccess: async () => {
      await refresh()
      setNotice('Draft saved. It is not live until you publish it.')
    },
  })
  const publish = useMutation({
    mutationFn: () => api.publishInterview(eventId),
    onSuccess: async () => {
      await refresh()
      setNotice('Published. New applications will get this version.')
    },
  })
  const busy = save.isPending || publish.isPending
  const failed = save.isError ? save : publish.isError ? publish : null

  const update = (patch: Partial<InterviewConfig>) => {
    setNotice(null)
    setConfig((current) => ({ ...current, ...patch }))
  }
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    update({ questions: config.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) })

  const { published } = state
  const canAdd = config.questions.length < LIMITS.maxQuestions

  return (
    <div className="flex flex-col gap-8">
      {/* Sticky so Save and Publish, and what is live, stay in view down a long form. */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-bg px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="title-display text-3xl">Interview</h1>
            {/* Publication state: staff must always be able to tell what applicants would get. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {published ? (
                <Badge tone="ok">
                  Version {published.versionNumber} published
                  <span className="font-normal text-muted"> · {formatDateTime(published.publishedAt)}</span>
                </Badge>
              ) : (
                <Badge tone="danger">Nothing published</Badge>
              )}
              {state.hasUnpublishedChanges && published && <Badge tone="warn">Saved draft not published</Badge>}
              {dirty && <Badge tone="warn">Unsaved changes</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={!dirty || !valid || busy}>
              {save.isPending ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              variant="primary"
              onClick={() => publish.mutate()}
              disabled={dirty || !valid || busy || !state.hasUnpublishedChanges}
            >
              {publish.isPending
                ? 'Publishing…'
                : state.hasUnpublishedChanges || dirty
                  ? `Publish version ${(published?.versionNumber ?? 0) + 1}`
                  : 'Nothing new to publish'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex max-w-[78ch] flex-col gap-3 text-sm">
        {!published && (
          <Notice tone="warn">
            Only a draft exists. Applicants cannot be interviewed for this event until you publish a version.
          </Notice>
        )}
        {published && state.hasUnpublishedChanges && (
          <Notice tone="warn">
            Applicants still receive version {published.versionNumber}. The saved draft below differs from it and is not
            live.
          </Notice>
        )}
        {notice && !dirty && !failed && <Notice tone="ok">{notice}</Notice>}
        {failed && (
          <Notice tone="danger">
            <strong>{failed === save ? 'The draft was not saved.' : 'The interview was not published.'}</strong>{' '}
            {describeError(failed.error).detail}
          </Notice>
        )}
        {dirty && <p className="text-muted">Save the draft before publishing. Unsaved edits exist only on this page.</p>}
        <p className="text-muted">
          Set the event to Published in Event details to list it on the fan page. Publishing here creates a new
          interview version. Applications already submitted keep their original version.
        </p>
      </div>

      <div className="grid items-start gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section title="Opening and pacing">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Opening greeting" htmlFor="intro" error={issueFor(issues, 'intro')}>
                  <textarea
                    id="intro"
                    rows={2}
                    className={inputClass}
                    aria-invalid={!!issueFor(issues, 'intro')}
                    value={config.intro}
                    onChange={(event) => update({ intro: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Tone" htmlFor="tone" error={issueFor(issues, 'tone')}>
                <input
                  id="tone"
                  className={inputClass}
                  aria-invalid={!!issueFor(issues, 'tone')}
                  value={config.tone}
                  onChange={(event) => update({ tone: event.target.value })}
                />
              </Field>
              <Field
                label="Maximum duration (seconds)"
                htmlFor="duration"
                hint={`${LIMITS.minDurationSeconds} to ${LIMITS.maxDurationSeconds} seconds`}
                error={issueFor(issues, 'maxDurationSeconds')}
              >
                <input
                  id="duration"
                  type="number"
                  min={LIMITS.minDurationSeconds}
                  max={LIMITS.maxDurationSeconds}
                  className={inputClass}
                  aria-invalid={!!issueFor(issues, 'maxDurationSeconds')}
                  value={Number.isNaN(config.maxDurationSeconds) ? '' : config.maxDurationSeconds}
                  onChange={(event) => update({ maxDurationSeconds: event.target.valueAsNumber })}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Questions"
            meta={`${config.questions.length} of ${LIMITS.maxQuestions} · conversation prompts, not a trivia test`}
          >
            {issueFor(issues, 'questions') && (
              <div className="mb-4">
                <Notice tone="danger">{issueFor(issues, 'questions')}</Notice>
              </div>
            )}
            <ol className="flex flex-col divide-y divide-border">
              {config.questions.map((question, index) => {
                const promptError = issueFor(issues, `questions.${question.id}.prompt`)
                const followUpError = issueFor(issues, `questions.${question.id}.maxFollowUps`)
                return (
                  <li
                    key={question.id}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-6 first:pt-1 sm:grid-cols-[2.75rem_minmax(0,1fr)]"
                  >
                    <span aria-hidden="true" className="figure pt-1 text-2xl text-subtle">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex min-w-0 flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <h3 className="font-semibold">
                          Question {index + 1}
                        </h3>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            icon="arrowUp"
                            aria-label={`Move question ${index + 1} up`}
                            title="Move up"
                            disabled={index === 0}
                            onClick={() => update({ questions: moveQuestion(config.questions, question.id, 'up') })}
                          />
                          <Button
                            size="sm"
                            icon="arrowDown"
                            aria-label={`Move question ${index + 1} down`}
                            title="Move down"
                            disabled={index === config.questions.length - 1}
                            onClick={() => update({ questions: moveQuestion(config.questions, question.id, 'down') })}
                          />
                          <Button
                            size="sm"
                            icon="trash"
                            aria-label={`Delete question ${index + 1}`}
                            title="Delete"
                            onClick={() => update({ questions: removeQuestion(config.questions, question.id) })}
                          />
                        </div>
                      </div>
                      <Field label="Prompt" htmlFor={`prompt-${question.id}`} error={promptError}>
                        <textarea
                          id={`prompt-${question.id}`}
                          rows={2}
                          className={`${inputClass} text-base`}
                          aria-invalid={!!promptError}
                          value={question.prompt}
                          onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })}
                        />
                      </Field>
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_9rem_auto] lg:items-start">
                        <Field label="Purpose (for staff and the AI host)" htmlFor={`purpose-${question.id}`}>
                          <input
                            id={`purpose-${question.id}`}
                            className={inputClass}
                            value={question.purpose}
                            onChange={(event) => updateQuestion(question.id, { purpose: event.target.value })}
                          />
                        </Field>
                        <Field label="Follow-up limit" htmlFor={`followups-${question.id}`} error={followUpError}>
                          <select
                            id={`followups-${question.id}`}
                            className={inputClass}
                            value={question.maxFollowUps}
                            onChange={(event) =>
                              updateQuestion(question.id, { maxFollowUps: Number(event.target.value) })
                            }
                          >
                            {[0, 1, 2].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <label className="flex h-10 items-center gap-2 text-sm font-medium lg:mt-[1.875rem]">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={question.required}
                            onChange={(event) => updateQuestion(question.id, { required: event.target.checked })}
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5">
              <Button icon="plus" onClick={() => update({ questions: addQuestion(config.questions) })} disabled={!canAdd}>
                Add question
              </Button>
              {!canAdd && (
                <span className="text-sm text-muted">The limit is {LIMITS.maxQuestions} questions per interview.</span>
              )}
            </div>
          </Section>
        </div>

        <Card title="Preview" className="xl:sticky xl:top-28">
          <p className="mb-4 text-[0.8125rem] text-muted">
            A reading of the current form only. No call is placed, and the AI host may paraphrase on a real call.
          </p>
          <p className="text-[0.8125rem] font-medium text-muted">AI host opens with</p>
          <p className="mt-1 leading-relaxed">{config.intro || <span className="text-muted">No greeting yet.</span>}</p>
          <p className="mt-5 text-[0.8125rem] font-medium text-muted">Then asks, in order</p>
          <ol className="mt-1 flex flex-col gap-2">
            {config.questions.map((question, index) => (
              <li key={question.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] leading-snug">
                <span className="text-muted tabular-nums">{index + 1}.</span>
                <span>
                  {question.prompt || <span className="text-muted">Empty prompt</span>}
                  {!question.required && <span className="text-muted"> (optional)</span>}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[0.8125rem] text-muted">
            {config.tone || 'No tone set'} · up to{' '}
            {Number.isNaN(config.maxDurationSeconds) ? '—' : config.maxDurationSeconds} seconds
          </p>
        </Card>
      </div>
    </div>
  )
}
