"use client";

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  onConfirm: (values: ConfirmValues) => Promise<"success" | "failed" | "conflict"> | void;
  onClose: () => void;
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

  useEffect(() => {
    const el = dialogRef.current?.querySelector<HTMLElement>("textarea, input, button[data-autofocus]");
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

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
      <div className="absolute inset-0 bg-ink/40" onClick={() => !submitting && onClose()} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-2xl bg-surface shadow-2xl"
      >
        <form onSubmit={submit} noValidate>
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="flex items-start gap-3">
              {tone === "danger" && (
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <TriangleAlert className="size-5" aria-hidden />
                </div>
              )}
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-ink">
                  {title}
                </h2>
                {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={submitting} className="rounded p-1 text-ink-faint hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-4 px-6 py-5">
            {children}

            {reason && (
              <div>
                <label htmlFor={reasonId} className="block text-sm font-medium text-ink">
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
                  className={`mt-1.5 block w-full resize-y rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
                    reasonError ? "border-danger focus:ring-danger/30" : "border-line-strong focus:ring-brand/30"
                  }`}
                />
                {reasonError ? (
                  <p id={`${reasonId}-error`} className="mt-1.5 flex items-center gap-1 text-sm text-danger">
                    <TriangleAlert className="size-4" aria-hidden />
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
                <label htmlFor={phraseId} className="block text-sm font-medium text-ink">
                  Type <span className="rounded bg-neutral-soft px-1.5 py-0.5 font-mono text-xs">{confirmPhrase}</span> to confirm
                </label>
                <input
                  id={phraseId}
                  value={phrase}
                  disabled={submitting}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1.5 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-brand/30 focus:outline-none"
                />
              </div>
            )}

            {failed && (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                That didn&apos;t save. Your input has been kept, so you can try again.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-subtle px-6 py-4">
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
