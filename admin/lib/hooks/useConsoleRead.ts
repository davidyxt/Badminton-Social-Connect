"use client";

import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/api/client";
import type { ConsoleResponse } from "@/lib/api/reads";
import { API_POLL_INTERVAL_MS } from "@/lib/config";

/** Details load on demand, retry explicitly and refresh alongside the directory cache. */
export function useConsoleRead<T>(path: string | null, query: Record<string, string | number> = {}) {
  const queryString = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]).sort()).toString();
  const key = `${path}?${queryString}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; response: ConsoleResponse<T> | null; error: string | null; loading: boolean }>({ key: "", response: null, error: null, loading: true });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await adminRequest<ConsoleResponse<T>>(path!, { query: Object.fromEntries(new URLSearchParams(queryString)), signal: controller.signal });
        if (!controller.signal.aborted) setState({ key, response, error: null, loading: false });
      } catch (error) {
        if (!controller.signal.aborted) setState((old) => ({ key, response: old.key === key ? old.response : null, error: error instanceof Error ? error.message : "Couldn't load this record.", loading: false }));
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), API_POLL_INTERVAL_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [path, queryString, key, attempt]);
  const current = state.key === key ? state : { response: null, error: null, loading: path !== null };
  return { response: current.response, error: current.error, loading: current.loading, retry: () => setAttempt((n) => n + 1) };
}
