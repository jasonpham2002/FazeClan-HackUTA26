import { createDemoApi, createLiveApi } from './api.mjs';
import { normalizePhone, validateDraft, applicationAvailability, invitationAvailability, callEligibility, statusContent, shouldPoll, friendlyError } from './model.mjs';
import { scenarioLabels } from './fixtures.mjs';

const config = window.FAZE_CONFIG;
if (!['demo', 'live'].includes(config?.mode)) throw new Error('Invalid FAZE_CONFIG mode.');
const isDemo = config.mode === 'demo';
const api = isDemo ? createDemoApi() : createLiveApi(config);
const root = document.querySelector('#app');
let event, application, user, busy = false, error = '', notice = '', poll, generation = 0;
let draft = { name: '', email: '', phone: '', consentAccepted: false };
let fieldErrors = {}, destinationConfirmed = false, scenario = 'fresh', controlsOpen = false, pollingPaused = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const button = (text, action, secondary = false, disabled = false) => `<button type="button" class="button ${secondary ? 'secondary' : ''}" data-action="${action}" ${busy || disabled ? 'disabled' : ''}>${text}</button>`;
const announce = message => { document.querySelector('#announcement').textContent = message; };

document.querySelector('#mode-banner').textContent = isDemo
  ? 'DEMO MODE · Sample event and local simulation. No account is created and no call is placed.'
  : 'LIVE MODE · Independent concept · Calls require your explicit request.';

function render() {
  clearTimeout(poll);
  if (!event) {
    root.innerHTML = `<section class="panel load-panel"><h1>${error ? 'Unable to load the event' : 'Loading events…'}</h1><p role="${error ? 'alert' : 'status'}">${escape(error)}</p>${error ? button('Try again', 'load') : ''}</section>`;
    return;
  }
  const onApplication = location.hash === '#application';
  const summary = Object.keys(fieldErrors).length ? 'Please check the highlighted fields.' : error;
  root.innerHTML = `${summary ? `<div class="error" id="error-summary" role="alert" tabindex="-1">${escape(summary)}${Object.keys(fieldErrors).length ? `<ul>${Object.entries(fieldErrors).map(([name, text]) => `<li><a href="#field-${name}" data-focus="field-${name}">${escape(text)}</a></li>`).join('')}</ul>` : ''}</div>` : ''}${notice ? `<div class="notice" role="status">${escape(notice)}</div>` : ''}${onApplication ? applicationView() : eventView()}${isDemo ? demoControls() : ''}`;
  if (busy) root.querySelectorAll('input, select').forEach(input => { input.disabled = true; });
  schedulePoll(onApplication);
}

function schedulePoll(onApplication) {
  if (isDemo || !onApplication || busy || pollingPaused || document.hidden || !shouldPoll(application)) return;
  const currentGeneration = generation;
  poll = setTimeout(async () => {
    try {
      const updated = await api.getApplication();
      if (currentGeneration !== generation || busy) return;
      const changed = JSON.stringify(application) !== JSON.stringify(updated);
      application = updated;
      if (changed) { render(); announce(application ? statusContent(application).text : 'Application no longer available.'); }
      else schedulePoll(true);
    } catch (failure) {
      if (currentGeneration !== generation) return;
      if (failure.status === 401) user = null;
      error = `${friendlyError(failure)} Automatic updates paused; use Refresh status to try again.`;
      pollingPaused = true; render();
    }
  }, 3000);
}

function eventView() {
  const unavailable = applicationAvailability(event);
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> ${escape(event.category)}</p><h1>${escape(event.title).replace(/\n/g, '<br>')}</h1><p class="description">${escape(event.description)}</p><a class="button" href="#application">${application ? 'View my application' : unavailable ? 'View event availability' : 'Apply for access'} <span aria-hidden="true">↗</span></a><p class="micro">${escape(unavailable || 'A conversation. A community. Your next great night.')}</p></div><div class="event-art" role="img" aria-label="FaZe Together. Be there. Be yourself. Community Night concept graphic."><div class="art-grid"></div><div class="art-text" aria-hidden="true">FAZE<br><span>TOGETHER.</span></div><div class="art-sticker" aria-hidden="true">BE THERE.<br>BE YOURSELF.</div><div class="art-caption" aria-hidden="true">COMMUNITY NIGHT / CONCEPT 001</div></div></section>
  <section class="event-strip" aria-label="Event information"><div><small>THE EVENT</small><strong>${escape(event.name)}</strong></div><div><small>WHEN</small><strong>${escape(event.dateLabel)}</strong></div><div><small>WHERE</small><strong>${escape(event.location)}</strong></div><div><small>ACCESS</small><strong>${unavailable ? 'Applications unavailable' : 'Application required'}</strong></div></section>
  <section class="how"><div><p class="eyebrow">YOUR WAY IN</p><h2>Good people.<br>Great nights.</h2></div><ol><li><span>01</span><div><h3>Put your name down</h3><p>Apply for a spot at the next community event.</p></div></li><li><span>02</span><div><h3>Have a conversation</h3><p>Tell the AI host what you enjoy and why you want to come.</p></div></li><li><span>03</span><div><h3>Watch for your invitation</h3><p>Event staff review applications and allocate the available spots.</p></div></li></ol></section>`;
}

function signInView() {
  return `<section class="application-layout"><div><a class="back" href="#event">← Back to event</a><p class="eyebrow">YOUR EVENT ACCESS</p><h1 class="page-title">Start with<br>a hello.</h1><p class="description">Sign in to apply, keep track of your interview, and see your invitation.</p></div><section class="panel"><h2>Sign in to continue</h2><p>${isDemo ? 'This is a signed-out preview. Continue below to explore a fictional account.' : 'Your email and FaceTime destination belong to your authenticated profile.'}</p>${isDemo ? button('Continue demo', 'demo-sign-in') : `<a class="button" href="${escape(config.signInUrl)}">Sign in ↗</a>`}<p class="micro">${isDemo ? 'No real authentication takes place.' : 'Your form draft stays in this tab while you navigate the platform.'}</p></section></section>`;
}

function inputField(name, title, type, placeholder, extra = '') {
  return `<label for="field-${name}">${title}</label><input id="field-${name}" name="${name}" type="${type}" value="${escape(draft[name])}" placeholder="${placeholder}" autocomplete="off" aria-invalid="${Boolean(fieldErrors[name])}" aria-describedby="error-${name}${name === 'phone' ? ' phone-hint' : ''}" ${extra} required><span class="field-error" id="error-${name}">${escape(fieldErrors[name] || '')}</span>`;
}

function applicationForm() {
  const unavailable = applicationAvailability(event);
  return `<section class="application-layout"><div><a class="back" href="#event">← Back to event</a><p class="eyebrow">${escape(event.name)}</p><h1 class="page-title">Your next<br>“I was there.”</h1><p class="description">Start with a short application. When you're ready, request a conversation with the AI event host.</p><div class="note">${isDemo ? 'Use fictional details. This demo creates no account and resets when you reload.' : 'Your authenticated profile supplies your email and phone number.'}</div></div><form id="apply-form" class="panel" novalidate aria-busy="${busy}"><p class="eyebrow">01 / APPLICATION</p><h2>${unavailable ? 'Catch the next one.' : 'Make it your night.'}</h2>${unavailable ? `<div class="note" role="status">${escape(unavailable)}</div>` : ''}${isDemo ? `${inputField('name', 'Display name', 'text', 'Demo Fan', 'maxlength="80"')}${inputField('email', 'Email', 'email', 'fan@example.com', 'maxlength="254"')}${inputField('phone', 'FaceTime phone number', 'tel', '+1 202 555 0123', 'maxlength="24" inputmode="tel"')}<p class="micro" id="phone-hint">Include your country code. Formatting does not verify ownership.</p>` : `<div class="destination"><small>FACETIME DESTINATION</small><strong>${escape(user.profile?.phone || 'Add a number to your profile')}</strong></div><a href="${escape(config.signInUrl)}">Manage your profile ↗</a>`}<label class="check" for="field-consent"><input id="field-consent" type="checkbox" name="consent" ${draft.consentAccepted ? 'checked' : ''} aria-invalid="${Boolean(fieldErrors.consent)}" aria-describedby="error-consent" required><span>I agree to receive an AI FaceTime interview${isDemo ? ' (simulated in this demo)' : ''}. My answers will be transcribed for event-staff review.</span></label><span class="field-error" id="error-consent">${escape(fieldErrors.consent || '')}</span><button type="submit" class="button full" ${busy || unavailable ? 'disabled' : ''}>${busy ? 'Submitting…' : unavailable ? 'Applications unavailable' : 'Submit application ↗'}</button><p class="micro">Applying does not guarantee admission. Staff make the final decision.</p></form></section>`;
}

function applicationView() {
  if (!user) return signInView();
  if (!application) return applicationForm();
  const { heading, text } = statusContent(application);
  const eligible = callEligibility(application);
  const status = application.status;
  const phone = application.profile?.phone;
  const invitationUnavailable = status === 'invited' ? invitationAvailability(application) : null;
  const readyForCall = Boolean(phone && normalizePhone(phone));
  const interviewDone = application.call?.status === 'completed' || ['review_pending', 'invited', 'waitlisted', 'accepted'].includes(status);
  return `<section class="status-layout"><div><a class="back" href="#event">← Back to event</a><p class="eyebrow">YOUR APPLICATION / ${escape(application.id)}</p><h1 class="page-title">${heading}</h1><p class="description">${escape(text)}</p><div class="status-pill">${escape(status.replaceAll('_', ' '))}</div><ol class="timeline"><li class="done">Application received</li><li class="${interviewDone ? 'done' : ''}">AI conversation</li><li class="${['invited', 'waitlisted', 'accepted'].includes(status) ? 'done' : ''}">Staff review</li><li class="${status === 'accepted' ? 'done' : ''}">Invitation accepted</li></ol></div><section class="panel"><p class="eyebrow">${escape(event.name)}</p><h2>${eligible ? 'Ready when you are.' : 'Your event access'}</h2><p>${escape(event.dateLabel)}<br>${escape(event.location)}</p>${eligible ? `<div class="destination"><small>FACETIME DESTINATION</small><strong>${escape(phone || 'No phone number on file')}</strong></div>${readyForCall ? `<p>About ${escape(event.durationMinutes)} minutes with an AI host. Staff review the conversation afterward.</p><label class="check"><input type="checkbox" id="confirm-destination" ${destinationConfirmed ? 'checked' : ''}><span>I confirm this is my number and I'm ready to ${isDemo ? 'simulate the interview' : 'receive a FaceTime call'}.</span></label>${button(isDemo ? 'Simulate call request ↗' : 'Call me now ↗', 'call', false, !destinationConfirmed)}` : `<div class="note">Add a valid FaceTime number to your profile before requesting a call.</div>${!isDemo ? `<a class="button secondary" href="${escape(config.signInUrl)}">Manage profile</a>` : ''}`}` : status === 'invited' ? `${invitationUnavailable ? `<div class="note" role="status">${escape(invitationUnavailable)}</div>` : '<p>Confirm your place before the invitation expires.</p>'}${button('Accept invitation ↗', 'accept', false, Boolean(invitationUnavailable))}` : `<div class="note">${escape(text)}</div>`}${button('Refresh status', 'refresh', true)}<p class="micro">${isDemo ? 'No call is placed. Explore outcomes in the demo controls below.' : 'FaceTime opens on your phone. Status updates automatically while this page is visible.'}</p></section></section>`;
}

function demoControls() {
  return `<details class="demo-controls" ${controlsOpen ? 'open' : ''}><summary>Demo controls <span>Fictional scenarios · no real calls or staff decisions</span></summary><div class="demo-options"><label for="scenario">Preview a state<select id="scenario">${Object.entries(scenarioLabels).map(([value, title]) => `<option value="${value}" ${value === scenario ? 'selected' : ''}>${title}</option>`).join('')}</select></label><div><p class="micro">The next submit, call request, or acceptance can fail once to check recovery.</p>${button('Simulate network error', 'fail:network', true)}${button('Simulate rate limit', 'fail:rate', true)}</div></div>${application ? `<div class="demo-actions">${button('Missed call', 'demo:missed', true)}${button('Interview received', 'demo:review', true)}${button('Invite', 'demo:invited', true)}${button('Waitlist', 'demo:waitlisted', true)}</div>` : ''}<div class="demo-actions">${button('Reset demo', 'reset-demo', true)}</div></details>`;
}

async function run(operation) {
  if (busy) return;
  busy = true; generation++; clearTimeout(poll); error = ''; notice = ''; fieldErrors = {};
  render();
  try { await operation(); }
  catch (failure) {
    error = friendlyError(failure);
    if (failure.status === 401) user = null;
  } finally {
    busy = false; render();
    announce(error || notice || 'Application updated.');
    const target = document.querySelector('#error-summary') || root;
    target.focus();
  }
}

root.addEventListener('input', change => {
  const input = change.target;
  if (!input.closest('#apply-form')) return;
  const key = input.name === 'consent' ? 'consentAccepted' : input.name;
  if (Object.hasOwn(draft, key)) draft[key] = input.type === 'checkbox' ? input.checked : input.value;
});
root.addEventListener('change', change => {
  if (change.target.id === 'confirm-destination') {
    destinationConfirmed = change.target.checked;
    const callButton = root.querySelector('[data-action="call"]');
    if (callButton) callButton.disabled = busy || !destinationConfirmed;
  }
  if (change.target.id === 'scenario' && isDemo) {
    scenario = change.target.value;
    run(async () => { await api.setScenario(scenario); await readState(); destinationConfirmed = false; pollingPaused = false; location.hash = '#application'; });
  }
});
root.addEventListener('toggle', toggle => { if (toggle.target.matches('.demo-controls')) controlsOpen = toggle.target.open; }, true);
root.addEventListener('submit', submit => {
  if (submit.target.id !== 'apply-form') return;
  submit.preventDefault();
  if (busy) return;
  fieldErrors = validateDraft(draft, isDemo);
  if (Object.keys(fieldErrors).length) { render(); root.querySelector('#error-summary').focus(); return; }
  run(async () => { application = await api.apply(draft); destinationConfirmed = false; });
});
root.addEventListener('click', async click => {
  const focusTarget = click.target.closest('[data-focus]')?.dataset.focus;
  if (focusTarget) { click.preventDefault(); document.getElementById(focusTarget)?.focus(); return; }
  const action = click.target.closest('[data-action]')?.dataset.action;
  if (!action || busy) return;
  if (action === 'load') { load(); return; }
  if (action.startsWith('fail:') && isDemo) {
    api.failNext(action.slice(5)); notice = 'The next submit, call request, or acceptance will fail once. Refresh does not consume this demo error.'; render(); announce(notice); return;
  }
  run(async () => {
    if (action === 'call') {
      if (!destinationConfirmed || !callEligibility(application)) return;
      application = await api.requestCall(); destinationConfirmed = false;
    }
    if (action === 'refresh') { await readState(); pollingPaused = false; }
    if (action === 'accept') application = await api.accept();
    if (action.startsWith('demo:') && isDemo) { application = await api.simulate(action.slice(5)); destinationConfirmed = false; }
    if (['reset-demo', 'demo-sign-in'].includes(action) && isDemo) {
      await api.setScenario('fresh'); scenario = 'fresh'; await readState(); destinationConfirmed = false;
      if (action === 'reset-demo') draft = { name: '', email: '', phone: '', consentAccepted: false };
    }
  });
});
window.addEventListener('hashchange', () => { generation++; error = ''; notice = ''; fieldErrors = {}; render(); root.focus(); });
window.addEventListener('pagehide', () => { generation++; clearTimeout(poll); });
document.addEventListener('visibilitychange', () => { generation++; clearTimeout(poll); if (!document.hidden) schedulePoll(location.hash === '#application'); });

async function readState() {
  event = await api.getEvent(); user = await api.getMe();
  application = user ? await api.getApplication() : null;
}
async function load() {
  error = ''; busy = true; generation++; render();
  try { await readState(); }
  catch (failure) { error = friendlyError(failure); }
  finally { busy = false; render(); }
}
load();
