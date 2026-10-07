import { supabase } from "./supabase";

// One error type for every database call. The database writes its messages
// to be shown to players ("Games cannot be cancelled within 4 hours..."), so
// pages can display err.message. err.code is the Postgres code for special
// cases: 23505 already done, 23514 a rule was broken, 42501 not allowed.
export class ApiError extends Error {
  constructor(error) {
    super(error?.message || "Something went wrong. Please try again.");
    this.name = "ApiError";
    this.code = error?.code;
  }
}

// Calls a database function (supabase.rpc) and returns its result.
export async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new ApiError(error);
  return data;
}

// For table queries: await unwrap(supabase.from("x").select(...)).
export async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw new ApiError(error);
  return data;
}
