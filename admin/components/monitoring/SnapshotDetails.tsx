import { formatDateTime, humanize } from "@/lib/format";

/** Render captured values as text, never HTML or a replacement for the current record. */
export function SnapshotDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Not recorded</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) return <ul className="space-y-2">{value.map((item, i) => <li key={i}><SnapshotDetails value={item} /></li>)}</ul>;
  if (typeof value === "object") return <dl className="grid gap-3">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="text-xs font-medium text-ink-muted">{humanize(key)}</dt><dd className="mt-1 break-words text-sm">{key.endsWith("_at") && typeof item === "string" && Number.isFinite(Date.parse(item)) ? formatDateTime(item) : <SnapshotDetails value={item} />}</dd></div>)}</dl>;
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}
