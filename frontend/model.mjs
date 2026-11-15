// Shared with the demo adapter and UI. These checks improve feedback; the
// backend must independently enforce ownership, consent, eligibility, capacity.
export function normalizePhone(value) {
  const input = String(value ?? '').trim();
  if (!/^[+\d\s().-]+$/.test(input)) return null;
  const normalized = input.replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function validateDraft(draft, demo = true) {
  const errors = {};
  if (demo) {
    if (!draft.name?.trim()) errors.name = 'Enter a display name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email?.trim() || '')) errors.email = 'Enter an email such as fan@example.com.';
    if (!normalizePhone(draft.phone)) errors.phone = 'Include the country code, for example +1 202 555 0123.';
  }
  if (!draft.consentAccepted) errors.consent = 'Agree to the AI interview before applying.';
  return errors;
}

export function applicationAvailability(event, now = Date.now()) {
  if (event.status === 'full') return 'Applications are full for this event.';
  if (event.status !== 'open') return 'Applications are closed for this event.';
  if (event.applicationDeadline && Date.parse(event.applicationDeadline) <= now) return 'The application deadline has passed.';
  return null;
}

export function invitationAvailability(application, now = Date.now()) {
  if (application?.status !== 'invited') return 'No active invitation is available.';
  if (application.invitation?.expiresAt && Date.parse(application.invitation.expiresAt) <= now) return 'Your invitation has expired. Contact event staff for help.';
  if (application.invitation?.capacityAvailable === false) return 'All available spots have been claimed. Event staff can help with next steps.';
  return null;
}

export function callEligibility(application) {
  return application?.status === 'interview_pending'
    && (!application.call || ['missed', 'failed', 'canceled'].includes(application.call.status));
}

export function statusContent(application) {
  const status = application.status;
  const call = application.call;
  const resultFailure = call?.status === 'completed' && call.processingStatus === 'failed';
  const headings = {
    interview_pending: "Let's meet you.", review_pending: "You're in the queue.",
    invited: "You're invited.", waitlisted: "You're on the waitlist.", accepted: 'See you there.',
  };
  const messages = {
    queued: 'Preparing the AI host.', dialing: 'Your FaceTime call is on its way.', connected: 'Interview in progress.',
    missed: "We couldn't reach you. Try again when you're ready.", failed: "The call couldn't connect. You can try again.", canceled: 'The interview was canceled.',
    completed: call?.processingStatus === 'ready' ? 'Your interview is ready for staff review.' : 'Preparing your interview for review.',
  };
  const decisions = {
    invited: 'Event staff have offered you a spot. Accept below to confirm.', accepted: 'Your spot is confirmed. Event details appear here.',
    waitlisted: 'Your application is on the waitlist. A spot may become available.', review_pending: 'Your interview is received. Event staff will review your application.',
  };
  // Processing errors must remain visible even when the backend sets review_pending.
  const text = resultFailure && !['invited', 'waitlisted', 'accepted'].includes(status)
    ? 'Your interview was saved, but processing needs staff attention. You do not need to call again.'
    : decisions[status] || messages[call?.status] || 'Your application is saved. Choose a time when you can talk for a few minutes.';
  return { heading: headings[status] || 'Application received.', text };
}

export function shouldPoll(application) {
  if (!application || ['invited', 'waitlisted', 'accepted'].includes(application.status)) return false;
  if (application.call?.processingStatus === 'failed') return false;
  return ['queued', 'dialing', 'connected'].includes(application.call?.status)
    || (application.call?.status === 'completed' && application.call.processingStatus === 'pending')
    || application.status === 'review_pending';
}

export function friendlyError(failure) {
  if (failure.status === 401) return 'Your session has ended. Sign in to continue. Your form details are still here.';
  if (failure.status === 403) return "You don't have access to this application. Sign in with the account that applied.";
  if (failure.status === 429) return 'Too many requests. Please wait a moment before trying again.';
  if (failure instanceof TypeError) return 'We could not reach the server. Check your connection and try again. Your details are still here.';
  return failure.message || 'Something went wrong. Please try again.';
}
