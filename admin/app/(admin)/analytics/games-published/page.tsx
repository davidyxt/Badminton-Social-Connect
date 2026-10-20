"use client";

import { MetricBreakdown } from "../MetricBreakdown";

/** Screen 07 */
export default function GamesPublishedPage() {
  return (
    <MetricBreakdown
      title="Games published"
      description="Game posts published by organisers, and how many filled every spot."
      metrics={[
        { metric: "games_published", label: "Games published", valueLabel: "Games", description: "New game posts." },
        { metric: "games_filled", label: "Games filled", valueLabel: "Games", description: "Game posts that filled every spot." },
      ]}
    />
  );
}
