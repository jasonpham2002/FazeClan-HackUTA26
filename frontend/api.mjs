import { applicationAvailability, invitationAvailability, callEligibility, validateDraft, normalizePhone } from './model.mjs';
import { demoEvent, scenarios } from './fixtures.mjs';
export { demoEvent };

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export function createDemoApi() {
  let state = structuredClone(scenarios.fresh);
  let nextFailure = null;
  function beforeMutation() {
    if (nextFailure) { const failure = nextFailure; nextFailure = null; throw failure; }
    if (!state.user) throw new ApiError('Sign in required.', 401);
  }
  return {
    async getEvent() { return structuredClone(state.event); },
    async getMe() { return structuredClone(state.user); },
    async getApplication() { return structuredClone(state.application); },
    async apply(profile) {
      beforeMutation();
      if (state.application) throw new ApiError('You already have an application.', 409);
      const unavailable = applicationAvailability(state.event);
      if (unavailable) throw new ApiError(unavailable, 409, 'APPLICATIONS_CLOSED');
      const errors = validateDraft(profile);
      if (Object.keys(errors).length) throw new ApiError(Object.values(errors)[0], 400);
      const savedProfile = { ...structuredClone(profile), name: profile.name.trim(), email: profile.email.trim(), phone: normalizePhone(profile.phone) };
      state.application = { id: 'app_demo', eventId: state.event.id, profile: savedProfile, status: 'interview_pending', call: null };
      return structuredClone(state.application);
    },
    async requestCall() {
      beforeMutation();
      if (!callEligibility(state.application)) throw new ApiError('This application is not eligible for another call.', 409, 'CALL_NOT_ELIGIBLE');
      state.application.call = { status: 'queued' };
      return structuredClone(state.application);
    },
    async accept() {
      beforeMutation();
      const unavailable = invitationAvailability(state.application);
      if (unavailable) throw new ApiError(unavailable, 409, 'INVITATION_UNAVAILABLE');
      state.application.status = 'accepted';
      return structuredClone(state.application);
    },
    async setScenario(name) {
      if (!Object.hasOwn(scenarios, name)) throw new ApiError('Unknown demo scenario.', 400);
      state = structuredClone(scenarios[name]); nextFailure = null;
    },
    failNext(kind) {
      nextFailure = kind === 'network' ? new TypeError('Network error') : new ApiError('Demo request error.', 429, 'RATE_LIMITED');
    },
    async simulate(action) {
      if (action === 'reset') { state = structuredClone(scenarios.fresh); nextFailure = null; return null; }
      if (!state.application) throw new ApiError('Create a demo application first.', 409);
      const mapping = { missed: 'missed', review: 'review', invited: 'invited', waitlisted: 'waitlisted' };
      if (!mapping[action]) throw new ApiError('Unknown demo action.', 400);
      state.application = { ...structuredClone(scenarios[mapping[action]].application), profile: state.application.profile };
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
  function applicationId() { return sessionStorage.getItem(storageKey); }
  function requiredId() {
    const id = applicationId();
    if (!id) throw new ApiError('Apply first.', 409);
    return encodeURIComponent(id);
  }
  const getApplication = async () => {
    if (!applicationId()) return null;
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
