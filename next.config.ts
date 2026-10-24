import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Starts the local development MongoDB for SEO Studio (never used in
  // production); loaded from node_modules at runtime instead of being bundled.
  // The MongoDB driver itself is external by default.
  serverExternalPackages: ["mongodb-memory-server-core"],
  // …and is left out of deployed functions (it only runs when NODE_ENV is not production).
  outputFileTracingExcludes: {
    "/**": ["./node_modules/mongodb-memory-server-core/**/*"],
  },
  experimental: {
    // The public site and /admin use separate root layouts, so unmatched
    // URLs are served by app/global-not-found.tsx.
    globalNotFound: true,
  },
};

export default nextConfig;
