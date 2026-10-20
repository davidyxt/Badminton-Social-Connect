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
    return <p className="text-[13px] text-ink-muted">No snapshot was stored with this report.</p>;
  }
  const capturedAt = typeof evidence.captured_at === "string" ? evidence.captured_at : null;
  const entries = Object.entries(evidence).filter(([key]) => key !== "captured_at");
  return (
    <div>
      <p className="mb-2 text-xs text-ink-faint">
        {capturedAt ? `Captured ${formatDateTime(capturedAt)}, when the report was filed` : "Captured when the report was filed"}
      </p>
      <dl className="divide-y divide-line border-y border-line">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[160px_1fr]">
            <dt className="text-[13px] text-ink-muted">{humanize(key)}</dt>
            <dd className="text-sm break-words text-ink">{display(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
