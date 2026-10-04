/**
 * Backend client.
 *
 * Two endpoints (`/api/scan`, `/api/verify`) plus a health probe. When no
 * `NEXT_PUBLIC_API_URL` is configured - or `?mock=...` is in the URL - the calls
 * resolve from `lib/mocks.ts` instead of the network, so the whole flow can be
 * demoed offline.
 */

import {
  asMockKey,
  isMockMode,
  mockScan,
  mockVerify,
  type MockKey,
} from "./mocks";
import type {
  Party,
  ProductFieldKey,
  ScanResponse,
  VerifyBody,
  VerifyResponse,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Resolve the fixture key to use, or `null` when the real API should be called. */
function resolveMock(mock?: string | null): MockKey | null {
  const fromUrl = asMockKey(mock);
  if (fromUrl) return fromUrl;
  if (isMockMode()) return "genuine";
  return null;
}

async function readJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`${what} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/** `GET /api/health`. */
export async function health(): Promise<{ status: string; app: string }> {
  const res = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
  return readJson<{ status: string; app: string }>(res, "health");
}

/** `POST /api/scan` (multipart). Returns the OCR fields - empty until OCR lands. */
export async function scanLabel(
  file: File,
  mock?: string | null,
): Promise<ScanResponse> {
  const key = resolveMock(mock);
  if (key) return mockScan(key);

  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/scan`, {
    method: "POST",
    body: form,
  });
  return readJson<ScanResponse>(res, "scan");
}

/** `POST /api/verify`. Always sends the full confirmed field set. */
export async function verifyItem(
  body: VerifyBody,
  mock?: string | null,
): Promise<VerifyResponse> {
  const key = resolveMock(mock);
  if (key) return mockVerify(key);

  const res = await fetch(`${API_BASE}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<VerifyResponse>(res, "verify");
}

// --- Field mapping -----------------------------------------------------------

/** Product fields -> the `/api/verify` body keys. */
const PRODUCT_TO_BODY: Partial<Record<ProductFieldKey, keyof VerifyBody>> = {
  mrp: "mrp",
  net_quantity: "net_qty",
  customer_care: "customer_care",
  mfg_date: "mfg_date",
  expiry_or_best_before: "expiry",
  bis_cml: "bis_licence",
  // `is_number` (e.g. "IS 1479") has no counterpart in the verify body yet, so it
  // is deliberately not mapped rather than being forced into another field.
};

/** Pick the party whose fields describe the maker. */
function makerParty(parties: Party[]): Party | null {
  if (parties.length === 0) return null;
  return parties.find((p) => p.role === "manufacturer") ?? parties[0];
}

/**
 * Build the `/api/verify` body from what the user confirmed on the review screen.
 *
 * - `scan_id` is forwarded so the backend can echo it back (the scan and the
 *   verify stay correlated).
 * - Every product field that has a contract field is forwarded, including MRP,
 *   net quantity, manufacturing date and expiry.
 * - The maker's party supplies name, address, pincode, FSSAI, CIN and GSTIN.
 *   Licences the user never attached to a party are left out: guessing which
 *   party a licence belongs to would invent an association the label does not
 *   state.
 */
export function toVerifyBody(
  scan: ScanResponse | null,
  parties: Party[],
): VerifyBody {
  const body: VerifyBody = { scan_id: scan?.scan_id ?? null };

  const product = scan?.fields.product ?? {};
  for (const [key, target] of Object.entries(PRODUCT_TO_BODY) as [
    ProductFieldKey,
    keyof VerifyBody,
  ][]) {
    const value = product[key]?.value ?? null;
    if (value !== null) body[target] = value;
  }

  const maker = makerParty(parties);
  if (maker) {
    body.manufacturer = maker.name.value;
    body.address = maker.address.value;
    body.pincode = maker.pincode.value;
    body.fssai = maker.fssai.value;
    body.cin = maker.cin.value;
    body.gstin = maker.gstin.value;
  }

  return body;
}
