import type { NextConfig } from "next";

// Mini Leagues are out of scope (see lib/features.ts); their routes redirect to the nearest screen.
const MINI_LEAGUES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MINI_LEAGUES === "true";

// cacheComponents / partialPrefetching are intentionally off: every admin screen
// reads from a client-side mock store, so there is nothing to prerender or cache.
const nextConfig: NextConfig = {
  // The dev badge sits on top of the bottom-left "Mock controls" button.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    if (MINI_LEAGUES_ENABLED) return [];
    return [
      { source: "/mini-leagues", destination: "/overview", permanent: false },
      { source: "/mini-leagues/:path*", destination: "/overview", permanent: false },
      { source: "/moderation/mini-leagues", destination: "/moderation/game-posts", permanent: false },
      { source: "/rankings/mini-league", destination: "/rankings/singles", permanent: false },
      { source: "/analytics/mini-league-activity", destination: "/analytics", permanent: false },
    ];
  },
};

export default nextConfig;
