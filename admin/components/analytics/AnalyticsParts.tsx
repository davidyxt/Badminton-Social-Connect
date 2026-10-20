import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Notice, StatTile } from "@/components/shared/Card";
import { featureGap } from "@/lib/api/capabilities";
import { IS_API } from "@/lib/config";
import { changeVsPrevious } from "./range";

/** API mode only: which metrics the backend can't report yet. */
export function SampleDataNotice() {
  if (!IS_API) return null;
  return (
    <div className="mb-6">
      <Notice>{featureGap("analytics")} Days are complete Melbourne days, up to yesterday.</Notice>
    </div>
  );
}

/** Stands in for a chart when the backend doesn't track the metric yet. */
export function NotTracked({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-0.5 rounded-md bg-subtle px-6 text-center">
      <span className="text-[13px] font-medium text-ink-muted">Not tracked yet</span>
      <span className="text-xs text-ink-faint">{label} needs usage events on the backend.</span>
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
