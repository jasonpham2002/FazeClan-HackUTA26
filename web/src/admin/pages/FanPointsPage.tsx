import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import { Button, Card, EmptyState, ErrorState, Field, inputClass, LoadingState, Notice, Section } from '../../components/ui/ui'
import { formatDateTime } from '../../lib/format'

export function FanPointsPage() {
  const { id = '' } = useParams()
  const queries = useQueryClient()
  const points = useQuery({ queryKey: ['admin', 'fan-points', id], queryFn: () => api.getFanPoints(id) })
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [saved, setSaved] = useState(false)
  const adjust = useMutation({
    mutationFn: () => api.adjustFanPoints(id, { delta: Number(delta), reason }),
    onSuccess: () => { setSaved(true); setDelta(''); setReason('') },
    onSettled: () => queries.invalidateQueries({ queryKey: ['admin', 'fan-points', id] }),
  })

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="title-display text-4xl sm:text-5xl">Fan points</h1>
        <p className="text-sm text-muted">Fan ID <span className="break-all">{id}</span></p>
      </header>

      {points.isPending ? <LoadingState label="Loading the ledger…" />
        : points.isError ? <ErrorState error={points.error} onRetry={() => points.refetch()} />
        : (
          <Section title="Ledger" meta="Entries are never deleted; a correction is a new entry.">
            <p className="figure mb-4 text-5xl tabular-nums">{points.data.balance}<span className="ml-2 font-sans text-base font-semibold text-muted">points</span></p>
            {!points.data.entries.length ? <EmptyState title="No points recorded for this fan" /> : (
              <ul className="divide-y divide-border">
                {points.data.entries.map(entry => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{entry.reason}</p>
                      <p className="text-sm text-muted">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <span className={`figure text-2xl tabular-nums ${entry.delta > 0 ? 'text-ok' : 'text-muted'}`}>
                      {entry.delta > 0 ? '+' : '−'}{Math.abs(entry.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

      <Card title="Adjust points">
        <form className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)]" onSubmit={event => { event.preventDefault(); setSaved(false); if (!adjust.isPending) adjust.mutate() }}>
          <Field label="Points" htmlFor="adjust-delta" hint="Use a minus sign to remove points.">
            <input id="adjust-delta" type="number" step={1} required value={delta} onChange={event => setDelta(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Reason" htmlFor="adjust-reason" hint="Required. The fan sees this in their history, and it is kept as an audit record.">
            <input id="adjust-reason" required value={reason} onChange={event => setReason(event.target.value)} className={inputClass} />
          </Field>
          <div className="space-y-3 md:col-span-2">
            <Button type="submit" variant="primary" disabled={adjust.isPending || !delta || !reason.trim()}>{adjust.isPending ? 'Saving…' : 'Save adjustment'}</Button>
            {adjust.isError && <ErrorState error={adjust.error} />}
            {adjust.isError && <p className="text-sm text-danger">Not saved. The balance is unchanged.</p>}
            {saved && !adjust.isPending && <Notice tone="ok">Adjustment saved. The ledger above shows it as read back from the server.</Notice>}
          </div>
        </form>
      </Card>
    </div>
  )
}
