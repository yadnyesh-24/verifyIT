/**
 * Data mode resolver.
 *
 * `DATA_MODE` env can be:
 *   - `live`  : always use the real backend (no mocks)
 *   - `mock`  : always use the bundled mock fixtures
 *   - `auto`  : ping `/api/health` once, then keep using the side that
 *               responds. If a later request fails we flip to mock and tell
 *               the user (toast + the "Demo data" header pill).
 *
 * All calls go through `/api/...` and hit the Next.js rewrites in
 * `next.config.mjs`, so the phone only needs the frontend origin.
 */
"use client";

import { useEffect, useState } from "react";

export type DataMode = "live" | "mock";

export interface ModeInfo {
  mode: DataMode;
  /** True once we've resolved the auto probe (always true for `live`/`mock`). */
  resolved: boolean;
  /** Last failure reason - shown in the toast when we fall back. */
  reason?: string;
}

const STORAGE_KEY = "verifyit:data-mode";

/** Read the explicit override from the env. */
export function configuredMode(): "live" | "mock" | "auto" {
  const raw = (process.env.NEXT_PUBLIC_DATA_MODE ?? "auto").toLowerCase().trim();
  if (raw === "live" || raw === "mock" || raw === "auto") return raw;
  return "auto";
}

/** Read the previously-resolved mode (or `undefined` if first visit). */
function readStored(): DataMode | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "live" || raw === "mock" ? raw : undefined;
}

function writeStored(mode: DataMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode - ignore */
  }
}

/**
 * Probe `/api/health` with a short timeout. Returns `true` when the backend
 * responds with a 2xx, `false` for network errors or non-2xx.
 */
async function probeBackend(timeoutMs = 2500): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/health", { signal: ctl.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hook that owns the data-mode decision for the lifetime of the page.
 *
 * - `live` / `mock` from env are returned immediately.
 * - `auto` probes the backend once; the resolved mode persists in localStorage
 *   so subsequent visits skip the probe.
 */
export function useDataMode(): ModeInfo {
  const configured = configuredMode();
  const stored = readStored();
  const initial: ModeInfo =
    configured === "live"
      ? { mode: "live", resolved: true }
      : configured === "mock"
        ? { mode: "mock", resolved: true }
        : stored
          ? { mode: stored, resolved: true }
          : { mode: "mock", resolved: false }; // default to mock until we know

  const [info, setInfo] = useState<ModeInfo>(initial);

  useEffect(() => {
    if (configured !== "auto") return;
    if (info.resolved) return;

    let cancelled = false;
    (async () => {
      const ok = await probeBackend();
      if (cancelled) return;
      const next: ModeInfo = { mode: ok ? "live" : "mock", resolved: true };
      writeStored(next.mode);
      setInfo(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we want to run once on mount
  }, []);

  return info;
}

/** Mark that we hit a runtime error and should fall back to mock. */
export function recordFallback(reason: string): void {
  writeStored("mock");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("verifyit:fallback", { detail: { reason } }));
  }
}

/** Subscribe to fallback events so the UI can show a toast. */
export function onFallback(handler: (reason: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const cb = (e: Event) => {
    const detail = (e as CustomEvent<{ reason: string }>).detail;
    handler(detail?.reason ?? "Backend unreachable");
  };
  window.addEventListener("verifyit:fallback", cb);
  return () => window.removeEventListener("verifyit:fallback", cb);
}

/** Force the mode back to live on the next probe (used after a manual retry). */
export function clearStoredMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}