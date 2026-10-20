/**
 * Product scope switches. These only hide UI: the data layer, types, mock data
 * and backend schema are untouched, so turning a feature back on is a config change.
 *
 * Mini Leagues are out of scope for now. Set NEXT_PUBLIC_ENABLE_MINI_LEAGUES=true
 * to bring back the league screens, moderation tab, rankings tab, analytics,
 * league reports and league entries in the activity log. The league routes are
 * redirected in next.config.ts while this is off.
 */
export const MINI_LEAGUES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MINI_LEAGUES === "true";

/** False for records the console currently hides (e.g. reports or log entries about Mini Leagues). */
export const isVisibleTargetType = (targetType: string) => MINI_LEAGUES_ENABLED || targetType !== "mini_league";
