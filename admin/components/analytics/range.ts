/**
 * Pure date-range helpers for the analytics screens. Dates are YYYY-MM-DD in UTC.
 */
import type { ChartPoint } from "@/components/shared/Charts";

export type RangePreset = 7 | 30 | 90 | 180 | "custom";

export interface DateRange {
  preset: RangePreset;
  from: string;
  to: string;
}

export const PRESETS: Exclude<RangePreset, "custom">[] = [7, 30, 90, 180];

const DAY = 86_400_000;
const toTime = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => toIso(toTime(iso) + n * DAY);
/** Inclusive day count. */
export const daysInRange = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY) + 1;

export const clampDate = (iso: string, min: string, max: string) => (iso < min ? min : iso > max ? max : iso);

export function presetRange(days: Exclude<RangePreset, "custom">, min: string, max: string): DateRange {
  return { preset: days, from: clampDate(addDays(max, -(days - 1)), min, max), to: max };
}

/** The equal-length period immediately before the range. */
export function previousRange(from: string, to: string) {
  const len = daysInRange(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

const shortFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
export const shortLabel = (iso: string) => shortFmt.format(new Date(toTime(iso)));
const longFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const longLabel = (iso: string) => longFmt.format(new Date(toTime(iso)));

export const isWeekly = (from: string, to: string) => daysInRange(from, to) > 31;

/** Daily points, or 7-day buckets starting at `from` when the range is longer than 31 days. */
export function toChartPoints(points: { date: string; value: number }[], from: string, to: string): ChartPoint[] {
  if (!isWeekly(from, to)) return points.map((p) => ({ label: shortLabel(p.date), value: p.value }));
  const buckets = new Map<number, number>();
  const start = toTime(from);
  for (const p of points) {
    const i = Math.floor((toTime(p.date) - start) / (7 * DAY));
    buckets.set(i, (buckets.get(i) ?? 0) + p.value);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, value]) => ({ label: `w/c ${shortLabel(toIso(start + i * 7 * DAY))}`, value }));
}

export const sum = (points: { value: number }[]) => points.reduce((t, p) => t + p.value, 0);

/** "+12% vs prior 30d", or null when there's no comparable earlier data. Kept short to fit a stat strip. */
export function changeVsPrevious(current: number, previous: number | null, days: number): { text: string; direction: "up" | "down" | "flat" } | null {
  if (previous === null) return null;
  const period = `prior ${days}d`;
  if (previous === 0) return current === 0 ? { text: `No change vs ${period}`, direction: "flat" } : { text: `Up from 0 in ${period}`, direction: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: `No change vs ${period}`, direction: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs ${period}`, direction: pct > 0 ? "up" : "down" };
}
