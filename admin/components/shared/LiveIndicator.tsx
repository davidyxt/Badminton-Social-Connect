/** Marks a view that updates without refresh (stands in for Supabase Realtime). */
export function LiveIndicator({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted" title="Updates automatically">
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      {label}
    </span>
  );
}
