"use client";

import { useEffect } from "react";
import { ADMIN_IDLE_TIMEOUT_MS, IDLE_CHECK_INTERVAL_MS } from "@/lib/config";

const LAST_ACTIVITY_KEY = "bsc-admin:last-activity";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
/** Writing on every mouse move is wasteful; record activity at most this often. */
const WRITE_THROTTLE_MS = 15_000;

function readLastActivity(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastActivity(at: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Without storage, the timer still works for this tab.
  }
}

/**
 * Calls `onExpire` once the admin has been idle for ADMIN_IDLE_TIMEOUT_MS.
 * Activity in any tab counts, because the timestamp lives in localStorage.
 * Coming back to a tab that's been closed past the limit expires straight away.
 */
export function useIdleTimeout(active: boolean, onExpire: () => void) {
  useEffect(() => {
    if (!active) return;
    let lastWrite = 0;
    let localLast = Date.now();

    const last = readLastActivity();
    if (last !== null && Date.now() - last > ADMIN_IDLE_TIMEOUT_MS) {
      onExpire();
      return;
    }
    writeLastActivity(localLast);

    const record = () => {
      localLast = Date.now();
      if (localLast - lastWrite > WRITE_THROTTLE_MS) {
        lastWrite = localLast;
        writeLastActivity(localLast);
      }
    };
    const check = () => {
      const latest = Math.max(localLast, readLastActivity() ?? 0);
      if (Date.now() - latest > ADMIN_IDLE_TIMEOUT_MS) onExpire();
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, record, { passive: true });
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, IDLE_CHECK_INTERVAL_MS);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, record);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [active, onExpire]);
}

/** A fresh sign-in starts a new idle window. */
export function resetIdleTimer() {
  writeLastActivity(Date.now());
}
