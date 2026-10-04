/**
 * The frontend never calls the backend by absolute URL. Every request goes to a
 * relative `/api/...` path and is rewritten here, so the browser only ever talks
 * to its own origin: no CORS preflight, no API host compiled into the bundle,
 * and opening the dev server from a phone on the LAN works unchanged.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint runs in CI; skip during local dev builds so the worker doesn't OOM
  // on machines with tight memory budgets.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
    // `next build` fans out one V8 worker per core and each one loads the full
    // module graph. On an 8 GB laptop that reliably exhausts memory before the
    // build finishes, so the page workers are capped to a single process. It
    // costs build time and buys a build that completes.
    cpus: 1,
    workerThreads: false,
  },
  async rewrites() {
    return [
      // The db-aware health check lives at the backend's root `/health`, not
      // under `/api`: `/api/health` is a frozen contract that returns
      // `{status, app}` and is asserted byte for byte by the backend tests.
      // This entry must stay above the catch-all, which would otherwise swallow it.
      { source: "/api/health/db", destination: `${BACKEND_URL}/health` },
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
    ];
  },
};

export default nextConfig;
