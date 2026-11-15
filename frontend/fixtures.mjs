// Fictional response fixtures, shared by the UI's demo mode and Jason's handoff.
// Explicit expired fixtures use a past date; ordinary invitations have no expiry.
export const demoEvent = {
  id: 'community-night-demo', title: 'Off the screen.\nInto the community.', name: 'FaZe Community Night',
  category: 'COMMUNITY / IRL',
  description: 'Meet other fans, make some memories, and be part of a night built around the community. Apply for a spot and tell the AI host what brings you here.',
  dateLabel: 'Date to be announced', location: 'Arlington, TX · Illustrative venue',
  capacity: 120, status: 'open', durationMinutes: 3,
};
export const demoProfile = { name: 'Demo Fan', email: 'fan@example.com', phone: '+12025550123', consentAccepted: true };
const user = { id: 'user_demo', profile: demoProfile };
const baseApplication = { id: 'app_demo', eventId: demoEvent.id, profile: demoProfile, status: 'interview_pending', call: null };
const base = { event: demoEvent, user, application: null };
const withApplication = (status, call = null, extra = {}) => ({ ...base, application: { ...baseApplication, status, call, ...extra } });
export const pastApplications = [
  { id: 'app_past_demo', eventId: 'past-event-demo', eventName: 'Community Meet-up · Demo', status: 'accepted', submittedAt: '2026-10-10T18:00:00Z', synthetic: true },
];
export const pastActivity = [
  { id: 'activity_attendance_demo', type: 'attendance_confirmed', eventName: 'Community Meet-up · Demo', timestamp: '2026-10-17T20:00:00Z', source: 'demo_check_in', synthetic: true },
  { id: 'activity_acceptance_demo', type: 'invitation_accepted', eventName: 'Community Meet-up · Demo', timestamp: '2026-10-12T18:00:00Z', source: 'demo_platform', synthetic: true },
];
export const scenarios = {
  fresh: { ...base },
  signed_out: { ...base, user: null },
  closed: { ...base, event: { ...demoEvent, status: 'closed' } },
  deadline_passed: { ...base, event: { ...demoEvent, applicationDeadline: '2020-01-01T00:00:00Z' } },
  full: { ...base, event: { ...demoEvent, status: 'full' } },
  ready: withApplication('interview_pending'),
  dialing: withApplication('interview_pending', { status: 'dialing' }),
  connected: withApplication('interview_pending', { status: 'connected' }),
  missed: withApplication('interview_pending', { status: 'missed' }),
  processing: withApplication('interview_pending', { status: 'completed', processingStatus: 'pending' }),
  processing_failed: withApplication('review_pending', { status: 'completed', processingStatus: 'failed' }),
  review: withApplication('review_pending', { status: 'completed', processingStatus: 'ready' }),
  invited: withApplication('invited', { status: 'completed', processingStatus: 'ready' }, { invitation: { expiresAt: null, capacityAvailable: true } }),
  expired: withApplication('invited', null, { invitation: { expiresAt: '2020-01-01T00:00:00Z', capacityAvailable: true } }),
  capacity_claimed: withApplication('invited', null, { invitation: { expiresAt: null, capacityAvailable: false } }),
  waitlisted: withApplication('waitlisted'),
  accepted: withApplication('accepted'),
  returning_fan: { ...withApplication('interview_pending'), applications: pastApplications, activity: pastActivity },
};

export const scenarioLabels = {
  fresh: 'New application', signed_out: 'Signed out', closed: 'Applications closed', deadline_passed: 'Deadline passed',
  full: 'Applications full', ready: 'Ready for interview', dialing: 'Dialing', connected: 'Connected',
  missed: 'Missed call', processing: 'Processing interview', processing_failed: 'Processing failed',
  review: 'Awaiting staff review', invited: 'Invited', expired: 'Invitation expired',
  capacity_claimed: 'Invitation capacity claimed', waitlisted: 'Waitlisted', accepted: 'Accepted',
  returning_fan: 'Returning fan with demo history',
};
