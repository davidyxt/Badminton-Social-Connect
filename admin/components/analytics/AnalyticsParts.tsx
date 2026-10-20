import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Notice, StatTile } from "@/components/shared/Card";
import { featureGap } from "@/lib/api/capabilities";
import { IS_API } from "@/lib/config";
import { changeVsPrevious } from "./range";

export function SampleDataNotice() {
  return (
    <div className="mb-5">
      {IS_API ? (
        <Notice title="Partly tracked">{featureGap("analytics")} Days are complete Australia/Melbourne days, up to yesterday.</Notice>
      ) : (
        <Notice title="Sample data">App-event tracking isn&apos;t built yet, so these figures are sample data, not real usage.</Notice>
      )}
    </div>
  );
}

/** Stands in for a chart when the backend doesn't track the metric yet. */
export function NotTracked({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-line-strong px-6 text-center text-sm text-ink-muted">
      {label} isn&apos;t tracked yet. It needs usage events on the backend.
    </div>
  );
}

/** Total for the range with the change against the previous equal-length period. */
export function KpiTile({
  label,
  value,
  previous,
  days,
  hint,
  unavailable,
}: {
  label: string;
  value: number;
  previous: number | null;
  days: number;
  hint?: ReactNode;
  unavailable?: boolean;
}) {
  if (unavailable) return <StatTile label={label} value={<span className="text-ink-faint">—</span>} hint="Not tracked yet" />;
  const change = changeVsPrevious(value, previous, days);
  return (
    <StatTile
      label={label}
      value={value.toLocaleString("en-AU")}
      hint={
        change ? (
          <span className="inline-flex items-center gap-1">
            {change.direction === "up" && <TrendingUp className="size-3.5" aria-hidden />}
            {change.direction === "down" && <TrendingDown className="size-3.5" aria-hidden />}
            {change.text}
          </span>
        ) : (
          (hint ?? "No earlier data to compare")
        )
      }
    />
  );
}
