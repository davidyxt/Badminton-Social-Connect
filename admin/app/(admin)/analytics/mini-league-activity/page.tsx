"use client";

import { MetricBreakdown } from "../MetricBreakdown";

/** Screen 06 */
export default function MiniLeagueActivityPage() {
  return (
    <MetricBreakdown
      title="Mini League activity"
      description="Players joining Mini Leagues and league matches played."
      metrics={[
        { metric: "league_joins", label: "League joins", valueLabel: "Joins", description: "Players who joined a Mini League." },
        { metric: "league_matches", label: "League matches", valueLabel: "Matches", description: "Mini League matches played." },
      ]}
    />
  );
}
