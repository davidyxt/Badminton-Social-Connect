/**
 * Which backend the console talks to.
 *
 *   mock (default)  in-memory fixtures, every screen and action works offline
 *   api             the admin-api Supabase Edge Function (branch admin-api/database-handoff)
 *
 * Set NEXT_PUBLIC_ADMIN_DATA_SOURCE=api plus the two Supabase values in .env.local.
 */
export const DATA_SOURCE: "mock" | "api" = process.env.NEXT_PUBLIC_ADMIN_DATA_SOURCE === "api" ? "api" : "mock";
export const IS_API = DATA_SOURCE === "api";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** How often the console re-reads the API (stands in for Realtime until channels exist). */
export const API_POLL_INTERVAL_MS = 20_000;

/**
 * Admins are signed out after this long without activity. The free Supabase
 * plan doesn't enforce the inactivity timeout in supabase/config.toml, so the
 * console does it, as the player app does (frontend/src/config/session.js),
 * with a much shorter limit for an admin tool.
 */
export const ADMIN_IDLE_TIMEOUT_MS = (Number(process.env.NEXT_PUBLIC_ADMIN_IDLE_TIMEOUT_MINUTES) || 30) * 60_000;
export const IDLE_CHECK_INTERVAL_MS = 30_000;
