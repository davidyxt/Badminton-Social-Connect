"use client";

import { useAnalyticsRange } from "@/components/analytics/RangeContext";
import { daysInRange, previousRange, sum, toChartPoints } from "@/components/analytics/range";
import { get_usage_analytics, useQuery, type AnalyticsMetric } from "@/lib/mock-api";

/** Chart points, total and previous-period total for one metric over the selected range. */
export function useMetric(metric: AnalyticsMetric) {
  const { range, min } = useAnalyticsRange();
  const prev = previousRange(range.from, range.to);
  const { daily, previousDaily } = useQuery((db) => ({
    daily: get_usage_analytics(db, metric, range.from, range.to),
    previousDaily: prev.from >= min ? get_usage_analytics(db, metric, prev.from, prev.to) : null,
  }));
  return {
    /** The backend doesn't track this metric yet. */
    unavailable: daily === null,
    points: toChartPoints(daily ?? [], range.from, range.to),
    total: sum(daily ?? []),
    previous: previousDaily ? sum(previousDaily) : null,
    days: daysInRange(range.from, range.to),
  };
}

/** Shared picker wiring for each analytics page. */
export function useRangeControl() {
  const { range, setRange, min, max } = useAnalyticsRange();
  return { value: range, onChange: setRange, min, max };
}
