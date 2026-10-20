"use client";

/**
 * Shared feedback for every mutating action (Figma screens 33-36):
 *   saving    (35) spinner while the request is in flight
 *   success   (36) brief confirmation, auto-dismisses
 *   error     (33) save failed, with Retry; caller keeps the user's input
 *   conflict  (34) record changed in another session
 * Screen 32 (required reason) is inline validation inside ConfirmDialog.
 */
import { CircleCheck, LoaderCircle, RefreshCw, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type FeedbackKind = "saving" | "success" | "error" | "conflict";

export interface FeedbackMessage {
  kind: FeedbackKind;
  title: string;
  message?: string;
  onRetry?: () => void;
}

interface Toast extends FeedbackMessage {
  id: number;
}

interface FeedbackContextValue {
  show: (toast: FeedbackMessage) => number;
  update: (id: number, toast: FeedbackMessage) => void;
  dismiss: (id: number) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
const SUCCESS_TIMEOUT_MS = 3500;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, kind: FeedbackKind) => {
      clearTimeout(timers.current.get(id));
      if (kind === "success") timers.current.set(id, setTimeout(() => dismiss(id), SUCCESS_TIMEOUT_MS));
    },
    [dismiss],
  );

  const show = useCallback(
    (toast: FeedbackMessage) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { ...toast, id }]);
      schedule(id, toast.kind);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, toast: FeedbackMessage) => {
      setToasts((ts) => (ts.some((t) => t.id === id) ? ts.map((t) => (t.id === id ? { ...toast, id } : t)) : [...ts, { ...toast, id }]));
      schedule(id, toast.kind);
    },
    [schedule],
  );

  const value = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <FeedbackToast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

const STYLES: Record<FeedbackKind, { wrap: string; icon: ReactNode }> = {
  saving: { wrap: "border-line bg-surface", icon: <LoaderCircle className="size-5 animate-spin text-brand" aria-hidden /> },
  success: { wrap: "border-success/30 bg-surface", icon: <CircleCheck className="size-5 text-success" aria-hidden /> },
  error: { wrap: "border-danger/40 bg-surface", icon: <TriangleAlert className="size-5 text-danger" aria-hidden /> },
  conflict: { wrap: "border-warning/40 bg-surface", icon: <RefreshCw className="size-5 text-warning" aria-hidden /> },
};

export function FeedbackToast({ toast, onDismiss }: { toast: FeedbackMessage; onDismiss: () => void }) {
  const style = STYLES[toast.kind];
  return (
    <div
      role={toast.kind === "error" || toast.kind === "conflict" ? "alert" : "status"}
      className={`animate-toast-in pointer-events-auto flex gap-3 rounded-xl border px-4 py-3 shadow-lg ${style.wrap}`}
    >
      <div className="mt-0.5 shrink-0">{style.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-sm text-ink-muted">{toast.message}</div>}
        {toast.onRetry && (
          <button type="button" onClick={toast.onRetry} className="mt-2 text-sm font-semibold text-brand hover:underline">
            Retry
          </button>
        )}
      </div>
      {toast.kind !== "saving" && (
        <button type="button" onClick={onDismiss} className="shrink-0 self-start rounded p-0.5 text-ink-faint hover:text-ink" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
