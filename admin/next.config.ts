import type { NextConfig } from "next";

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
};

export default nextConfig;
