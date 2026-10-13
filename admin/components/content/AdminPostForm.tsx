"use client";

import { ImageOff, TriangleAlert, Upload, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import { useDialogFocus } from "@/components/shared/ConfirmDialog";
import { IS_API } from "@/lib/config";
import type { ActionOutcome } from "@/lib/hooks/useAdminAction";
import type { AdminPostStatus } from "@/lib/types";

export interface AdminPostFormValues {
  title: string;
  body: string;
  image_url: string;
  display_order: number;
  status: AdminPostStatus;
}


export interface AdminPostFormProps {
  open: boolean;
  mode: "create" | "edit";
  initial: AdminPostFormValues;
  /** Highest position the card can take (number of cards, +1 when creating). */
  maxOrder: number;
  onSubmit: (values: AdminPostFormValues) => Promise<ActionOutcome>;
  onClose: () => void;
}

/** Thumbnail for a carousel card, with a placeholder when there's no image. */
export function CardImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  if (!src.trim()) {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-neutral-soft text-ink-faint ${className}`}>
        <ImageOff className="size-5" aria-hidden />
        <span className="text-xs">No image</span>
      </div>
    );
  }
  // Plain <img>: the source may be a data URL from the upload field (mock mode).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`bg-neutral-soft object-cover ${className}`} />;
}

/** Create / edit a home page carousel card. NEW (no Figma design). */
export function AdminPostForm(props: AdminPostFormProps) {
  if (!props.open) return null;
  // Mounting fresh on every open resets the form without effects.
  return <AdminPostFormInner {...props} />;
}

type Errors = Partial<Record<"title" | "body" | "image_url" | "display_order", string>>;

/** The admin API only stores absolute http(s) URLs up to 2048 characters (no uploads, no relative paths). */
function isApiImageUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validate(v: AdminPostFormValues, maxOrder: number): Errors {
  const e: Errors = {};
  if (!v.title.trim()) e.title = "Title is required.";
  if (!Number.isInteger(v.display_order) || v.display_order < 1 || v.display_order > maxOrder)
    e.display_order = `Enter a position from 1 to ${maxOrder}.`;
  if (v.status === "published") {
    if (!v.body.trim()) e.body = "Body text is required to publish.";
    if (!v.image_url.trim()) e.image_url = "An image is required to publish.";
  }
  if (IS_API && v.image_url.trim() && !isApiImageUrl(v.image_url.trim()))
    e.image_url = "Enter a full image address starting with https://, up to 2048 characters.";
  return e;
}

function AdminPostFormInner({ mode, initial, maxOrder, onSubmit, onClose }: AdminPostFormProps) {
  const [values, setValues] = useState<AdminPostFormValues>(initial);
  const [orderText, setOrderText] = useState(String(initial.display_order));
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const titleId = useId();
  const ids = { title: useId(), body: useId(), image: useId(), file: useId(), order: useId() };
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(
    dialogRef,
    () => {
      if (!submitting) onClose();
    },
    "input",
  );

  // Errors show (and update live) once the user has tried to save.
  const errors: Errors = submitted ? validate(values, maxOrder) : {};

  const set = <K extends keyof AdminPostFormValues>(key: K, value: AdminPostFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("Choose an image file (PNG, JPG, SVG or WebP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFileError("That image is over 2 MB. Choose a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("image_url", String(reader.result));
    reader.onerror = () => setFileError("Couldn't read that file. Try another image.");
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validate(values, maxOrder);
    const first = (["title", "body", "image_url", "display_order"] as const).find((k) => found[k]);
    if (first) {
      const target = { title: ids.title, body: ids.body, image_url: ids.image, display_order: ids.order }[first];
      document.getElementById(target)?.focus();
      return;
    }
    setSubmitting(true);
    setFailed(false);
    const outcome = await onSubmit({ ...values, title: values.title.trim(), body: values.body.trim(), image_url: values.image_url.trim() });
    setSubmitting(false);
    if (outcome === "failed") setFailed(true);
  }

  const publishing = values.status === "published";
  const isDataUrl = values.image_url.startsWith("data:");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => !submitting && onClose()} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
      >
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-ink">
                {mode === "create" ? "New carousel card" : "Edit carousel card"}
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">Published cards show on the player home page in display order.</p>
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

          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <Field id={ids.title} label="Title" required error={errors.title}>
              <input
                id={ids.title}
                value={values.title}
                maxLength={80}
                disabled={submitting}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Spring Singles League now open"
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={errors.title ? `${ids.title}-error` : undefined}
                className={inputClass(Boolean(errors.title))}
              />
            </Field>

            <Field id={ids.body} label="Body" required={publishing} hint={publishing ? undefined : "Required to publish."} error={errors.body}>
              <textarea
                id={ids.body}
                rows={3}
                value={values.body}
                maxLength={240}
                disabled={submitting}
                onChange={(e) => set("body", e.target.value)}
                placeholder="One or two short sentences."
                aria-invalid={errors.body ? true : undefined}
                aria-describedby={errors.body ? `${ids.body}-error` : `${ids.body}-hint`}
                className={`${inputClass(Boolean(errors.body))} resize-y`}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <Field
                  id={ids.image}
                  label="Image URL"
                  required={publishing}
                  hint={`${publishing ? "" : "Required to publish. "}${IS_API ? "Paste the image's full https:// address." : "Paste a URL or upload a file."}`}
                  error={errors.image_url}
                >
                  <input
                    id={ids.image}
                    value={isDataUrl ? "" : values.image_url}
                    disabled={submitting}
                    onChange={(e) => set("image_url", e.target.value)}
                    placeholder={isDataUrl ? "Using uploaded image" : IS_API ? "https://example.com/carousel/spring-league.jpg" : "https://… or /carousel/…"}
                    aria-invalid={errors.image_url ? true : undefined}
                    aria-describedby={errors.image_url ? `${ids.image}-error` : `${ids.image}-hint`}
                    className={inputClass(Boolean(errors.image_url))}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  {/* No upload endpoint in the admin API yet, so upload is mock-only. */}
                  {!IS_API && (
                    <>
                      <label
                        htmlFor={ids.file}
                        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-subtle has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-brand/20"
                      >
                        <Upload className="size-4" aria-hidden />
                        Upload image
                      </label>
                      <input
                        id={ids.file}
                        type="file"
                        accept="image/*"
                        disabled={submitting}
                        className="sr-only"
                        onChange={(e) => {
                          onFile(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}
                  {values.image_url && (
                    <Button size="sm" variant="ghost" disabled={submitting} onClick={() => set("image_url", "")}>
                      Remove image
                    </Button>
                  )}
                </div>
                <p className="text-xs text-ink-faint">
                  {IS_API
                    ? "Image upload isn't available yet. Host the image somewhere public and paste its address."
                    : "Uploaded images are only stored in this browser's demo data."}
                </p>
                {fileError && (
                  <p role="alert" className="flex items-center gap-1 text-[13px] text-danger">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    {fileError}
                  </p>
                )}
              </div>
              <div>
                <div className="text-[13px] font-medium text-ink">Preview</div>
                <CardImage src={values.image_url} alt="" className="mt-1.5 aspect-[4/3] w-full rounded-lg border border-line" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={ids.order} label="Display order" required hint={`Position 1 to ${maxOrder}. Other cards shift to make room.`} error={errors.display_order}>
                <input
                  id={ids.order}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxOrder}
                  value={orderText}
                  disabled={submitting}
                  onChange={(e) => {
                    setOrderText(e.target.value);
                    set("display_order", e.target.value === "" ? NaN : Number(e.target.value));
                  }}
                  aria-invalid={errors.display_order ? true : undefined}
                  aria-describedby={errors.display_order ? `${ids.order}-error` : `${ids.order}-hint`}
                  className={`${inputClass(Boolean(errors.display_order))} w-28`}
                />
              </Field>

              <fieldset>
                <legend className="text-[13px] font-medium text-ink">Status</legend>
                <div className="mt-1.5 inline-flex h-8 items-center rounded-md border border-line-strong bg-surface p-0.5" role="radiogroup">
                  {(["draft", "published"] as const).map((s) => (
                    <label
                      key={s}
                      className={`flex h-full cursor-pointer items-center rounded px-2.5 text-[13px] font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/20 ${
                        values.status === s ? "bg-subtle text-ink ring-1 ring-line-strong" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={s}
                        checked={values.status === s}
                        disabled={submitting}
                        onChange={() => set("status", s)}
                        className="sr-only"
                      />
                      {s === "draft" ? "Draft" : "Published"}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {publishing ? "Shows on the player home page once saved." : "Hidden from players until published."}
                </p>
              </fieldset>
            </div>

            {failed && (
              <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
                That didn&apos;t save. Your input has been kept, so you can try again.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <Button onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? "Saving…" : failed ? "Try again" : mode === "create" ? (publishing ? "Create and publish" : "Save draft") : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  `mt-1.5 block w-full rounded-md border bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
    invalid ? "border-danger focus:ring-danger/20" : "border-line-strong focus:border-brand focus:ring-brand/20"
  }`;

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-faint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
