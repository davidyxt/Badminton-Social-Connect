"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFeedback } from "@/components/shared/FeedbackToast";
import { isApiError } from "@/lib/mock-api";

/** "busy": another action from this hook was still running, so nothing was sent. Callers treat it as a no-op. */
export type ActionOutcome = "success" | "failed" | "conflict" | "busy";

export interface RunOptions<T> {
  /** Shown in the saving toast. */
  saving?: string;
  /** Title of the success toast. */
  success: string;
  successDetail?: string;
  onSuccess?: (result: T) => void;
  /** Called when the record changed underneath us; usually closes the dialog. */
  onConflict?: () => void;
}

/**
 * Runs a mutating data-layer call through the shared feedback states, so every
 * page gets saving / saved / failed+retry / record-changed for free.
 */
export function useAdminAction() {
  const feedback = useFeedback();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  // Lets the Retry button re-enter `run` without the callback referencing itself.
  const runRef = useRef<typeof run | null>(null);
  // The "Couldn't save" toast from the last failed run. The next run (e.g. the dialog's
  // "Try again") takes it over, so a stale Retry never stays behind after a later success.
  const failedToast = useRef<number | null>(null);

  const run = useCallback(
    async <T>(action: () => Promise<T>, opts: RunOptions<T>, toastId?: number): Promise<ActionOutcome> => {
      if (inFlight.current) return "busy";
      inFlight.current = true;
      setPending(true);
      const saving = { kind: "saving" as const, title: opts.saving ?? "Saving changes…" };
      const reuse = toastId ?? failedToast.current;
      failedToast.current = null;
      const id = reuse ?? feedback.show(saving);
      if (reuse !== null) feedback.update(id, saving);
      try {
        const result = await action();
        feedback.update(id, { kind: "success", title: opts.success, message: opts.successDetail });
        opts.onSuccess?.(result);
        return "success";
      } catch (err) {
        if (isApiError(err) && (err.code === "conflict" || err.code === "not_found")) {
          feedback.update(id, { kind: "conflict", title: "Record changed", message: err.message });
          opts.onConflict?.();
          return "conflict";
        }
        const message = err instanceof Error ? err.message : "Something went wrong.";
        const unavailable = isApiError(err) && err.code === "unavailable";
        const retryable = !(isApiError(err) && (err.code === "validation" || unavailable));
        if (retryable) failedToast.current = id;
        feedback.update(id, {
          kind: "error",
          title: unavailable ? "Not available yet" : "Couldn't save",
          message,
          onRetry: retryable
            ? () => {
                void runRef.current?.(action, opts, id);
              }
            : undefined,
        });
        return "failed";
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [feedback],
  );

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  return { run, pending };
}
