"use client";

/**
 * Admin session.
 *
 * mock: a UI stand-in. Any credentials sign in; emails starting with "player"
 *       sign in as a non-admin.
 * api:  Supabase Auth email/password. Access requires app_metadata.role =
 *       "admin", the same check the admin-api Edge Function makes. The real
 *       security boundary is always the backend (Edge Function + RLS), never
 *       this file.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, onAuthFailure } from "@/lib/api/client";
import { resetSyncState } from "@/lib/api/sync";
import { IS_API } from "@/lib/config";
import { MOCK_ADMIN } from "@/lib/mock-data";
import type { Admin } from "@/lib/types";

export type SessionStatus = "signed_out" | "authenticated" | "expired" | "restricted";

interface SessionState {
  status: SessionStatus;
  admin: Admin | null;
}

interface SessionContextValue extends SessionState {
  /** Resolves on success; throws an Error with a user-facing message otherwise. */
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** End the session and show the session-expired screen (idle timeout). */
  expire: () => void;
  simulateExpiry: () => void;
  simulateRestricted: () => void;
}

const STORAGE_KEY = "bsc-admin:session:v1";
const SessionContext = createContext<SessionContextValue | null>(null);

/** Distinguishes our own sign-out from Supabase ending the session (which shows "session expired"). */
let signingOutByUser = false;
/** Set when the API refused this account (403), so a token refresh doesn't bring the console back. */
let restrictedByApi = false;

/**
 * Other tabs only see Supabase's SIGNED_OUT, so a deliberate sign-out leaves a
 * short-lived marker telling them to show "signed out" rather than "expired".
 */
const SIGNED_OUT_AT_KEY = "bsc-admin:signed-out-at";
const SIGNED_OUT_MARKER_MS = 10_000;

function markDeliberateSignOut() {
  try {
    window.localStorage.setItem(SIGNED_OUT_AT_KEY, String(Date.now()));
  } catch {
    // Other tabs will show "session expired" instead; still signed out.
  }
}

function wasDeliberateSignOut(): boolean {
  try {
    const at = Number(window.localStorage.getItem(SIGNED_OUT_AT_KEY));
    return Number.isFinite(at) && Date.now() - at < SIGNED_OUT_MARKER_MS;
  } catch {
    return false;
  }
}

/** Emails starting with "player" sign in as a non-admin, to reach the access-restricted screen. */
const isNonAdminEmail = (email: string) => email.trim().toLowerCase().startsWith("player");

function readStored(): SessionState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    // Fall through to signed out.
  }
  return { status: "signed_out", admin: null };
}

function fromSupabase(session: Session | null): SessionState {
  if (!session) return { status: "signed_out", admin: null };
  const user = session.user;
  const admin: Admin = { admin_id: user.id, display_name: user.email?.split("@")[0] ?? "Administrator", email: user.email ?? "" };
  return { status: user.app_metadata?.role === "admin" ? "authenticated" : "restricted", admin };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Data loaded from the API belongs to the signed-in admin; drop it once they're not.
  const status = state?.status;
  useEffect(() => {
    if (IS_API && status && status !== "authenticated") resetSyncState();
  }, [status]);

  const update = useCallback((next: SessionState) => {
    setState(next);
    if (IS_API) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-essential.
    }
  }, []);

  useEffect(() => {
    if (!IS_API) {
      // Session lives in localStorage, which only exists after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(readStored());
      return;
    }
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => setState(fromSupabase(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const deliberate = signingOutByUser || wasDeliberateSignOut();
        signingOutByUser = false;
        setState((prev) => {
          if (deliberate) return { status: "signed_out", admin: null };
          // Our own expiry or lost access ends the Supabase session too; keep the screen it chose.
          if (prev?.status === "expired" || (prev?.status === "restricted" && restrictedByApi)) return prev;
          return prev?.status === "authenticated" ? { status: "expired", admin: prev.admin } : { status: "signed_out", admin: null };
        });
      } else if (session) {
        setState(fromSupabase(session));
      }
    });
    const offAuthFailure = onAuthFailure((kind) => {
      const current = stateRef.current;
      if (current?.status !== "authenticated") return;
      // 401: the session ended. 403: the account lost admin access (the layout shows access restricted).
      if (kind === "forbidden") restrictedByApi = true;
      setState({ status: kind === "forbidden" ? "restricted" : "expired", admin: current.admin });
      // Clear the stored session as expire() does, so a reload doesn't restore it and loop back here.
      void supabase.auth.signOut({ scope: "local" });
    });
    return () => {
      sub.subscription.unsubscribe();
      offAuthFailure();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (IS_API) {
        restrictedByApi = false;
        const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
        update(fromSupabase(data.session));
        return;
      }
      await new Promise((r) => setTimeout(r, 600));
      if (isNonAdminEmail(email)) {
        update({ status: "restricted", admin: { admin_id: "plr-1004", display_name: "Player account", email } });
        return;
      }
      update({ status: "authenticated", admin: { ...MOCK_ADMIN, email: email.trim() || MOCK_ADMIN.email } });
    },
    [update],
  );

  const signOut = useCallback(() => {
    update({ status: "signed_out", admin: null });
    if (IS_API) {
      signingOutByUser = true;
      restrictedByApi = false;
      markDeliberateSignOut();
      void getSupabase().auth.signOut();
    }
  }, [update]);

  const expire = useCallback(() => {
    setState((prev) => {
      const next: SessionState = { status: "expired", admin: prev?.admin ?? null };
      if (!IS_API) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Non-essential.
        }
      }
      return next;
    });
    // Ending the Supabase session also clears the token; the auth listener keeps the expired state.
    if (IS_API) void getSupabase().auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo<SessionContextValue | null>(() => {
    if (!state) return null;
    return {
      ...state,
      signIn,
      signOut,
      expire,
      simulateExpiry: () => update({ status: "expired", admin: state.admin }),
      simulateRestricted: () => update({ status: "restricted", admin: state.admin }),
    };
  }, [state, signIn, signOut, expire, update]);

  // Nothing session-dependent can render until the stored session has been read.
  if (!value) return null;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
