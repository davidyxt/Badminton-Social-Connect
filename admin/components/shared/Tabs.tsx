"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  /** Link tabs navigate between routes; button tabs switch local state. */
  href?: string;
}

export function Tabs({ tabs, active, onChange, label }: { tabs: TabItem[]; active?: string; onChange?: (id: string) => void; label: string }) {
  const pathname = usePathname();
  return (
    <div className="mb-5 border-b border-line">
      <nav className="-mb-px flex gap-5 overflow-x-auto" aria-label={label}>
        {tabs.map((t) => {
          const isActive = t.href ? pathname === t.href : active === t.id;
          const cls = `inline-flex items-center gap-2 border-b-2 px-0.5 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
            isActive ? "border-brand text-brand" : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
          }`;
          const content = (
            <>
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${isActive ? "bg-brand-soft text-brand" : "bg-neutral-soft text-ink-muted"}`}>
                  {t.count}
                </span>
              )}
            </>
          );
          return t.href ? (
            <Link key={t.id} href={t.href} className={cls} aria-current={isActive ? "page" : undefined}>
              {content}
            </Link>
          ) : (
            <button key={t.id} type="button" onClick={() => onChange?.(t.id)} className={cls} aria-pressed={isActive}>
              {content}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
