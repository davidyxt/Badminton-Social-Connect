import { ACTION_LABEL, formatDateTime, humanize } from "@/lib/format";
import type { ActivityLog } from "@/lib/types";

/** Compact list of admin actions on one record, newest first. */
export function ActivityTimeline({ entries, empty = "No admin actions recorded yet." }: { entries: ActivityLog[]; empty?: string }) {
  if (entries.length === 0) return <p className="text-[13px] text-ink-muted">{empty}</p>;
  return (
    <ol className="relative space-y-3.5">
      {entries.map((e, i) => (
        <li key={e.log_id} className="relative pl-4">
          {i < entries.length - 1 && <span className="absolute top-3 -bottom-3.5 left-[2.5px] w-px bg-line" aria-hidden />}
          <span className="absolute top-[7px] left-0 size-1.5 rounded-full bg-ink-faint" aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-medium text-ink">{ACTION_LABEL[e.action] ?? humanize(e.action)}</span>
            <time dateTime={e.created_at} className="text-xs text-ink-faint tabular-nums">
              {formatDateTime(e.created_at)}
            </time>
          </div>
          {e.details && <div className="text-[13px] text-ink-muted">{e.details}</div>}
        </li>
      ))}
    </ol>
  );
}
