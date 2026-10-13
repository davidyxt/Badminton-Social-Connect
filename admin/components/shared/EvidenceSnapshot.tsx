import { Camera } from "lucide-react";
import { formatDateTime, humanize } from "@/lib/format";

const display = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

/**
 * The copy of the reported content the server captured when the report was
 * filed. It stays as it was even if the content is later edited or deleted.
 */
export function EvidenceSnapshot({ evidence }: { evidence: Record<string, unknown> | null }) {
  if (!evidence) {
    return <p className="text-sm text-ink-muted">No snapshot was stored with this report.</p>;
  }
  const capturedAt = typeof evidence.captured_at === "string" ? evidence.captured_at : null;
  const entries = Object.entries(evidence).filter(([key]) => key !== "captured_at");
  return (
    <div className="rounded-lg border border-line bg-subtle">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
        <Camera className="size-3.5" aria-hidden />
        {capturedAt ? `Captured ${formatDateTime(capturedAt)}, when the report was filed` : "Captured when the report was filed"}
      </div>
      <dl className="divide-y divide-line">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 px-4 py-2 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-ink-muted">{humanize(key)}</dt>
            <dd className="break-words text-ink">{display(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
