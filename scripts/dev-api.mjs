/**
 * Start the FastAPI backend with the repo's virtualenv.
 *
 * This exists so `npm run dev:all` is one command on every platform. The venv
 * interpreter sits at `Scripts/python.exe` on Windows and `bin/python`
 * elsewhere, and hard-coding either breaks the other - so the path is resolved
 * here instead of being baked into a shell string in `package.json`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const candidates =
  process.platform === "win32"
    ? [path.join(repoRoot, ".venv", "Scripts", "python.exe")]
    : [path.join(repoRoot, ".venv", "bin", "python")];

const python = candidates.find(existsSync);

if (!python) {
  console.error(
    [
      "No virtualenv found at .venv.",
      "",
      "Create it and install the backend dependencies:",
      process.platform === "win32"
        ? "  python -m venv .venv && .venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        : "  python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt",
    ].join("\n"),
  );
  process.exit(1);
}

const port = process.env.API_PORT ?? "8000";

// `--reload` runs a watcher process *and* a server process. That is what you
// want while editing the backend, and what you do not want on a machine with
// little memory headroom - so `API_RELOAD=0` drops to a single process.
const reload = process.env.API_RELOAD !== "0";

const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "backend.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    port,
    ...(reload ? ["--reload"] : []),
  ],
  { cwd: repoRoot, stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  // A signal kill (Ctrl-C through concurrently) is a normal shutdown, not a failure.
  process.exit(signal ? 0 : (code ?? 0));
});
