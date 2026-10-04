/**
 * The wire contract, mirrored from `backend/main.py` and `API_CONTRACT.md`.
 *
 * Everything the backend actually sends is here, and nothing it does not send.
 * The frontend models a label as several *parties* (manufacturer, marketer,
 * packer, importer), but that is a client-side convenience only - the API takes
 * one flat set of fields and returns one flat result, so parties live in
 * `lib/types.ts` and are flattened by `toVerifyBody` before they ever hit the
 * network. Keeping them out of this file is what stops the UI from quietly
 * inventing a backend capability.
 *
 * Every response is parsed, never trusted: `parseVerifyResponse` and
 * `parseScanResponse` return a typed value or `null`, so a backend that drifts
 * degrades the screen instead of crashing it.
 */
import { z } from "zod";

/**
 * Statuses the UI knows how to render.
 *
 * The backend's type union also includes `"fail"`, which no check emits today
 * (`backend/providers.py` reserves it deliberately: absent evidence never
 * proves a label wrong). Anything outside this set - `"fail"`, or a status added
 * to the API before the UI learns about it - is folded into `not_checked` by
 * `CheckStatusSchema` below, because "we cannot render this" and "this has not
 * been checked" lead to the same honest message: Verification pending.
 */
export const CHECK_STATUSES = ["pass", "warn", "not_checked"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const VERDICTS = [
  "low_risk",
  "medium_risk",
  "high_risk",
  "not_checked",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The three checks, in the order the backend always returns them. */
export const CHECK_IDS = ["company", "licence", "label_law"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/**
 * Coerce an unknown status to something renderable.
 *
 * `catch` covers a value that is not even a string; the explicit transform
 * covers a string the UI has no badge for. Both land on `not_checked`.
 */
const CheckStatusSchema = z
  .string()
  .catch("not_checked")
  .transform((value): CheckStatus =>
    (CHECK_STATUSES as readonly string[]).includes(value)
      ? (value as CheckStatus)
      : "not_checked",
  );

const VerdictSchema = z
  .string()
  .catch("not_checked")
  .transform((value): Verdict =>
    (VERDICTS as readonly string[]).includes(value)
      ? (value as Verdict)
      : "not_checked",
  );

const SeveritySchema = z
  .string()
  .catch("medium")
  .transform((value): Severity =>
    (SEVERITIES as readonly string[]).includes(value)
      ? (value as Severity)
      : "medium",
  );

/** One field read off a label. `source` is "ocr", "llm" or "both" per the contract. */
export const ScanFieldSchema = z.object({
  value: z.string().nullable().catch(null),
  confidence: z.number().min(0).max(1).nullable().catch(null),
  uncertain: z.boolean().catch(false),
  source: z.string().nullable().catch(null),
});
export type ScanField = z.infer<typeof ScanFieldSchema>;

export const ScanResponseSchema = z.object({
  scan_id: z.string().nullable().catch(null),
  status: CheckStatusSchema,
  reason: z.string().catch(""),
  fields: z.record(z.string(), ScanFieldSchema).catch({}),
});
export type ScanResponse = z.infer<typeof ScanResponseSchema>;

export const FlagSchema = z.object({
  code: z.string(),
  severity: SeveritySchema,
  en: z.string().catch(""),
  hi: z.string().catch(""),
  // Free-form by design: each flag code carries its own evidence keys.
  evidence: z.record(z.string(), z.unknown()).nullable().catch(null),
});
export type Flag = z.infer<typeof FlagSchema>;

export const CheckSchema = z.object({
  id: z.string(),
  status: CheckStatusSchema,
  flags: z.array(FlagSchema).catch([]),
});
export type Check = z.infer<typeof CheckSchema>;

/**
 * A one-tap link to an official portal.
 *
 * The JSON key is `copy` (the backend aliases it off `copy_text` so it does not
 * shadow Pydantic's `BaseModel.copy`), so that is the key parsed here.
 */
export const OfficialLinkSchema = z.object({
  label: z.string().catch(""),
  url: z.string(),
  copy: z.string().catch(""),
});
export type OfficialLink = z.infer<typeof OfficialLinkSchema>;

export const VerifyResponseSchema = z.object({
  scan_id: z.string().nullable().catch(null),
  checks: z.array(CheckSchema).catch([]),
  /**
   * `null` means no check could run - a pending state. It must never be
   * rendered as 0; see `scoreIsPending`.
   */
  score: z.number().int().min(0).max(100).nullable().catch(null),
  /** How many of the three checks fed `score`. Always shown alongside it. */
  checks_ran: z.number().int().min(0).max(3).catch(0),
  verdict: VerdictSchema,
  official_links: z.array(OfficialLinkSchema).catch([]),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

/**
 * The 14 request fields, exactly as `backend/main.py` names them.
 *
 * `scan_id` is the scan-session id and is deliberately *not* a label field:
 * `LABEL_FIELD_NAMES` in the backend excludes it, and a test guards that.
 */
export const LABEL_FIELD_NAMES = [
  "manufacturer",
  "address",
  "pincode",
  "fssai",
  "bis_licence",
  "mrp",
  "net_qty",
  "mfg_date",
  "expiry",
  "customer_care",
  "cin",
  "gstin",
  "product_name",
] as const;
export type LabelFieldName = (typeof LABEL_FIELD_NAMES)[number];

export type VerifyRequest = { scan_id: string | null } & Record<
  LabelFieldName,
  string | null
>;

/** An empty request body with every field present and null. */
export function emptyVerifyRequest(): VerifyRequest {
  const body = { scan_id: null } as VerifyRequest;
  for (const name of LABEL_FIELD_NAMES) body[name] = null;
  return body;
}

/**
 * Parse an API payload, warning rather than throwing on a mismatch.
 *
 * Returning `null` lets every caller fall back to a safe render; the console
 * warning is what tells a developer the contract drifted.
 */
function parseOrWarn<T>(schema: z.ZodType<T>, data: unknown, what: string): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  console.warn(`[verifyit] ${what} did not match the contract`, result.error.issues);
  return null;
}

export function parseVerifyResponse(data: unknown): VerifyResponse | null {
  return parseOrWarn(VerifyResponseSchema, data, "POST /api/verify");
}

export function parseScanResponse(data: unknown): ScanResponse | null {
  return parseOrWarn(ScanResponseSchema, data, "POST /api/scan");
}

export const HealthSchema = z.object({
  status: z.string(),
  db: z.boolean().optional(),
});
export type Health = z.infer<typeof HealthSchema>;

/**
 * True when there is no score to show yet.
 *
 * The contract is explicit that `score: null` is pending, not zero, so this is
 * the single place the distinction is made - no screen re-derives it with a
 * falsy check, which would treat a real score of 0 as pending.
 */
export function scoreIsPending(score: number | null): score is null {
  return score === null;
}

/** Look one check up by id, tolerating a backend that sent fewer than three. */
export function findCheck(
  response: VerifyResponse,
  id: CheckId,
): Check | undefined {
  return response.checks.find((check) => check.id === id);
}
