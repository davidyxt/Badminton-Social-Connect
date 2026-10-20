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
const CONFLICT_TIMEOUT_MS = 8000;

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
      // Errors stay until dismissed (they offer Retry); confirmations and "record changed" notices clear themselves.
      if (kind === "success") timers.current.set(id, setTimeout(() => dismiss(id), SUCCESS_TIMEOUT_MS));
      if (kind === "conflict") timers.current.set(id, setTimeout(() => dismiss(id), CONFLICT_TIMEOUT_MS));
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
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
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

const ICONS: Record<FeedbackKind, ReactNode> = {
  saving: <LoaderCircle className="size-4 animate-spin text-ink-faint" aria-hidden />,
  success: <CircleCheck className="size-4 text-success" aria-hidden />,
  error: <TriangleAlert className="size-4 text-danger" aria-hidden />,
  conflict: <RefreshCw className="size-4 text-warning" aria-hidden />,
};

export function FeedbackToast({ toast, onDismiss }: { toast: FeedbackMessage; onDismiss: () => void }) {
  return (
    <div
      role={toast.kind === "error" || toast.kind === "conflict" ? "alert" : "status"}
      className="animate-toast-in pointer-events-auto flex gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
    >
      <div className="mt-px shrink-0">{ICONS[toast.kind]}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-ink-muted">{toast.message}</div>}
        {toast.onRetry && (
          <button type="button" onClick={toast.onRetry} className="mt-1.5 text-[13px] font-medium text-brand hover:underline">
            Retry
          </button>
        )}
      </div>
      {toast.kind !== "saving" && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mt-0.5 -mr-1 shrink-0 self-start rounded-md p-1 text-ink-faint hover:bg-subtle hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
