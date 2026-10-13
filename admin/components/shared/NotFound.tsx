import { SearchX } from "lucide-react";
import { ButtonLink } from "./Button";
import { EmptyState } from "./EmptyState";

/** Shown on detail routes when the id doesn't exist (or was deleted). */
export function RecordNotFound({ what, backHref, backLabel, detail }: { what: string; backHref: string; backLabel: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <EmptyState
        icon={<SearchX aria-hidden />}
        title={`${what} not found`}
        description={detail ?? `It may have been deleted, or the link is wrong.`}
        action={<ButtonLink href={backHref}>{backLabel}</ButtonLink>}
      />
    </div>
  );
}
