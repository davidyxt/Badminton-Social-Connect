"use client";

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";

export interface ConfirmValues {
  reason: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Extra context, e.g. a summary of the record being acted on. */
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Ask for a typed reason / note. */
  reason?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    hint?: string;
  };
  /** Require typing this exact phrase before confirming (irreversible deletes). */
  confirmPhrase?: string;
  /**
   * Resolve with "failed" to keep the dialog open with the user's input intact
   * (screen 33). The caller closes the dialog itself on success/conflict.
   */
  onConfirm: (values: ConfirmValues) => Promise<"success" | "failed" | "conflict" | "busy"> | void;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus management: focuses the first match of `initialFocus` on open,
 * keeps Tab / Shift+Tab inside the dialog, calls `onEscape` on Escape, and
 * returns focus to whatever was focused before the dialog opened.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onEscape: () => void, initialFocus = "textarea, input, button[data-autofocus]") {
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>(initialFocus)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        escapeRef.current();
        return;
      }
      const dialog = ref.current;
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, initialFocus]);
}

/** Generic confirmation modal used by every admin action (screens 10, 13, 29-31, 39-42). */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  // Mounting fresh on every open resets the form without effects.
  return <ConfirmDialogInner {...props} />;
}

function ConfirmDialogInner({
  title,
  description,
  children,
  confirmLabel,
  tone = "primary",
  reason,
  confirmPhrase,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reasonText, setReasonText] = useState("");
  const [phrase, setPhrase] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  const reasonId = useId();
  const phraseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(dialogRef, () => {
    if (!submitting) onClose();
  });

  const phraseOk = !confirmPhrase || phrase.trim() === confirmPhrase;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason?.required && !reasonText.trim()) {
      setReasonError(true);
      document.getElementById(reasonId)?.focus();
      return;
    }
    if (!phraseOk) return;
    setSubmitting(true);
    setFailed(false);
    const outcome = await onConfirm({ reason: reasonText.trim() });
    setSubmitting(false);
    if (outcome === "failed") setFailed(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => !submitting && onClose()} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
      >
        <form onSubmit={submit} noValidate>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-ink">
                {tone === "danger" && <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />}
                {title}
              </h2>
              {description && <div className="mt-1 text-[13px] text-ink-muted">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="-mt-1 -mr-1.5 rounded-md p-1 text-ink-faint hover:bg-subtle hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {children}

            {reason && (
              <div>
                <label htmlFor={reasonId} className="block text-[13px] font-medium text-ink">
                  {reason.label}
                  {reason.required && <span className="text-danger"> *</span>}
                </label>
                <textarea
                  id={reasonId}
                  rows={3}
                  value={reasonText}
                  disabled={submitting}
                  onChange={(e) => {
                    setReasonText(e.target.value);
                    if (e.target.value.trim()) setReasonError(false);
                  }}
                  placeholder={reason.placeholder}
                  aria-invalid={reasonError || undefined}
                  aria-describedby={reasonError ? `${reasonId}-error` : reason.hint ? `${reasonId}-hint` : undefined}
                  className={`mt-1.5 block w-full resize-y rounded-md border bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
                    reasonError ? "border-danger focus:ring-danger/20" : "border-line-strong focus:border-brand focus:ring-brand/20"
                  }`}
                />
                {reasonError ? (
                  <p id={`${reasonId}-error`} className="mt-1.5 text-[13px] text-danger">
                    {reason.label} is required before you can continue.
                  </p>
                ) : (
                  reason.hint && (
                    <p id={`${reasonId}-hint`} className="mt-1.5 text-xs text-ink-faint">
                      {reason.hint}
                    </p>
                  )
                )}
              </div>
            )}

            {confirmPhrase && (
              <div>
                <label htmlFor={phraseId} className="block text-[13px] font-medium text-ink">
                  Type <span className="rounded bg-neutral-soft px-1 py-0.5 font-mono text-xs">{confirmPhrase}</span> to confirm
                </label>
                <input
                  id={phraseId}
                  value={phrase}
                  disabled={submitting}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1.5 block h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 font-mono text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
              </div>
            )}

            {failed && (
              <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
                That didn&apos;t save. Your input has been kept, so you can try again.
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={onClose} disabled={submitting} data-autofocus={!reason && !confirmPhrase ? true : undefined}>
              Cancel
            </Button>
            <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={submitting} disabled={!phraseOk}>
              {submitting ? "Saving…" : failed ? "Try again" : confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
