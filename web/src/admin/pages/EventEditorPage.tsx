import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { EventInput, EventRecord, PublicationStatus } from '../../api/types'
import { PublicationBadge } from '../../components/ui/StatusBadge'
import { Badge, Button, Card, describeError, ErrorState, Field, inputClass, linkClass, LoadingState, Notice, Section } from '../../components/ui/ui'
import { utcIsoToZonedLocal, zonedLocalToUtcIso } from '../../lib/format'

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
]

interface FormState {
  title: string
  description: string
  location: string
  startsLocal: string
  timezone: string
  capacity: string
  minimumPoints: string
  deadlineLocal: string
  publicationStatus: PublicationStatus
}

function toForm(event: EventRecord | null): FormState {
  const timezone = event?.timezone ?? TIMEZONES[0]
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    startsLocal: event ? utcIsoToZonedLocal(event.startsAt, timezone) : '',
    timezone,
    capacity: event ? String(event.capacity) : '',
    minimumPoints: String(event?.minimumPoints ?? 0),
    deadlineLocal: event ? utcIsoToZonedLocal(event.applicationDeadline, timezone) : '',
    publicationStatus: event?.publicationStatus ?? 'draft',
  }
}

type Errors = Partial<Record<keyof FormState, string>>

function validate(form: FormState): { errors: Errors; input: EventInput | null } {
  const errors: Errors = {}
  if (!form.title.trim()) errors.title = 'Title is required.'
  if (!form.location.trim()) errors.location = 'Location is required.'

  const capacity = Number(form.capacity)
  if (!form.capacity.trim() || !Number.isInteger(capacity) || capacity <= 0) {
    errors.capacity = 'Capacity must be a positive whole number.'
  }
  const minimumPoints = form.minimumPoints.trim() === '' ? 0 : Number(form.minimumPoints)
  if (!Number.isInteger(minimumPoints) || minimumPoints < 0) {
    errors.minimumPoints = 'Points needed must be zero or a positive whole number.'
  }

  const startsAt = zonedLocalToUtcIso(form.startsLocal, form.timezone)
  const deadline = zonedLocalToUtcIso(form.deadlineLocal, form.timezone)
  if (!startsAt) errors.startsLocal = 'Choose a start date and time.'
  if (!deadline) errors.deadlineLocal = 'Choose an application deadline.'
  if (startsAt && deadline && deadline > startsAt) {
    errors.deadlineLocal = 'The deadline must be before the event starts.'
  }

  if (Object.keys(errors).length > 0 || !startsAt || !deadline) return { errors, input: null }
  return {
    errors,
    input: {
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      startsAt,
      timezone: form.timezone,
      capacity,
      minimumPoints,
      applicationDeadline: deadline,
      publicationStatus: form.publicationStatus,
    },
  }
}

export function EventEditorPage() {
  const { id } = useParams()
  const query = useQuery({ queryKey: ['event', id], queryFn: () => api.getAdminEvent(id!), enabled: !!id })

  if (!id) return <EventForm key="new" event={null} />
  return !query.data ? (
    query.isError ? (
      <ErrorState error={query.error} onRetry={() => query.refetch()} />
    ) : (
      <LoadingState label="Loading event…" />
    )
  ) : (
    <EventForm key={id} event={query.data} />
  )
}

function EventForm({ event }: { event: EventRecord | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(event))
  const [submitted, setSubmitted] = useState(false)
  const [saved, setSaved] = useState(false)

  const interview = useQuery({
    queryKey: ['interview', event?.id],
    queryFn: () => api.getInterview(event!.id),
    enabled: !!event,
  })

  const { errors, input } = validate(form)
  const shown: Errors = submitted ? errors : {}
  const publishing = form.publicationStatus === 'published' && event?.publicationStatus !== 'published'
  const submitLabel = event
    ? publishing ? 'Publish event' : 'Save event'
    : publishing ? 'Create and publish event' : 'Create event'

  const mutation = useMutation({
    mutationFn: async (payload: EventInput) => {
      if (event) {
        await api.updateEvent(event.id, payload)
        return event.id
      }
      return (await api.createEvent(payload)).id
    },
    onSuccess: async (eventId) => {
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['interview', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['fan', 'events'] })
      await queryClient.invalidateQueries({ queryKey: ['fan', 'event', eventId] })
      if (event) setSaved(true)
      else navigate(form.publicationStatus === 'published' ? `/admin/events/${eventId}` : `/admin/events/${eventId}/interview`)
    },
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }
  const text = (key: 'title' | 'location' | 'capacity' | 'minimumPoints' | 'startsLocal' | 'deadlineLocal', type = 'text') => ({
    id: key,
    type,
    className: inputClass,
    value: form[key],
    'aria-invalid': !!shown[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  })

  return (
    <form
      noValidate
      className="flex max-w-4xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (input && !mutation.isPending) mutation.mutate(input)
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="title-display text-3xl">{event ? 'Event details' : 'New event'}</h1>
        <div className="flex gap-2">
          {!event && (
            <Link to="/admin" className="inline-flex h-10 items-center px-3 text-sm text-muted hover:text-text">
              Cancel
            </Link>
          )}
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>

      {event && (
        <Section title="Publication">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-muted">Event</span>
              <PublicationBadge status={event.publicationStatus} />
              {event.publicationStatus === 'published' && (
                <Link to={`/events/${event.id}`} className={linkClass}>View on fan page</Link>
              )}
              <span className="ml-4 text-muted">Interview</span>
              {interview.isPending ? (
                <Badge>Checking…</Badge>
              ) : interview.isError ? (
                <Badge tone="danger">Could not load</Badge>
              ) : interview.data.published ? (
                <Badge tone="ok">Version {interview.data.published.versionNumber} published</Badge>
              ) : (
                <Badge tone="danger">Draft only</Badge>
              )}
              {interview.data?.published && interview.data.hasUnpublishedChanges && (
                <Badge tone="warn">Newer draft not published</Badge>
              )}
            </div>
            {interview.data && !interview.data.published && (
              <Notice tone="warn">
                Publish the interview questions to let fans submit applications.{' '}
                <Link to={`/admin/events/${event.id}/interview`} className={linkClass}>
                  Open the interview editor
                </Link>
              </Notice>
            )}
          </div>
        </Section>
      )}

      {submitted && !input && <Notice tone="danger">Fix the highlighted fields, then save again.</Notice>}
      {mutation.isError && (
        <Notice tone="danger">
          <strong>The event was not saved.</strong> {describeError(mutation.error).detail}
        </Notice>
      )}
      {saved && !mutation.isPending && <Notice tone="ok">Event saved.</Notice>}

      <Card title="Details">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Title" htmlFor="title" error={shown.title}>
              <input {...text('title')} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Description" htmlFor="description">
              <textarea
                id="description"
                rows={3}
                className={inputClass}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Location" htmlFor="location" error={shown.location}>
            <input {...text('location')} />
          </Field>
          <Field label="Capacity" htmlFor="capacity" error={shown.capacity}>
            <input {...text('capacity', 'number')} min={1} />
          </Field>
          <Field label="FaZe ID points needed to apply" htmlFor="minimumPoints" hint="0 keeps the event open to every fan. Points unlock the application; they are not spent." error={shown.minimumPoints}>
            <input {...text('minimumPoints', 'number')} min={0} step={1} />
          </Field>
          <Field label="Timezone" htmlFor="timezone" hint="Dates below are entered in this timezone.">
            <select id="timezone" className={inputClass} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {[...new Set([form.timezone, ...TIMEZONES])].map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Publication status" htmlFor="publicationStatus" hint="Submit this form with Published selected to show the event on the fan page.">
            <select
              id="publicationStatus"
              className={inputClass}
              value={form.publicationStatus}
              onChange={(e) => set('publicationStatus', e.target.value as PublicationStatus)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
          <Field label="Starts" htmlFor="startsLocal" error={shown.startsLocal}>
            <input {...text('startsLocal', 'datetime-local')} />
          </Field>
          <Field label="Application deadline" htmlFor="deadlineLocal" error={shown.deadlineLocal}>
            <input {...text('deadlineLocal', 'datetime-local')} />
          </Field>
        </div>
      </Card>
    </form>
  )
}
