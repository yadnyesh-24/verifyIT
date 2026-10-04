/**
 * Types the screens work with.
 *
 * Two layers meet here. Everything re-exported from `./contract` is the real
 * wire format and must not drift from `backend/main.py`. Everything declared
 * below - `Party`, `ProductFields`, `LabelDraft` - is a *client-side* model: the
 * API accepts one flat set of fields, but a real Indian pack often names a
 * marketer, a manufacturer and two units, and the review screen has to let the
 * user say so. `toVerifyBody` in `./api` collapses the draft back down to the
 * flat body the backend understands.
 */
export type {
  Check,
  CheckId,
  CheckStatus,
  Flag,
  Health,
  LabelFieldName,
  OfficialLink,
  ScanField,
  ScanResponse,
  Severity,
  Verdict,
  VerifyRequest,
  VerifyResponse,
} from "./contract";

export {
  CHECK_IDS,
  CHECK_STATUSES,
  LABEL_FIELD_NAMES,
  SEVERITIES,
  VERDICTS,
  emptyVerifyRequest,
  findCheck,
  parseScanResponse,
  parseVerifyResponse,
  scoreIsPending,
} from "./contract";

import type { ScanField } from "./contract";

export type Lang = "en" | "hi";

/** How the app decides between the live API and bundled fixtures. */
export type DataMode = "auto" | "live" | "mock";

/**
 * The roles a pack can name. Only `manufacturer` maps onto the backend's
 * `manufacturer` field; the others exist so the user can describe the pack
 * accurately, and so a licence can be attached to the party that owns it.
 */
export const PARTY_ROLES = [
  "manufacturer",
  "marketer",
  "packer",
  "importer",
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

/** Party fields the user can edit. `unit_code` never leaves the client. */
export const PARTY_FIELDS = [
  "unit_code",
  "name",
  "address",
  "pincode",
  "fssai",
  "cin",
  "gstin",
] as const;
export type PartyFieldKey = (typeof PARTY_FIELDS)[number];

export interface Party {
  /** Stable key for React lists and for assigning licences. Client-only. */
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

/**
 * Product-level fields, named exactly as the backend names them.
 *
 * Matching the wire names here means `toVerifyBody` copies them across without
 * a translation table - one less place for a silent rename to lose a value.
 */
export const PRODUCT_FIELDS = [
  "product_name",
  "mrp",
  "net_qty",
  "mfg_date",
  "expiry",
  "customer_care",
  "bis_licence",
] as const;
export type ProductFieldKey = (typeof PRODUCT_FIELDS)[number];

export type ProductFields = Record<ProductFieldKey, ScanField>;

/**
 * A licence read off the label that could not be tied to a party.
 *
 * Packs routinely print a licence number with no adjacent address, so the
 * review screen asks the user which party it belongs to rather than guessing.
 */
export interface UnassignedLicence {
  kind: "fssai" | "bis" | "unknown";
  field: ScanField;
}

/** Everything the review screen edits, and the scan it came from. */
export interface LabelDraft {
  scan_id: string | null;
  product: ProductFields;
  parties: Party[];
  unassigned_licences: UnassignedLicence[];
}

/** A field with no reading behind it - the user has not been shown anything. */
export function blankField(): ScanField {
  return { value: null, confidence: null, uncertain: false, source: null };
}

/** A field the user typed or confirmed themselves: certain, and never flagged. */
export function userField(value: string | null): ScanField {
  return { value, confidence: 1, uncertain: false, source: "user" };
}

export function blankProductFields(): ProductFields {
  return PRODUCT_FIELDS.reduce((acc, key) => {
    acc[key] = blankField();
    return acc;
  }, {} as ProductFields);
}
