import { ACTION_LABEL, formatDateTime, humanize } from "@/lib/format";
import type { ActivityLog } from "@/lib/types";
import { IS_API } from "@/lib/config";

/** Compact list of admin actions on one record, newest first. */
export function ActivityTimeline({ entries, empty = "No admin actions recorded yet." }: { entries: ActivityLog[]; empty?: string }) {
  if (entries.length === 0) return <p className="text-sm text-ink-muted">{IS_API ? "Administrator activity history is not available yet." : empty}</p>;
  return (
    <ol className="space-y-4">
      {entries.map((e) => (
        <li key={e.log_id} className="relative pl-5">
          <span className="absolute top-1.5 left-0 size-2 rounded-full bg-brand" aria-hidden />
          <div className="text-sm font-medium text-ink">{ACTION_LABEL[e.action] ?? humanize(e.action)}</div>
          <div className="text-sm text-ink-muted">{e.details}</div>
          <div className="mt-0.5 text-xs text-ink-faint">{formatDateTime(e.created_at)}</div>
        </li>
      ))}
    </ol>
  );
}
