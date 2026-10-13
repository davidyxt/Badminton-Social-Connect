"use client";

import type { ReactNode } from "react";
import { AnalyticsRangeProvider } from "@/components/analytics/RangeContext";
import { ANALYTICS_END_DATE, ANALYTICS_START_DATE } from "@/lib/mock-api";

/** Shares the selected date range across the analytics pages. */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <AnalyticsRangeProvider min={ANALYTICS_START_DATE} max={ANALYTICS_END_DATE}>
      {children}
    </AnalyticsRangeProvider>
  );
}
