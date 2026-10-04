/**
 * Run `next build` with a capped V8 heap.
 *
 * Not an arbitrary tuning knob: on a machine whose Windows commit limit is
 * nearly exhausted, V8 fails with "Zone Allocation failed - process out of
 * memory" while its heap is still only ~250 MB, because the *OS* refuses the
 * reservation. Raising the limit makes it worse - V8 reserves more up front.
 * Capping it keeps the build inside the available commit headroom, and 1 GB is
 * comfortably more than this app's module graph needs.
 *
 * Set as an env var here rather than in the npm script, because `VAR=x cmd`
 * and `set VAR=x && cmd` are not the same shell syntax and only one of them
 * works on Windows.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const HEAP_MB = process.env.BUILD_HEAP_MB ?? "1024";
const existing = process.env.NODE_OPTIONS ?? "";

// Resolve Next's CLI entry and run it with this same Node binary. Spawning
// `npx.cmd` instead fails with EINVAL on Windows under Node >= 20, which blocks
// `.cmd` shims unless a shell is involved - and a shell brings its own quoting
// problems. Resolving the script sidesteps both.
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: `${existing} --max-old-space-size=${HEAP_MB}`.trim(),
  },
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
