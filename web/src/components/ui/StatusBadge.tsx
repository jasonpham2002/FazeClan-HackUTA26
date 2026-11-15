import type {
  ApplicationStatus,
  CallStatus,
  Completeness,
  Decision,
  ProcessingStatus,
  PublicationStatus,
} from '../../api/types'
import { Badge } from './ui'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'
type Entry = [label: string, tone: Tone]

const application: Record<ApplicationStatus, Entry> = {
  submitted: ['Submitted', 'neutral'],
  interview_pending: ['Interview pending', 'info'],
  review_pending: ['Review pending', 'warn'],
  invited: ['Invited', 'ok'],
  waitlisted: ['Waitlisted', 'neutral'],
  accepted: ['Invitation accepted', 'ok'],
}

const call: Record<CallStatus, Entry> = {
  queued: ['Call queued', 'info'],
  dialing: ['Dialing', 'info'],
  connected: ['In progress', 'info'],
  completed: ['Call completed', 'ok'],
  missed: ['Call missed', 'warn'],
  failed: ['Call failed', 'danger'],
  canceled: ['Call canceled', 'neutral'],
}

const processing: Record<ProcessingStatus, Entry> = {
  pending: ['Result processing', 'info'],
  ready: ['Result ready', 'ok'],
  failed: ['Processing failed', 'danger'],
}

const completeness: Record<Completeness, Entry> = {
  answered: ['Answered', 'ok'],
  partial: ['Partial', 'warn'],
  skipped: ['Skipped', 'neutral'],
  not_asked: ['Not asked', 'neutral'],
}

const decision: Record<Decision, Entry> = {
  invite: ['Invite', 'ok'],
  waitlist: ['Waitlist', 'neutral'],
}

const publication: Record<PublicationStatus, Entry> = {
  draft: ['Draft', 'warn'],
  published: ['Published', 'ok'],
}

function render(entry: Entry | undefined, raw: string) {
  // Unknown values from the API are shown as-is rather than hidden.
  const [label, tone] = entry ?? [raw, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}

export const ApplicationStatusBadge = ({ status }: { status: ApplicationStatus }) => render(application[status], status)
export const CallStatusBadge = ({ status }: { status: CallStatus | null }) =>
  status ? render(call[status], status) : <Badge>No call yet</Badge>
export const ProcessingBadge = ({ status }: { status: ProcessingStatus | null }) =>
  status ? render(processing[status], status) : <Badge>No result</Badge>
export const CompletenessBadge = ({ value }: { value: Completeness }) => render(completeness[value], value)
export const DecisionBadge = ({ decision: value }: { decision: Decision | null }) =>
  value ? render(decision[value], value) : <Badge>Undecided</Badge>
export const PublicationBadge = ({ status }: { status: PublicationStatus }) => render(publication[status], status)

export const applicationStatusLabels = Object.fromEntries(
  Object.entries(application).map(([key, [label]]) => [key, label]),
) as Record<ApplicationStatus, string>
export const callStatusLabels = Object.fromEntries(
  Object.entries(call).map(([key, [label]]) => [key, label]),
) as Record<CallStatus, string>
