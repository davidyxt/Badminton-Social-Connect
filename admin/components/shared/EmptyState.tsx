import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-ink-faint [&_svg]:size-5">{icon ?? <Inbox aria-hidden />}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
