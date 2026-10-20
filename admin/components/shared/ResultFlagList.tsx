import Link from "next/link";
import { formatDateTime, humanize, RESULT_FLAG_LABEL } from "@/lib/format";
import type { ResultFlag } from "@/lib/types";

const detailText = (detail: Record<string, unknown>) =>
  Object.entries(detail)
    .map(([k, v]) => `${humanize(k)}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");

/** Anomalies the shared rating engine noticed on results. Read-only. */
export function ResultFlagList({ flags, linkToMatch = false }: { flags: ResultFlag[]; linkToMatch?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {flags.map((f) => (
        <li key={f.flag_id} className="flex gap-2.5 py-2.5 first:pt-0 last:pb-0">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium text-ink">
                {RESULT_FLAG_LABEL[f.kind] ?? humanize(f.kind)}
                {linkToMatch && (
                  <>
                    <span className="text-ink-faint">{" · "}</span>
                    <Link href={`/games/${f.match_id}`} className="font-normal text-brand hover:underline">
                      View game
                    </Link>
                  </>
                )}
              </span>
              <time dateTime={f.created_at} className="text-xs text-ink-faint tabular-nums">
                {formatDateTime(f.created_at)}
              </time>
            </div>
            {Object.keys(f.detail).length > 0 && <div className="text-[13px] break-words text-ink-muted">{detailText(f.detail)}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
