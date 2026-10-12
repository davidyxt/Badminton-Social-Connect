import { seeded } from "./games";

/**
 * Plausible daily time series for the Usage & Analytics screens.
 * The Requirements Document notes app-event tracking isn't built yet, so this
 * is generated rather than derived from the other fixtures.
 */
export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export type AnalyticsMetric =
  | "new_users"
  | "reports_received"
  | "league_joins"
  | "league_matches"
  | "games_published"
  | "games_filled"
  | "active_players";

const DAYS = 180;
const END = Date.UTC(2026, 9, 9); // 9 Oct 2026, the last full day in the mock world

function series(seed: number, base: number, trend: number, weekendBoost: number, noise: number): DailyPoint[] {
  const rand = seeded(seed);
  const out: DailyPoint[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const t = END - i * 86_400_000;
    const d = new Date(t);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const progress = (DAYS - i) / DAYS;
    const value = base + trend * progress + (weekend ? weekendBoost : 0) + (rand() - 0.5) * noise;
    out.push({ date: d.toISOString().slice(0, 10), value: Math.max(0, Math.round(value)) });
  }
  return out;
}

export const analyticsSeries: Record<AnalyticsMetric, DailyPoint[]> = {
  new_users: series(1, 6, 14, 6, 8),
  reports_received: series(2, 1, 2, 1, 3),
  league_joins: series(3, 2, 6, 3, 4),
  league_matches: series(4, 3, 9, 6, 5),
  games_published: series(5, 9, 18, 12, 10),
  games_filled: series(6, 6, 12, 9, 7),
  active_players: series(7, 70, 160, 40, 30),
};

export const ANALYTICS_END_DATE = new Date(END).toISOString().slice(0, 10);
export const ANALYTICS_START_DATE = analyticsSeries.new_users[0].date;
