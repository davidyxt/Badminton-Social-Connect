"use client";

import type { ReactNode } from "react";
import { AnalyticsRangeProvider } from "@/components/analytics/RangeContext";
import { analyticsBounds } from "@/lib/mock-api";

/** Shares the selected date range across the analytics pages. */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  // Worked out on each visit, so the latest complete day is right after midnight.
  const { start, end } = analyticsBounds();
  return (
    <AnalyticsRangeProvider min={start} max={end}>
      {children}
    </AnalyticsRangeProvider>
  );
}
