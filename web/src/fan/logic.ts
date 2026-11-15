import type { EventRecord, FanApplication } from '../api/types'

export function normalizePhone(value: string): string | null {
  if (!/^[+\d\s().-]+$/.test(value.trim())) return null
  const phone = value.trim().replace(/[\s().-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null
}
export function eventUnavailable(event: EventRecord, now = Date.now()): string | null {
  if (event.publicationStatus !== 'published') return 'Applications are not open for this event.'
  if (Date.parse(event.applicationDeadline) <= now) return 'The application deadline has passed.'
  return null
}
export function canRequestCall(app: FanApplication): boolean {
  return ['submitted', 'interview_pending'].includes(app.status)
    && (!app.call || ['missed', 'failed', 'canceled'].includes(app.call.status))
}
export function fanStatusText(app: FanApplication): string {
  if (app.status === 'accepted') return 'Your place is confirmed. See you there.'
  if (app.status === 'invited') return 'Event staff have offered you a place. Accept your invitation below.'
  if (app.status === 'waitlisted') return 'Your application is on the waitlist. A place may become available.'
  if (app.call?.processingStatus === 'failed') return 'Your interview was saved, but processing needs staff attention. You do not need to call again.'
  if (app.status === 'review_pending') return 'Your interview is received. Event staff will review your application.'
  const messages = { queued: 'Preparing your AI host.', dialing: 'Your FaceTime call is on its way.', connected: 'Your interview is in progress.', missed: "We couldn't reach you. Try again when you are ready.", failed: 'The call could not connect. You can try again.', canceled: 'The call was canceled.', completed: 'Preparing your interview for review.' }
  return app.call ? messages[app.call.status] : 'Your application is saved. Request an interview when you are ready.'
}
