// Public configuration only. Never put provider keys or backend secrets here.
window.FAZE_CONFIG = {
  mode: "demo", // Set to "live" only when Jason's authenticated API is ready.
  apiBase: "/api",
  eventId: "community-night-demo",
  signInUrl: "/sign-in",
  // Enable only after Jason implements the endpoints in API-HANDOFF.md.
  features: { applicationHistory: false, activityHistory: false },
};
