const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const statusLabels = { interview_pending: 'Interview pending', review_pending: 'Staff review pending', invited: 'Invited', waitlisted: 'Waitlisted', accepted: 'Invitation accepted' };
const activityLabels = {
  application_submitted: 'Application submitted', call_requested: 'Interview requested',
  interview_completed: 'Interview completed', invitation_issued: 'Invitation issued',
  invitation_accepted: 'Invitation accepted', attendance_confirmed: 'Attendance confirmed',
};
function dateLabel(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return 'Date not recorded';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(date);
}
function sourceLabel(item) {
  const sources = { demo_platform: 'Demo platform', demo_check_in: 'Demo check-in', platform: 'Platform' };
  return `${item.synthetic ? '<span class="demo-badge">Demo record</span>' : ''}<span class="record-source">Source: ${escape(sources[item.source] || String(item.source || 'Platform').replaceAll('_', ' '))}</span>`;
}
function applicationCard(item, currentEventId) {
  return `<li class="history-item"><div><h3>${escape(item.eventName || item.eventId || 'Event application')}</h3><p>${escape(statusLabels[item.status] || 'Application recorded')}</p><span class="record-date">${escape(dateLabel(item.submittedAt))}</span>${sourceLabel(item)}</div>${item.eventId === currentEventId ? '<a class="button secondary" href="#application">View application ↗</a>' : '<span class="record-context">Past application</span>'}</li>`;
}
function activityCard(item) {
  return `<li class="history-item"><div><h3>${escape(activityLabels[item.type] || 'Activity recorded')}</h3><p>${escape(item.eventName || 'Community activity')}</p><span class="record-date">${escape(dateLabel(item.timestamp))}</span>${sourceLabel(item)}</div></li>`;
}
function historySection(kind, section, current, eventId) {
  const applications = kind === 'applications';
  const title = applications ? 'Your applications' : 'Recorded activity';
  let items = section.items || [];
  if (applications && current) items = items.map(item => item.id === current.id ? { ...item, ...current } : item);
  if (applications && current && !items.some(item => item.id === current.id)) items = [current, ...items];
  const action = name => `<button type="button" class="button secondary" data-action="history:${kind}" ${section.state === 'loading' ? 'disabled' : ''}>${name}</button>`;
  return `<section class="panel history-section" aria-busy="${section.state === 'loading'}"><h2>${title}</h2>${section.state === 'loading' ? '<p role="status">Loading records…</p>' : ''}${section.state === 'error' ? `<div class="note" role="alert">${escape(section.error)} ${action('Try again')}</div>` : ''}${section.state === 'loaded' && !section.available ? `<div class="note">${applications ? 'Earlier applications are temporarily unavailable. Your current application appears below when available.' : 'Activity history will appear here when it is available.'}</div>` : ''}${items.length ? `<ul class="history-list">${items.map(item => applications ? applicationCard(item, eventId) : activityCard(item)).join('')}</ul>` : section.state === 'loaded' && section.available ? `<div class="empty-state"><h3>${applications ? 'Your first night starts here.' : 'No activity recorded yet.'}</h3><p>${applications ? 'Apply for an event to see it here.' : 'Applications, interviews, and confirmed attendance will appear when recorded. New fans are welcome.'}</p>${applications ? '<a class="button secondary" href="#event">Explore the event ↗</a>' : ''}</div>` : ''}${section.nextCursor && section.state !== 'error' ? action('Load more') : ''}</section>`;
}

export function profileView({ user, currentApplication, event, history, isDemo, signInUrl }) {
  const profile = user.profile || {};
  const current = currentApplication ? { ...currentApplication, eventName: event.name, synthetic: isDemo } : null;
  return `<section class="profile-heading"><p class="eyebrow">YOUR COMMUNITY PROFILE</p><h1 class="page-title">Your corner<br>of the community.</h1><p class="description">Your applications and the moments you've been part of, all in one place.</p></section><div class="profile-layout"><aside class="panel profile-card"><p class="eyebrow">${isDemo ? 'FICTIONAL ACCOUNT' : 'YOUR DETAILS'}</p><h2>${escape(profile.name || 'Community member')}</h2><dl><dt>Email</dt><dd>${escape(profile.email || 'Not provided')}</dd><dt>FaceTime number</dt><dd>${escape(profile.phone || 'Not provided')}</dd></dl><p class="micro">${isDemo ? 'Demo details are not verified and are not saved after reload.' : 'Verification and profile changes are managed by your sign-in service.'}</p>${!isDemo ? `<a class="button secondary" href="${escape(signInUrl)}">Manage profile ↗</a>` : ''}<div class="note">Your activity updates as you apply, join interviews, and check in at events.</div></aside><div class="profile-history">${historySection('applications', history.applications, current, event.id)}${historySection('activity', history.activity, null, event.id)}</div></div>`;
}
