/**
 * Usage analytics read. In mock mode this serves generated sample series; with
 * the real API it serves what /analytics returns (new users and reports
 * received so far). A metric the backend doesn't track yet returns null.
 */
import { analyticsWindow } from "@/lib/api/sync";
import { IS_API } from "@/lib/config";
import { ANALYTICS_END_DATE as MOCK_END, ANALYTICS_START_DATE as MOCK_START, type AnalyticsMetric, type DailyPoint } from "@/lib/mock-data";
import type { MockDatabase } from "@/lib/types";

export type { AnalyticsMetric, DailyPoint };

const window = IS_API ? analyticsWindow() : null;
export const ANALYTICS_START_DATE = window ? window.firstDay : MOCK_START;
export const ANALYTICS_END_DATE = window ? window.end : MOCK_END;

/** Daily values for `metric` between `from` and `to` (YYYY-MM-DD, inclusive), or null if not tracked. */
export function get_usage_analytics(db: MockDatabase, metric: AnalyticsMetric, from: string, to: string): DailyPoint[] | null {
  const series = db.usage_analytics[metric];
  if (!series) return null;
  return series.filter((p) => p.date >= from && p.date <= to);
}
