/**
 * Error shape returned by the data layer. Mirrors the API spec's 401/403/404/
 * 409/422 responses so the real Supabase client wrapper can throw the same type.
 */
/**
 * `unavailable` covers the admin API's 501 (needs a database change) and 405
 * (prohibited by the Final v6 design) responses.
 */
export type ApiErrorCode = "network_error" | "conflict" | "validation" | "not_found" | "unauthorized" | "forbidden" | "unavailable";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
