"use client";

import { MetricBreakdown } from "../MetricBreakdown";

/** Screen 05 */
export default function ReportsReceivedPage() {
  return (
    <MetricBreakdown
      title="Reports received"
      description="Reports players filed about other players, game posts or Mini Leagues."
      metrics={[{ metric: "reports_received", label: "Reports received", valueLabel: "Reports", description: "All report types, whatever the outcome." }]}
    />
  );
}
