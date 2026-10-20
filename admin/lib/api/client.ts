"use client";

/**
 * Transport for the admin-api Supabase Edge Function. The team spec says
 * /rest/v1, but the current backend is an Edge Function, so every call goes
 * to /functions/v1/admin-api with the signed-in admin's access token.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError, type ApiErrorCode } from "@/lib/mock-api/errors";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to use the real admin API.");
  }
  supabase ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: "bsc-admin:supabase-auth" },
  });
  return supabase;
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: "validation",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "unavailable",
  409: "conflict",
  413: "validation",
  415: "validation",
  422: "validation",
  501: "unavailable",
  // Database or function briefly unavailable: worth retrying, like a network failure.
  503: "network_error",
};

/**
 * Why the API refused the signed-in admin: `unauthorized` when the session is
 * no longer valid, `forbidden` when the account no longer has admin access.
 */
export type AuthFailure = "unauthorized" | "forbidden";

/** Listeners told when the API refuses the session. */
const authFailureListeners = new Set<(kind: AuthFailure) => void>();
export function onAuthFailure(listener: (kind: AuthFailure) => void): () => void {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}
function reportAuthFailure(kind: AuthFailure) {
  for (const l of authFailureListeners) l(kind);
}

function errorMessage(status: number, code: ApiErrorCode, missingRpc: boolean, detail: string | undefined): string {
  if (missingRpc) return "The backend has no endpoint for this action yet.";
  if (status === 503) return "The admin service is unavailable right now. Try again in a moment.";
  if (status === 405) return "Administrators can't do this under the Final v6 admin design.";
  if (code === "unavailable") return "Not available yet: the database doesn't support this action. See docs/admin-database-handoff.md.";
  if (code === "conflict") return detail ?? "This record was changed in another session. Review the latest version before trying again.";
  return detail ?? "The admin API request failed.";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export async function adminRequest<T>(path: string, { method = "GET", query, body, signal }: RequestOptions = {}): Promise<T> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) {
    reportAuthFailure("unauthorized");
    throw new ApiError("unauthorized", "Your session has ended. Sign in again.");
  }

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/admin-api${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    apikey: SUPABASE_ANON_KEY,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("network_error", "Couldn't reach the admin API. Check your connection and try again.");
  }

  const text = response.status === 204 ? "" : await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // Team routes return { code, message }; console routes return { error: { code, message } }.
    const detail = ((payload as { error?: unknown })?.error ?? payload) as { code?: string; message?: string } | null;
    // An RPC the backend doesn't have yet is a 404 on its route, not a missing record.
    const missingRpc = response.status === 404 && path.startsWith("/rpc/");
    const code: ApiErrorCode = missingRpc ? "unavailable" : (CODE_BY_STATUS[response.status] ?? "network_error");
    if (code === "unauthorized") reportAuthFailure("unauthorized");
    // Only a lost admin role or a permission refusal; a denied origin is a deployment problem, not the account.
    if (code === "forbidden" && detail?.code === "admin_required") reportAuthFailure("forbidden");
    throw new ApiError(code, errorMessage(response.status, code, missingRpc, detail?.message));
  }
  return payload as T;
}

/** Console routes wrap responses as { data, pagination }. */
export async function consoleGet<T>(path: string, query?: RequestOptions["query"]): Promise<{ data: T; pagination?: { page: number; limit: number; total: number } }> {
  return adminRequest(path, { query });
}

/** Team-contract table reads return arrays directly (max 1000 rows per call). */
export async function readTable<T>(table: string, query?: RequestOptions["query"]): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await adminRequest<T[]>(`/${table}`, { query: { ...query, limit: 1000, offset } });
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
