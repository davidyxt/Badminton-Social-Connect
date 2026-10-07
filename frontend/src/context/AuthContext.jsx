import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import {
  ACTIVITY_SAVE_INTERVAL_MS,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
} from "../config/session";
import {
  clearLastActivity,
  getStorage,
  isIdleExpired,
  readLastActivity,
  saveLastActivity,
  shouldSaveActivity,
} from "../utils/idleTimeout";

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
});

// What counts as the player being active.
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];

// Pages where a session arrives from a link (Google, email confirmation,
// password reset). Landing on one is a fresh sign-in, so the idle clock
// restarts instead of being checked against an old record.
const FRESH_SIGN_IN_PATHS = ["/auth/callback", "/auth/confirmed", "/reset-password"];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (event === "SIGNED_OUT") clearLastActivity(getStorage());
        setSession(newSession);
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  // Idle sign-out: the free Supabase plan does not enforce an inactivity
  // timeout, so the app does. The last-activity time lives in localStorage,
  // so it is shared by every open tab and survives closing the app.
  useEffect(() => {
    if (!userId) return undefined;

    const storage = getStorage();
    if (!storage) return undefined; // storage blocked: nothing to enforce with

    if (FRESH_SIGN_IN_PATHS.includes(window.location.pathname)) {
      saveLastActivity(storage, Date.now());
    }

    let lastSaved = readLastActivity(storage);
    let signingOut = false;

    const expire = () => {
      if (signingOut) return;
      signingOut = true;
      clearLastActivity(storage);
      supabase.auth
        .signOut()
        .catch(() => {})
        .finally(() => window.location.assign("/login?expired=1"));
    };

    const checkIdle = () => {
      const last = readLastActivity(storage) ?? lastSaved;
      if (isIdleExpired(last, Date.now(), IDLE_TIMEOUT_MS)) expire();
    };

    const recordActivity = () => {
      const now = Date.now();
      if (shouldSaveActivity(lastSaved, now, ACTIVITY_SAVE_INTERVAL_MS)) {
        saveLastActivity(storage, now);
        lastSaved = now;
      }
    };

    // On open: idle too long since last time? Otherwise this visit counts.
    checkIdle();
    if (signingOut) return undefined;
    recordActivity();

    // Coming back to the tab checks first, then counts as activity.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      checkIdle();
      if (!signingOut) recordActivity();
    };

    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, recordActivity, { passive: true })
    );
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((name) =>
        window.removeEventListener(name, recordActivity)
      );
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
