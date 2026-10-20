"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { presetRange, type DateRange } from "./range";

interface RangeContextValue {
  range: DateRange;
  setRange: (r: DateRange) => void;
  min: string;
  max: string;
}

const RangeContext = createContext<RangeContextValue | null>(null);

/** Keeps the selected date range while moving between analytics pages. */
export function AnalyticsRangeProvider({ min, max, children }: { min: string; max: string; children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(() => presetRange(30, min, max));
  return <RangeContext.Provider value={{ range, setRange, min, max }}>{children}</RangeContext.Provider>;
}

export function useAnalyticsRange(): RangeContextValue {
  const ctx = useContext(RangeContext);
  if (!ctx) throw new Error("useAnalyticsRange must be used inside AnalyticsRangeProvider");
  return ctx;
}
