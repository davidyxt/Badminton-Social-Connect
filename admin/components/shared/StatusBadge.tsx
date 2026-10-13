import { humanize } from "@/lib/format";

/**
 * success/danger/warning/info render as a soft coloured badge and are for
 * states that need attention. The quiet tones render as a dot plus text, no
 * background: `neutral` (grey dot), `positive` (green dot, healthy routine
 * state), `accent` (blue dot, upcoming/accepting).
 */
export type StatusTone = "success" | "danger" | "warning" | "info" | "neutral" | "positive" | "accent";

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // Routine, healthy states: quiet.
  active: "positive",
  published: "positive",
  confirmed: "positive",
  verified: "positive",
  resolved: "positive",
  upheld: "positive",
  registered: "positive",
  open: "accent",
  full: "neutral",
  scheduled: "neutral",
  registration_closed: "neutral",
  completed: "neutral",
  draft: "neutral",
  cancelled: "neutral",
  dismissed: "neutral",
  deleted: "neutral",
  unverified: "neutral",
  // Needs attention.
  pending: "warning",
  awaiting_result: "warning",
  suspended: "danger",
  hidden: "danger",
  disputed: "danger",
};

const BADGE_CLASS: Partial<Record<StatusTone, string>> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

const QUIET_TEXT: Partial<Record<StatusTone, string>> = {
  neutral: "text-ink-muted",
  positive: "text-ink",
  accent: "text-ink",
};

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-ink-faint",
  positive: "bg-success",
  accent: "bg-brand",
};

/** One visual treatment for every entity status across the console. */
export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: StatusTone }) {
  const t = tone ?? TONE_BY_STATUS[status] ?? "neutral";
  const badge = BADGE_CLASS[t];
  const cls = badge ? `rounded-md px-1.5 py-0.5 ${badge}` : `py-0.5 ${QUIET_TEXT[t]}`;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[t]}`} aria-hidden />
      {label ?? humanize(status)}
    </span>
  );
}
