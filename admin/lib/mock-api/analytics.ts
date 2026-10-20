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

/**
 * First and last selectable day. In API mode the window ends yesterday
 * (Melbourne time), so it's worked out on each call rather than at load.
 */
export function analyticsBounds(): { start: string; end: string } {
  if (!IS_API) return { start: MOCK_START, end: MOCK_END };
  const range = analyticsWindow();
  return { start: range.firstDay, end: range.end };
}

/**
 * Snapshot of analyticsBounds() taken when the module loads. Kept for existing
 * imports; in API mode it goes stale after midnight until the page reloads, so
 * prefer analyticsBounds().
 */
export const { start: ANALYTICS_START_DATE, end: ANALYTICS_END_DATE } = analyticsBounds();

/** Daily values for `metric` between `from` and `to` (YYYY-MM-DD, inclusive), or null if not tracked. */
export function get_usage_analytics(db: MockDatabase, metric: AnalyticsMetric, from: string, to: string): DailyPoint[] | null {
  const series = db.usage_analytics[metric];
  if (!series) return null;
  return series.filter((p) => p.date >= from && p.date <= to);
}
