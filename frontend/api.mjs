import { applicationAvailability, invitationAvailability, callEligibility, validateDraft, normalizePhone } from './model.mjs';
import { demoEvent, scenarios } from './fixtures.mjs';
export { demoEvent };

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export function createDemoApi() {
  let state = structuredClone(scenarios.fresh);
  let nextFailure = null;
  let activity = [];
  let activitySequence = 0;
  function record(type) {
    activity.push({ id: `activity_session_${++activitySequence}`, type, eventName: state.event.name,
      timestamp: new Date().toISOString(), source: 'demo_platform', synthetic: true });
  }
  function beforeMutation() {
    if (nextFailure) { const failure = nextFailure; nextFailure = null; throw failure; }
    if (!state.user) throw new ApiError('Sign in required.', 401);
  }
  return {
    async getEvent() { return structuredClone(state.event); },
    async getMe() { return structuredClone(state.user); },
    async getApplication() { return structuredClone(state.application); },
    async getApplications({ eventId, cursor } = {}) {
      if (!state.user) throw new ApiError('Sign in required.', 401);
      const current = state.application ? [{ ...state.application, eventName: state.event.name, synthetic: true }] : [];
      const items = [...current, ...(state.applications || [])].filter(item => !eventId || item.eventId === eventId);
      if (cursor) throw new ApiError('Invalid demo page cursor.', 400);
      return { available: true, items: structuredClone(items), nextCursor: null };
    },
    async getActivity({ cursor } = {}) {
      if (!state.user) throw new ApiError('Sign in required.', 401);
      if (cursor) throw new ApiError('Invalid demo page cursor.', 400);
      return { available: true, items: structuredClone([...activity].reverse().concat(state.activity || [])), nextCursor: null };
    },
    async apply(profile) {
      beforeMutation();
      if (state.application) throw new ApiError('You already have an application.', 409);
      const unavailable = applicationAvailability(state.event);
      if (unavailable) throw new ApiError(unavailable, 409, 'APPLICATIONS_CLOSED');
      const errors = validateDraft(profile);
      if (Object.keys(errors).length) throw new ApiError(Object.values(errors)[0], 400);
      const savedProfile = { ...structuredClone(profile), name: profile.name.trim(), email: profile.email.trim(), phone: normalizePhone(profile.phone) };
      state.application = { id: 'app_demo', eventId: state.event.id, profile: savedProfile, status: 'interview_pending', call: null };
      state.user.profile = structuredClone(savedProfile);
      state.application.submittedAt = new Date().toISOString();
      record('application_submitted');
      return structuredClone(state.application);
    },
    async requestCall() {
      beforeMutation();
      if (!callEligibility(state.application)) throw new ApiError('This application is not eligible for another call.', 409, 'CALL_NOT_ELIGIBLE');
      state.application.call = { status: 'queued' };
      record('call_requested');
      return structuredClone(state.application);
    },
    async accept() {
      beforeMutation();
      const unavailable = invitationAvailability(state.application);
      if (unavailable) throw new ApiError(unavailable, 409, 'INVITATION_UNAVAILABLE');
      state.application.status = 'accepted';
      record('invitation_accepted');
      return structuredClone(state.application);
    },
    async setScenario(name) {
      if (!Object.hasOwn(scenarios, name)) throw new ApiError('Unknown demo scenario.', 400);
      state = structuredClone(scenarios[name]); nextFailure = null; activity = []; activitySequence = 0;
    },
    failNext(kind) {
      nextFailure = kind === 'network' ? new TypeError('Network error') : new ApiError('Demo request error.', 429, 'RATE_LIMITED');
    },
    async simulate(action) {
      if (action === 'reset') { state = structuredClone(scenarios.fresh); nextFailure = null; activity = []; activitySequence = 0; return null; }
      if (!state.application) throw new ApiError('Create a demo application first.', 409);
      const mapping = { missed: 'missed', review: 'review', invited: 'invited', waitlisted: 'waitlisted' };
      if (!mapping[action]) throw new ApiError('Unknown demo action.', 400);
      state.application = { ...structuredClone(scenarios[mapping[action]].application), profile: state.application.profile, submittedAt: state.application.submittedAt };
      if (action === 'review') record('interview_completed');
      if (action === 'invited') record('invitation_issued');
      return structuredClone(state.application);
    },
  };
}

// Proposed backend contract. Same-origin cookie authentication is backend-owned.
// A failed live request never falls back to synthetic data or fake auth.
export function createLiveApi(config) {
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${config.apiBase.replace(/\/$/, '')}${path}`, {
        credentials: 'same-origin', ...options, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...options.headers },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(body?.error?.message || `Request failed (${response.status}).`, response.status, body?.error?.code);
      if (response.status !== 204 && body === null) throw new ApiError('The server returned an unexpected response. Please try again.', 502, 'INVALID_RESPONSE');
      return body;
    } catch (failure) {
      if (failure.name === 'AbortError') throw new ApiError('The server took too long to respond. Refresh status before trying again.', 408, 'TIMEOUT');
      throw failure;
    } finally { clearTimeout(timeout); }
  }
  const storageKey = `faze.applicationId:${config.eventId}`;
  const unavailable = () => ({ available: false, items: [], nextCursor: null });
  async function list(path, enabled, params = {}) {
    if (!enabled) return unavailable();
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null && value !== ''));
    const body = await request(`${path}${query.size ? `?${query}` : ''}`);
    if (!body || !Array.isArray(body.items) || body.items.some(item => !item || typeof item.id !== 'string') || (body.nextCursor != null && typeof body.nextCursor !== 'string')) {
      throw new ApiError('The history service returned an unexpected response.', 502, 'INVALID_RESPONSE');
    }
    return { available: true, items: body.items, nextCursor: body.nextCursor || null };
  }
  const getApplications = (params = {}) => list('/me/applications', config.features?.applicationHistory, params);
  const getActivity = (params = {}) => list('/me/activity', config.features?.activityHistory, params);
  function applicationId() { return sessionStorage.getItem(storageKey); }
  function requiredId() {
    const id = applicationId();
    if (!id) throw new ApiError('Apply first.', 409);
    return encodeURIComponent(id);
  }
  const getApplication = async () => {
    if (!applicationId()) {
      const page = await getApplications({ eventId: config.eventId });
      // Server enforces one application per user/event. Do not select a record
      // belonging to another event if the backend ignores the filter.
      const found = page.items.find(item => item.eventId === config.eventId && item.id);
      if (!found) return null;
      sessionStorage.setItem(storageKey, found.id);
    }
    try { return await request(`/applications/${encodeURIComponent(applicationId())}`); }
    catch (failure) {
      if ([403, 404].includes(failure.status)) { sessionStorage.removeItem(storageKey); return null; }
      throw failure;
    }
  };
  return {
    getEvent: () => request(`/events/${encodeURIComponent(config.eventId)}`),
    async getMe() { try { return await request('/me'); } catch (failure) { if (failure.status === 401) return null; throw failure; } },
    getApplication,
    getApplications,
    getActivity,
    async apply(profile) {
      const user = await request('/me');
      if (!user) throw new ApiError('Sign in required.', 401);
      const application = await request(`/events/${encodeURIComponent(config.eventId)}/applications`, {
        method: 'POST', body: JSON.stringify({ consentVersion: 'ai-interview-v1', consentAccepted: profile.consentAccepted }),
      });
      if (!application?.id) throw new ApiError('Application response is missing an ID. Refresh before trying again.', 502);
      sessionStorage.setItem(storageKey, application.id);
      return application;
    },
    async requestCall() {
      await request(`/applications/${requiredId()}/call`, { method: 'POST', body: '{}' });
      return getApplication();
    },
    async accept() {
      await request(`/applications/${requiredId()}/accept`, { method: 'POST', body: '{}' });
      return getApplication();
    },
  };
}
