import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** A bordered container. Use only where it genuinely groups a unit (a table, a form, a record summary). */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface ${className}`}>{children}</section>;
}

/**
 * Card title row. No divider by default; pass `divider` when the body is a
 * list or table that runs edge to edge.
 */
export function CardHeader({
  title,
  description,
  actions,
  divider = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  divider?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 px-4 pt-3 ${divider ? "border-b border-line pb-3" : "pb-1"}`}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

/** Section heading for content that sits outside a box. */
export function SectionHeading({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Label/value pairs, used for record details. */
export function DetailList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  const cols = columns === 1 ? "sm:grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3.5 ${cols}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[13px] text-ink-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One number with a label. Standalone it draws its own border; inside a
 * `StatGroup` (at any depth, so wrappers like KpiTile work) it drops its box and
 * the group draws the hairline dividers. `bare` forces the borderless look.
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  bare = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "danger" | "warning";
  bare?: boolean;
}) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  const box = bare
    ? ""
    : // The in-[.stat-group] variants sort after the base utilities, so they win inside a group.
      "rounded-lg border border-line bg-surface in-[.stat-group]:rounded-none in-[.stat-group]:border-t-0 in-[.stat-group]:border-l-0 in-[.stat-group]:bg-transparent";
  return (
    <div className={`min-w-0 px-4 py-3 ${box}`}>
      <div className="truncate text-[13px] text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

/**
 * A single bordered strip of StatTiles separated by hairlines. Two columns on
 * mobile, auto-fitting columns (min 140px) from `sm` up. Each tile draws a
 * right and bottom hairline; the inner grid is pulled 1px past the clipped
 * container so edge tiles lose theirs, which keeps dividers correct however the
 * row wraps.
 */
export function StatGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`stat-group overflow-hidden rounded-lg border border-line bg-surface ${className}`}>
      <div className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] [&>*]:border-line">{children}</div>
    </div>
  );
}

const NOTICE_TONE = {
  info: { cls: "bg-subtle text-ink-muted", title: "text-ink", Icon: Info, icon: "text-ink-faint" },
  warning: { cls: "bg-warning-soft text-ink", title: "text-warning", Icon: TriangleAlert, icon: "text-warning" },
  danger: { cls: "bg-danger-soft text-ink", title: "text-danger", Icon: CircleAlert, icon: "text-danger" },
} as const;

/**
 * Compact callout. The default tone is quiet and neutral; keep `warning` and
 * `danger` for things that need action (e.g. an account is suspended).
 */
export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger"; title?: string; children: ReactNode }) {
  const t = NOTICE_TONE[tone];
  return (
    <div className={`flex gap-2 rounded-md px-3 py-2 text-[13px] leading-5 ${t.cls}`} role="note">
      <t.Icon className={`mt-0.5 size-3.5 shrink-0 ${t.icon}`} aria-hidden />
      <div className="min-w-0">
        {title && <div className={`font-medium ${t.title}`}>{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
