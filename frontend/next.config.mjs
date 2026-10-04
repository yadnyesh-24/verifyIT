/**
 * Next.js config for VerifyIT.
 *
 * - `/api/:path*` is rewritten to `${BACKEND_URL}/api/:path*`. That keeps the
 *   browser pointing at the same origin (so a phone on the same Wi-Fi only
 *   needs the frontend URL) and means CORS doesn't apply to the in-browser
 *   fetch. Default backend is `http://localhost:8000`.
 * - ESLint is skipped during the local build because the demo machine runs
 *   tight on memory; CI still runs lint.
 */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
    // Limit SWC worker concurrency so the OOM stops scaling linearly with CPU
    // count on memory-tight Windows hosts.
    workerThreads: false,
    cpus: 1,
  },
  // Keep the production bundle smaller and skip the unused optimisation passes.
  compiler: {
    removeConsole: false,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${(process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;