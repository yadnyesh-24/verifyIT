/**
 * Shared API contract for VerifyIT.
 *
 * These are the *frontend-facing* shapes - what the UI consumes from either
 * the real backend or the bundled mock fixtures. The real backend in
 * `backend/main.py` ships a thinner, flat shape; `lib/api.ts` translates it
 * into this richer contract so we can show parties / unassigned licences etc.
 *
 * Wire-level status values: "pass" | "warn" | "fail" | "not_checked".
 * `unknown` is accepted defensively and treated as `not_checked`.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  Field                                                                    */
/* -------------------------------------------------------------------------- */

export type Lang = "en" | "hi";

export type PartyRole = "manufacturer" | "marketer" | "packer" | "importer";

export const FieldSource = z.enum(["ocr", "llm", "both", "user"]);
export type FieldSourceT = z.infer<typeof FieldSource>;

export const FieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  uncertain: z.boolean(),
  source: FieldSource.nullable(),
});

/** Frontend-facing field object. Mirrors the wire format. */
export type ScanField = z.infer<typeof FieldSchema>;

/** Build an empty editable field for manual entry. */
export function emptyField(value: string | null = null): ScanField {
  return { value, confidence: 1, uncertain: false, source: "user" };
}

/* -------------------------------------------------------------------------- */
/*  Product + parties                                                        */
/* -------------------------------------------------------------------------- */

export const PRODUCT_FIELDS = [
  "mrp",
  "net_quantity",
  "customer_care",
  "mfg_date",
  "expiry_or_best_before",
  "bis_cml",
  "is_number",
] as const;

export type ProductFieldKey = (typeof PRODUCT_FIELDS)[number];

export const PartySchema = z.object({
  id: z.string(),
  role: z.enum(["manufacturer", "marketer", "packer", "importer"]),
  unit_code: FieldSchema,
  name: FieldSchema,
  address: FieldSchema,
  pincode: FieldSchema,
  fssai: FieldSchema,
  cin: FieldSchema,
  gstin: FieldSchema,
});

export type Party = z.infer<typeof PartySchema>;

export const ScanResponseSchema = z.object({
  scan_id: z.string().nullable(),
  status: z.string(),
  reason: z.string().nullable(),
  fields: z.object({
    product: z.record(z.string(), FieldSchema.nullable()),
    parties: z.array(PartySchema),
    unassigned_licences: z.array(FieldSchema),
  }),
});

export type ScanResponse = z.infer<typeof ScanResponseSchema>;

/** Wire-level status. */
export type CheckStatus = "pass" | "warn" | "fail" | "not_checked" | "unknown";

/** Normalised status the UI consumes. `unknown` collapses to `not_checked`. */
export function normaliseStatus(s: string | undefined | null): CheckStatus {
  if (s === "pass" || s === "warn" || s === "fail" || s === "not_checked") return s;
  return "not_checked";
}

/* -------------------------------------------------------------------------- */
/*  Verify                                                                   */
/* -------------------------------------------------------------------------- */

export const FlagSchema = z.object({
  code: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  en: z.string(),
  hi: z.string(),
  evidence: z.record(z.unknown()).nullable().optional(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const CheckSchema = z.object({
  id: z.enum(["company", "licence", "label_law"]),
  status: z.string(),
  flags: z.array(FlagSchema),
});
export type Check = z.infer<typeof CheckSchema>;

export const OfficialLinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  copy: z.string(),
});
export type OfficialLink = z.infer<typeof OfficialLinkSchema>;

export const VerdictSchema = z.enum([
  "looks_genuine",
  "check_carefully",
  "high_risk",
  "not_checked",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ScoreBasisSchema = z
  .object({ done: z.number(), total: z.number() })
  .nullable()
  .optional();
export type ScoreBasis = z.infer<typeof ScoreBasisSchema>;

export const VerifyResponseSchema = z.object({
  scan_id: z.string().nullable(),
  checks: z.array(CheckSchema),
  score: z.number().min(0).max(100).nullable(),
  verdict: z.string(),
  official_links: z.array(OfficialLinkSchema),
  score_basis: ScoreBasisSchema,
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

/* -------------------------------------------------------------------------- */
/*  Mapping helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Backend wire payload for `/api/verify`. Today this is the flat shape the
 *  FastAPI service accepts; the frontend owns the richer contract and
 *  translates at the wire.
 */
export interface BackendVerifyPayload {
  scan_id?: string | null;
  manufacturer?: string | null;
  address?: string | null;
  pincode?: string | null;
  fssai?: string | null;
  bis_licence?: string | null;
  mrp?: string | null;
  net_qty?: string | null;
  mfg_date?: string | null;
  expiry?: string | null;
  customer_care?: string | null;
  cin?: string | null;
  gstin?: string | null;
  product_name?: string | null;
}

/** Convert the editor state into the flat payload the live backend accepts. */
export function toBackendPayload(
  scan: ScanResponse,
  parties: Party[],
): BackendVerifyPayload {
  const product = scan.fields.product;
  const primary =
    parties.find((p) => p.role === "manufacturer" && (p.name.value || p.cin.value)) ??
    parties.find((p) => p.role === "marketer" && (p.name.value || p.cin.value)) ??
    parties[0];

  return {
    scan_id: scan.scan_id,
    product_name: null,
    mrp: product.mrp?.value ?? null,
    net_qty: product.net_quantity?.value ?? null,
    customer_care: product.customer_care?.value ?? null,
    mfg_date: product.mfg_date?.value ?? null,
    expiry: product.expiry_or_best_before?.value ?? null,
    bis_licence: product.bis_cml?.value ?? null,
    manufacturer: primary?.name.value ?? null,
    address: primary?.address.value ?? null,
    pincode: primary?.pincode.value ?? null,
    fssai: primary?.fssai.value ?? null,
    cin: primary?.cin.value ?? null,
    gstin: primary?.gstin.value ?? null,
  };
}

/** Field-validation rules. The backend's deterministic FSSAI check is the
 *  only real signal today; the UI runs the same check locally so the user
 *  sees an inline hint before submitting.
 */
export const ValidationRule = {
  fssai: /^\d{14}$/,
  pincode: /^\d{6}$/,
} as const;

export function validateField(
  key: ProductFieldKey | "fssai" | "pincode",
  value: string | null,
): boolean {
  if (value === null || value.length === 0) return true;
  if (key === "fssai") return ValidationRule.fssai.test(value);
  if (key === "pincode") return ValidationRule.pincode.test(value);
  return true;
}

/** Wire field name used in the multipart upload. Single source of truth. */
export const SCAN_FILE_FIELD = "image" as const;