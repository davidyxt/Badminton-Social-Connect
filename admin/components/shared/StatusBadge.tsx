import { humanize } from "@/lib/format";

type Tone = "success" | "danger" | "warning" | "info" | "neutral";

const TONE_BY_STATUS: Record<string, Tone> = {
  active: "success",
  suspended: "danger",
  pending: "warning",
  resolved: "success",
  dismissed: "neutral",
  hidden: "danger",
  published: "success",
  draft: "neutral",
  open: "info",
  full: "info",
  cancelled: "neutral",
  registration_closed: "warning",
  scheduled: "info",
  awaiting_result: "warning",
  completed: "success",
  disputed: "danger",
  confirmed: "success",
  upheld: "success",
  deleted: "neutral",
  verified: "success",
  unverified: "neutral",
};

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-ink-muted",
};

const DOT_CLASS: Record<Tone, string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-ink-faint",
};

/** One visual treatment for every entity status across the console. */
export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  const t = tone ?? TONE_BY_STATUS[status] ?? "neutral";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[t]}`}>
      <span className={`size-1.5 rounded-full ${DOT_CLASS[t]}`} aria-hidden />
      {label ?? humanize(status)}
    </span>
  );
}
