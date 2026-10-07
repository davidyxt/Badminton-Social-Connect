// The rules behind idle sign-out, kept free of React so they can be tested
// with `node --test frontend/tests/idleTimeout.test.mjs`.

export const LAST_ACTIVITY_KEY = "bsc:lastActivity";

// localStorage can be missing or throw (private windows, blocked storage).
// Then idle sign-out simply does nothing rather than breaking the app.
export function getStorage() {
  try {
    const storage = window.localStorage;
    const probe = "bsc:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function readLastActivity(storage) {
  if (!storage) return null;
  try {
    const value = Number(storage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastActivity(storage, time) {
  if (!storage) return;
  try {
    storage.setItem(LAST_ACTIVITY_KEY, String(time));
  } catch {
    // Storage full or blocked: idle sign-out degrades, sign-in still works.
  }
}

export function clearLastActivity(storage) {
  if (!storage) return;
  try {
    storage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Nothing to clear.
  }
}

// True when the player has been idle for longer than the timeout. No record
// yet (first visit since this feature shipped) is never "idle".
export function isIdleExpired(lastActivity, now, timeoutMs) {
  if (lastActivity === null || lastActivity === undefined) return false;
  return now - lastActivity > timeoutMs;
}

// Whether enough time has passed since the last save to write again.
export function shouldSaveActivity(lastSaved, now, intervalMs) {
  return lastSaved === null || now - lastSaved >= intervalMs;
}
