import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Reuse pages you've already opened for a few minutes instead of asking the server again.
  // Saving anything refreshes them straight away.
  experimental: { staleTimes: { dynamic: 180, static: 300 } },
};

export default nextConfig;
