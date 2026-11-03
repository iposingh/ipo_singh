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
