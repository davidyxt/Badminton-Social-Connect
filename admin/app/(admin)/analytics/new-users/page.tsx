"use client";

import { MetricBreakdown } from "../MetricBreakdown";

/** Screen 04 */
export default function NewUsersPage() {
  return (
    <MetricBreakdown
      title="New users"
      description="Players who created an account in the selected period."
      metrics={[{ metric: "new_users", label: "New users", valueLabel: "New users", description: "Accounts created." }]}
    />
  );
}
