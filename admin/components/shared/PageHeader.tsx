import Link from "next/link";
import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-faint">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-line-strong" aria-hidden>
                    /
                  </span>
                )}
                {c.href ? (
                  <Link href={c.href} className="hover:text-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-ink-muted">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {meta}
          </div>
          {description && <p className="mt-0.5 max-w-3xl text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
