/**
 * Wire types. These mirror `API_CONTRACT.md` exactly - if the backend contract
 * changes, change these in the same commit.
 *
 * Reconstructed from how the app consumes them (the original module was not
 * committed); field names and shapes come from the frozen contract and the
 * `samples/` fixtures.
 */

export type Lang = "en" | "hi";

/** A party printed on the label. */
export type PartyRole = "manufacturer" | "marketer" | "packer" | "importer";

/**
 * Check status. `not_checked` means "the check could not run yet" - it is a
 * pending state, never a failure. `unknown` is accepted defensively so an
 * unexpected wire value degrades to the neutral pending pill.
 */
export type CheckStatus = "pass" | "warn" | "fail" | "not_checked" | "unknown";

/** Where a field value came from. `user` = edited on the review screen. */
export type FieldSource = "ocr" | "llm" | "both" | "user";

/** One read (or user-confirmed) label field. */
export interface ScanField {
  value: string | null;
  confidence: number | null;
  uncertain: boolean;
  source: FieldSource | null;
}

/** Product-level fields, read from the label. */
export type ProductFieldKey =
  | "mrp"
  | "net_quantity"
  | "customer_care"
  | "mfg_date"
  | "expiry_or_best_before"
  | "bis_cml"
  | "is_number";

/** One party on the label, with the fields that belong to it. */
export interface Party {
  id: string;
  role: PartyRole;
  unit_code: ScanField;
  name: ScanField;
  address: ScanField;
  pincode: ScanField;
  fssai: ScanField;
  cin: ScanField;
  gstin: ScanField;
}

/** The field groups `/api/scan` returns. */
export interface ScanFields {
  product: Partial<Record<ProductFieldKey, ScanField>>;
  /**
   * Parties the reader found on the label. Part of the frontend's own richer
   * shape for the OCR output - the review screen seeds its editable party list
   * from it. Absent (or empty) means the user starts from a blank party.
   */
  parties?: Party[];
  unassigned_licences: ScanField[];
}

/** `POST /api/scan` response. */
export interface ScanResponse {
  scan_id: string | null;
  status: CheckStatus;
  reason: string | null;
  fields: ScanFields;
}

/** A single issue raised by a check, in English and Hindi. */
export interface Flag {
  code: string;
  severity: "high" | "medium" | "low";
  en: string;
  hi: string;
  evidence: Record<string, unknown> | null;
}

/** One of the three checks: `company`, `licence`, `label_law`. */
export interface Check {
  id: "company" | "licence" | "label_law";
  status: CheckStatus;
  flags: Flag[];
}

/** A one-tap link to an official verification portal. */
export interface OfficialLink {
  label: string;
  url: string;
  copy: string;
}

/**
 * The verdict the backend derived from the checks that ran.
 *
 * The UI must use this value rather than re-deriving a verdict from `score` -
 * the backend applies the worst flag severity on top of the score bands, so
 * re-deriving in the client would disagree with the API.
 */
export type Verdict = "low_risk" | "medium_risk" | "high_risk" | "not_checked";

/** `POST /api/verify` response. */
export interface VerifyResponse {
  scan_id: string | null;
  checks: Check[];
  /**
   * Trust score 0-100, computed from the checks that actually ran, or `null`
   * when none could run. Always show it with `checks_ran`.
   */
  score: number | null;
  /** How many of the three checks fed `score` (0-3). */
  checks_ran: number;
  verdict: Verdict;
  official_links: OfficialLink[];
}

/** The JSON body `POST /api/verify` accepts. Every field is optional. */
export interface VerifyBody {
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
