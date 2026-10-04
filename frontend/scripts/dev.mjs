/**
 * Run `next dev` bound to all interfaces, with a capped V8 heap.
 *
 * Same reason as `scripts/build.mjs`: when Windows is close to its commit
 * limit, V8 aborts during start-up with an allocation failure while its heap is
 * only tens of megabytes, because the reservation - not the usage - is what
 * fails. Capping the heap keeps the dev server inside the available headroom.
 *
 * `-H 0.0.0.0` is what lets a phone on the same Wi-Fi open the dev server; the
 * backend's CORS rules already allow private-network origins.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const HEAP_MB = process.env.DEV_HEAP_MB ?? "1024";
const PORT = process.env.WEB_PORT ?? "3000";
const existing = process.env.NODE_OPTIONS ?? "";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(
  process.execPath,
  [nextBin, "dev", "-H", "0.0.0.0", "-p", PORT],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: `${existing} --max-old-space-size=${HEAP_MB}`.trim(),
    },
  },
);

child.on("exit", (code, signal) => {
  // Ctrl-C and concurrently's shutdown arrive as SIGINT/SIGTERM and are clean.
  // Any other signal killed the server - report that as a failure rather than
  // letting it look like a tidy exit, which hides crashes behind "exited with 0".
  const clean = signal === "SIGINT" || signal === "SIGTERM";
  process.exit(signal ? (clean ? 0 : 1) : (code ?? 0));
});
