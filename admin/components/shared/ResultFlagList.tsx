import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { formatDateTime, humanize, RESULT_FLAG_LABEL } from "@/lib/format";
import type { ResultFlag } from "@/lib/types";

const detailText = (detail: Record<string, unknown>) =>
  Object.entries(detail)
    .map(([k, v]) => `${humanize(k)}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");

/** Anomalies the shared rating engine noticed on results. Read-only. */
export function ResultFlagList({ flags, linkToMatch = false }: { flags: ResultFlag[]; linkToMatch?: boolean }) {
  return (
    <ul className="space-y-3">
      {flags.map((f) => (
        <li key={f.flag_id} className="flex gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 text-sm">
            <div className="font-medium text-ink">
              {RESULT_FLAG_LABEL[f.kind] ?? humanize(f.kind)}
              {linkToMatch && (
                <>
                  {" · "}
                  <Link href={`/games/${f.match_id}`} className="font-normal text-brand hover:underline">
                    View game
                  </Link>
                </>
              )}
            </div>
            {Object.keys(f.detail).length > 0 && <div className="break-words text-ink-muted">{detailText(f.detail)}</div>}
            <div className="text-xs text-ink-faint">{formatDateTime(f.created_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
