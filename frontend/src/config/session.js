// Idle sign-out, done in the app because the free Supabase plan does not
// enforce the inactivity timeout set in supabase/config.toml ([auth.sessions]).
// A player who does nothing in the app for this long is signed out the next
// time the app checks: within a minute while it is open, or on next open.
export const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// How often activity is written down. Activity in between is ignored, so the
// app is not writing to storage on every scroll.
export const ACTIVITY_SAVE_INTERVAL_MS = 60 * 1000;

// How often an open app checks whether the player has gone idle.
export const IDLE_CHECK_INTERVAL_MS = 60 * 1000;
