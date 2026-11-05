import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ipo-singh/design-tokens", "@ipo-singh/contracts", "@ipo-singh/core"],
  // Engineering rules stay in the repository-root AGENTS.md.
  // These flags stop `next dev` from writing or restoring agent files.
  agentRules: false,
  experimental: {
    agentFeedback: false,
    optimizePackageImports: ["recharts"],
  },
  cacheComponents: true,
  /**
   * Next.js public-page cache profiles (seconds).
   * These bound website reuse only. Redis/API TTLs remain the system of record for upstream data.
   * Max Next staleness ≈ expire; Mongo/Redis updates become visible after the next revalidate window.
   */
  cacheLife: {
    ipoListings: {
      stale: 30,
      revalidate: 60,
      expire: 300,
    },
    ipoIssue: {
      stale: 30,
      revalidate: 60,
      expire: 300,
    },
    ipoHistory: {
      stale: 60,
      revalidate: 120,
      expire: 600,
    },
    ipoCalendar: {
      stale: 30,
      revalidate: 60,
      expire: 300,
    },
    ipoPromotions: {
      stale: 30,
      revalidate: 60,
      expire: 300,
    },
  },
  partialPrefetching: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/ipos",
        destination: "/ipos/mainboard",
        permanent: true,
      },
      {
        source: "/calendar",
        destination: "/ipo-calendar",
        permanent: true,
      },
    ];
  },
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
