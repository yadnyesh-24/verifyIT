/**
 * Typed API client for VerifyIT.
 *
 * Two transports:
 *   - `liveTransport` -> POSTs to `/api/...`, which Next.js rewrites to the
 *     FastAPI backend (see `next.config.mjs`). This avoids CORS for the phone
 *     and keeps `BACKEND_URL` out of the browser bundle.
 *   - `mockTransport` -> returns the bundled fixtures in `lib/mocks.ts`.
 *
 * The `api.scan()` / `api.verify()` helpers pick the transport based on the
 * `data-mode` hook and translate between the richer frontend contract
 * (parties, product fields) and the backend's flat wire payload. Every
 * response is validated with zod; missing fields are filled in with safe
 * defaults and a `console.warn` is emitted so the mismatch is visible.
 */
"use client";

import { recordFallback } from "./data-mode";
import { compressImage } from "./compress-image";
import {
  ScanResponse,
  ScanResponseSchema,
  SCAN_FILE_FIELD,
  VerifyResponse,
  VerifyResponseSchema,
  toBackendPayload,
  type Party as PartyT,
  type BackendVerifyPayload,
  type ScanField,
} from "./contract";
import type { DataMode } from "./data-mode";
import { mockScan, mockVerify, type MockKey } from "./mocks";

/** Visual / logic error that screens can render. */
export type ApiError = {
  kind: "network" | "http" | "parse" | "validation" | "unreadable";
  message: string;
  status?: number;
};

/* -------------------------------------------------------------------------- */
/*  Transports                                                               */
/* -------------------------------------------------------------------------- */

/** Live transport - hits Next.js rewrites that proxy to the FastAPI backend. */
async function liveScan(file: File, mode: DataMode): Promise<ScanResponse> {
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append(SCAN_FILE_FIELD, compressed, compressed.name || "label.jpg");

  let res: Response;
  try {
    res = await fetch("/api/scan", { method: "POST", body: form });
  } catch (err) {
    recordFallback(err instanceof Error ? err.message : "network");
    throw { kind: "network", message: networkMessage() } satisfies ApiError;
  }
  if (!res.ok) {
    const message = await safeError(res);
    throw { kind: "http", status: res.status, message } satisfies ApiError;
  }
  return parseScan(await res.json(), mode);
}

async function liveVerify(
  payload: BackendVerifyPayload,
  mode: DataMode,
): Promise<VerifyResponse> {
  let res: Response;
  try {
    res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    recordFallback(err instanceof Error ? err.message : "network");
    throw { kind: "network", message: networkMessage() } satisfies ApiError;
  }
  if (!res.ok) {
    const message = await safeError(res);
    throw { kind: "http", status: res.status, message } satisfies ApiError;
  }
  return parseVerify(await res.json(), mode);
}

/** `GET /api/health` -> `{ ok, app }`. */
export async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                               */
/* -------------------------------------------------------------------------- */

function warnMismatch(label: string, detail: unknown): void {
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console -- diagnostics for the team
    console.warn(`[verifyit] response mismatch in ${label}:`, detail);
  }
}

function safeEmptyField(): ScanField {
  return { value: null, confidence: null, uncertain: false, source: null };
}

/** Parse + normalise a scan response. Tolerant of partial backend payloads. */
function parseScan(raw: unknown, mode: DataMode): ScanResponse {
  if (!raw || typeof raw !== "object") {
    warnMismatch("scan", raw);
    return {
      scan_id: null,
      status: "not_checked",
      reason: "Empty response",
      fields: { product: {}, parties: [], unassigned_licences: [] },
    };
  }
  const obj = raw as Record<string, unknown>;
  const result = ScanResponseSchema.safeParse(obj);
  if (!result.success) {
    warnMismatch("scan", result.error.flatten());
    return {
      scan_id: typeof obj.scan_id === "string" ? obj.scan_id : null,
      status: typeof obj.status === "string" ? obj.status : "not_checked",
      reason: typeof obj.reason === "string" ? obj.reason : null,
      fields: { product: {}, parties: [], unassigned_licences: [] },
    };
  }
  const parsed = result.data;
  if (mode === "live" && parsed.status === "not_checked" && !parsed.reason) {
    return { ...parsed, reason: "OCR pipeline not connected" };
  }
  return parsed;
}

function parseVerify(raw: unknown, _mode: DataMode): VerifyResponse {
  const result = VerifyResponseSchema.safeParse(raw);
  if (!result.success) {
    warnMismatch("verify", result.error.flatten());
    return {
      scan_id: null,
      checks: ["company", "licence", "label_law"].map((id) => ({
        id: id as "company" | "licence" | "label_law",
        status: "not_checked",
        flags: [],
      })),
      score: null,
      verdict: "not_checked",
      official_links: [],
    };
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                               */
/* -------------------------------------------------------------------------- */

/** Run `/api/scan` (or its mock equivalent) and return a rich ScanResponse. */
export async function scan(
  file: File,
  mode: DataMode,
  mockKey: MockKey | string | null,
): Promise<ScanResponse> {
  if (mode === "mock" || mockKey) {
    await sleep(900);
    return mockScan(mockKey);
  }
  return liveScan(file, mode);
}

/** Run `/api/verify` (or its mock equivalent). */
export async function verify(
  scan: ScanResponse,
  parties: PartyT[],
  mode: DataMode,
  mockKey: MockKey | string | null,
): Promise<VerifyResponse> {
  if (mode === "mock" || mockKey) {
    await sleep(700);
    return mockVerify(mockKey);
  }
  const payload = toBackendPayload(scan, parties);
  return liveVerify(payload, mode);
}

/* -------------------------------------------------------------------------- */
/*  Tiny utilities                                                           */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function networkMessage(): string {
  return "We could not reach VerifyIT.";
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    if (body?.detail) return body.detail;
  } catch {
    /* body was not JSON */
  }
  return `HTTP ${res.status}`;
}