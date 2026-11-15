import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '../../api'
import type { ApplicationDetail, Decision, DecisionInput } from '../../api/types'
import { Icon } from '../../components/ui/Icon'
import { DecisionBadge } from '../../components/ui/StatusBadge'
import { Button, Card, describeError, inputClass, Notice } from '../../components/ui/ui'
import { formatDateTime } from '../../lib/format'

const labels: Record<Decision, string> = { invite: 'Invite', waitlist: 'Waitlist' }
const hints: Record<Decision, string> = {
  invite: 'Offer a place at the event',
  waitlist: 'Hold for now; can reflect capacity',
}

export function DecisionPanel({ app }: { app: ApplicationDetail }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [choice, setChoice] = useState<Decision | null>(null)
  const [reason, setReason] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  const current = app.decision
  const locked = app.status === 'accepted'
  const showForm = !locked && (!current || editing)

  const mutation = useMutation({
    mutationFn: (input: DecisionInput) => api.postDecision(app.id, input),
    onSuccess: async () => {
      // The panel only shows a decision once it has been read back from the API.
      await queryClient.invalidateQueries({ queryKey: ['application', app.id] })
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
      void queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setEditing(false)
      setChoice(null)
      setReason('')
      setJustSaved(true)
    },
    onError: (error) => {
      // On a conflict the server state has moved on; reload it so staff see why.
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['application', app.id] })
      }
    },
  })

  const { capacity } = app
  const remaining = capacity.capacity - capacity.invited

  return (
    <Card title="Decision">
      <div className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-3 gap-x-3 border-b border-border pb-4">
          {(
            [
              ['Capacity', capacity.capacity],
              ['Invited', capacity.invited],
              ['Accepted', capacity.accepted],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[0.8125rem] text-muted">{label}</dt>
              <dd className="figure mt-1 text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
        {remaining <= 0 && <Notice tone="warn">Invitations issued have reached the event capacity.</Notice>}

        {current ? (
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted">Current decision</span>
              <DecisionBadge decision={current.decision} />
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted">
              By {current.reviewer.displayName ?? current.reviewer.id} · {formatDateTime(current.createdAt)}
            </p>
            {current.reason && <p className="mt-2 leading-relaxed">{current.reason}</p>}
          </div>
        ) : (
          <p className="text-muted">No decision has been saved for this application.</p>
        )}

        {justSaved && !mutation.isPending && !showForm && <Notice tone="ok">Decision saved.</Notice>}

        {locked && (
          <Notice tone="info">The applicant has accepted this invitation, so the decision can no longer be changed here.</Notice>
        )}

        {current && !locked && !editing && (
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              setEditing(true)
              setJustSaved(false)
              mutation.reset()
            }}
          >
            Change decision
          </Button>
        )}

        {showForm && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (choice) mutation.mutate({ decision: choice, reason: reason.trim() || undefined })
            }}
          >
            {current && (
              <Notice tone="warn">
                You are replacing the current decision ({labels[current.decision]}). The earlier decision stays in the history.
              </Notice>
            )}
            <div role="group" aria-label="Decision" className="grid grid-cols-2 gap-2">
              {(['invite', 'waitlist'] as const).map((option) => {
                const selected = choice === option
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    disabled={mutation.isPending}
                    onClick={() => setChoice(option)}
                    className={`flex min-h-[4.25rem] flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${
                      selected
                        ? 'border-text bg-surface-2'
                        : 'border-border bg-bg hover:border-border-strong'
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2 font-semibold">
                      {labels[option]}
                      {selected && <Icon name="check" />}
                    </span>
                    <span className="text-[0.8125rem] leading-snug text-muted">{hints[option]}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[0.8125rem] text-muted">
              A waitlist decision can simply reflect capacity. It is not a judgment about the applicant.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="decision-reason" className="text-sm font-medium">
                Reason for staff records (optional)
              </label>
              <textarea
                id="decision-reason"
                rows={2}
                maxLength={500}
                className={inputClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            {mutation.isError && (
              <Notice tone="danger">
                <strong>The decision was not saved.</strong> {describeError(mutation.error).detail}
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" className="grow" disabled={!choice || mutation.isPending}>
                {mutation.isPending ? 'Saving…' : choice ? `Save decision: ${labels[choice]}` : 'Choose a decision'}
              </Button>
              {current && (
                <Button
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setEditing(false)
                    setChoice(null)
                    mutation.reset()
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        <p className="text-[0.8125rem] text-subtle">
          Decisions are made by staff. Opening this page does not call or notify the applicant.
        </p>

        {app.decisionHistory.length > 1 && (
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Decision history</h3>
            <ol className="mt-2 flex flex-col gap-2">
              {[...app.decisionHistory].reverse().map((record) => (
                <li key={record.id} className="text-[0.8125rem] text-muted">
                  <span className="font-medium text-text">{labels[record.decision]}</span> ·{' '}
                  {record.reviewer.displayName ?? record.reviewer.id} · {formatDateTime(record.createdAt)}
                  {record.reason ? ` · ${record.reason}` : ''}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Card>
  )
}
