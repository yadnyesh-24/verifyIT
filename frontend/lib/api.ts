/**
 * The only module that talks to the network.
 *
 * Every request goes to a **relative** `/api/...` URL. `next.config.mjs`
 * rewrites those to `BACKEND_URL`, which means the browser only ever sees its
 * own origin: no CORS preflight, no `NEXT_PUBLIC_API_URL` baked into the bundle,
 * and the same code works on localhost and over the LAN.
 *
 * Every response is validated against `lib/contract.ts` before a screen sees
 * it. A payload that does not match is logged and replaced with a safe value
 * rather than thrown, because a contract drift should degrade one card - not
 * blank the page.
 */
import {
  EMPTY_VERIFY,
  isMockKey,
  isMockMode,
  mockScan,
  mockVerify,
  type MockKey,
} from "./mocks";
import {
  HealthSchema,
  LABEL_FIELD_NAMES,
  emptyVerifyRequest,
  parseScanResponse,
  parseVerifyResponse,
  type Health,
  type ScanResponse,
  type VerifyRequest,
  type VerifyResponse,
} from "./contract";
import {
  PARTY_ROLES,
  PRODUCT_FIELDS,
  blankField,
  blankProductFields,
  type DataMode,
  type LabelDraft,
  type Party,
  type PartyFieldKey,
  type PartyRole,
  type ProductFieldKey,
  type ScanField,
  type UnassignedLicence,
} from "./types";

/** `/api/*` is rewritten to the backend; `/api/health/db` to its `/health`. */
const SCAN_URL = "/api/scan";
const VERIFY_URL = "/api/verify";
const HEALTH_URL = "/api/health/db";

/** Longest side, in pixels, that an uploaded photo is shrunk to before upload. */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/** How long the health probe may take before `auto` gives up and uses fixtures. */
const HEALTH_TIMEOUT_MS = 2000;

/** How long a scan may take before the user is offered a retry. */
export const SCAN_TIMEOUT_MS = 30_000;

export function dataMode(): DataMode {
  const raw = process.env.NEXT_PUBLIC_DATA_MODE;
  return raw === "live" || raw === "mock" ? raw : "auto";
}

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const { timeoutMs, ...rest } = init;
  const controller = new AbortController();
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
    return await res.json();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Ask the backend whether it - and its registry database - are up.
 *
 * Returns `null` when nothing answers, which is what `auto` mode reads as
 * "use fixtures". A reachable API whose database is down still returns a value
 * with `db: false`: the API is perfectly usable in that state, it just has
 * fewer checks it can run.
 */
export async function getHealth(): Promise<Health | null> {
  try {
    const data = await fetchJson(HEALTH_URL, {
      cache: "no-store",
      timeoutMs: HEALTH_TIMEOUT_MS,
    });
    const parsed = HealthSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether this session talks to the API or to fixtures.
 *
 * `live` and `mock` are absolute. `auto` probes once and falls back, so a demo
 * on a laptop with no backend running still works end to end - with the "Demo
 * data" pill visible, so nobody mistakes a fixture for a real verdict.
 */
export async function resolveLive(): Promise<boolean> {
  const mode = dataMode();
  if (mode === "mock") return false;
  if (mode === "live") return true;
  return (await getHealth()) !== null;
}

/**
 * Shrink a photo before upload: longest side `MAX_IMAGE_EDGE`, JPEG quality
 * `JPEG_QUALITY`.
 *
 * A modern phone camera produces 4-12 MB per shot, which is slow to upload on
 * mobile data and far more resolution than OCR needs. Any failure returns the
 * original file - a large upload is better than a lost one.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    return new File([blob], "label.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Upload a label photo. The multipart field name is `file`, as the API expects. */
export async function scanLabel(
  file: File,
  mock?: string | null,
): Promise<ScanResponse> {
  if (isMockKey(mock)) return mockScan(mock);
  if (isMockMode()) return mockScan("genuine");

  const compressed = await compressImage(file);
  const form = new FormData();
  form.append("file", compressed, compressed.name);

  const data = await fetchJson(SCAN_URL, {
    method: "POST",
    body: form,
    timeoutMs: SCAN_TIMEOUT_MS,
  });
  return (
    parseScanResponse(data) ?? {
      scan_id: null,
      status: "not_checked",
      reason: "",
      fields: {},
    }
  );
}

/** Send the confirmed fields and get the checks back. */
export async function verifyItem(
  body: VerifyRequest,
  mock?: string | null,
): Promise<VerifyResponse> {
  if (isMockKey(mock)) return mockVerify(mock);
  if (isMockMode()) return mockVerify("genuine");

  const data = await fetchJson(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: SCAN_TIMEOUT_MS,
  });
  return parseVerifyResponse(data) ?? { ...EMPTY_VERIFY, scan_id: body.scan_id };
}

// --- Draft <-> wire -------------------------------------------------------

let partySeq = 0;

export function makeBlankParty(role: PartyRole = "manufacturer"): Party {
  partySeq += 1;
  return {
    id: `party-${partySeq}`,
    role,
    unit_code: blankField(),
    name: blankField(),
    address: blankField(),
    pincode: blankField(),
    fssai: blankField(),
    cin: blankField(),
    gstin: blankField(),
  };
}

export function emptyDraft(scanId: string | null = null): LabelDraft {
  return {
    scan_id: scanId,
    product: blankProductFields(),
    parties: [],
    unassigned_licences: [],
  };
}

/** `party.2.fssai` -> index 2, field `fssai`. */
const PARTY_KEY = /^party\.(\d+)\.(\w+)$/;
const UNASSIGNED_KEY = /^unassigned_licence\.(\d+)$/;

/**
 * Flat company fields, as `POST /api/scan` returns them today, mapped onto the
 * party they describe.
 *
 * The OCR pipeline reads one maker per label and reports it with the same flat
 * names `/api/verify` accepts (`manufacturer`, `address`, ...). Those belong to
 * a party in this UI's model, so they are folded into the first one. Without
 * this the six keys below parsed cleanly and were then dropped on the floor -
 * the product card filled in and the company card stayed empty.
 */
const FLAT_PARTY_FIELDS: Record<string, PartyFieldKey> = {
  manufacturer: "name",
  address: "address",
  pincode: "pincode",
  fssai: "fssai",
  cin: "cin",
  gstin: "gstin",
};

function asRole(value: string | null): PartyRole {
  return (PARTY_ROLES as readonly string[]).includes(value ?? "")
    ? (value as PartyRole)
    : "manufacturer";
}

/**
 * Turn the API's flat `fields` map into the draft the review screen edits.
 *
 * Product keys are taken at face value. `party.<n>.<field>` keys are grouped
 * into parties, and `unassigned_licence.<n>` keys become licences the user is
 * asked to place. Any key the UI does not recognise is ignored rather than
 * guessed at - inventing a field is exactly what this product must not do.
 */
export function draftFromScan(scan: ScanResponse): LabelDraft {
  const draft = emptyDraft(scan.scan_id);
  const byIndex = new Map<number, Partial<Record<string, ScanField>>>();
  const licences: Array<{ index: number; field: ScanField }> = [];
  const flatParty: Partial<Record<PartyFieldKey, ScanField>> = {};

  for (const [key, field] of Object.entries(scan.fields)) {
    if ((PRODUCT_FIELDS as readonly string[]).includes(key)) {
      draft.product[key as ProductFieldKey] = field;
      continue;
    }
    const flat = FLAT_PARTY_FIELDS[key];
    if (flat) {
      flatParty[flat] = field;
      continue;
    }
    const party = PARTY_KEY.exec(key);
    if (party) {
      const index = Number(party[1]);
      const group = byIndex.get(index) ?? {};
      group[party[2]] = field;
      byIndex.set(index, group);
      continue;
    }
    const licence = UNASSIGNED_KEY.exec(key);
    if (licence) licences.push({ index: Number(licence[1]), field });
  }

  draft.parties = [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => {
      const party = makeBlankParty(asRole(group.role?.value ?? null));
      for (const name of ["unit_code", "name", "address", "pincode", "fssai", "cin", "gstin"] as const) {
        if (group[name]) party[name] = group[name] as ScanField;
      }
      return party;
    });

  // The flat reading describes the manufacturer. It seeds a new party when the
  // scan listed none, and otherwise fills only the gaps in the first one - an
  // indexed `party.0.*` key is the more specific statement and must win.
  const flatEntries = Object.entries(flatParty) as [PartyFieldKey, ScanField][];
  if (flatEntries.length > 0) {
    if (draft.parties.length === 0) draft.parties = [makeBlankParty("manufacturer")];
    const target = primaryParty(draft.parties);
    if (target) {
      for (const [key, field] of flatEntries) {
        if (!target[key].value) target[key] = field;
      }
    }
  }

  draft.unassigned_licences = licences
    .sort((a, b) => a.index - b.index)
    .map(({ field }): UnassignedLicence => ({
      // 14 digits is the FSSAI format; anything else we decline to label.
      kind: /^\d{14}$/.test(field.value ?? "") ? "fssai" : "unknown",
      field,
    }));

  return draft;
}

/** The party whose details the backend's flat `manufacturer`/`cin` fields describe. */
export function primaryParty(parties: Party[]): Party | undefined {
  return parties.find((p) => p.role === "manufacturer") ?? parties[0];
}

/**
 * Collapse the draft into the flat body `POST /api/verify` accepts.
 *
 * Two deliberate choices:
 *
 * - **Every field is sent, `null` included.** The backend forwards all 14 to the
 *   label-law checker because "the pack does not print an MRP" is a Legal
 *   Metrology violation while "the user left the box empty" is not, and only the
 *   caller can tell them apart.
 * - **One party is chosen, not merged.** The API models a single maker, so
 *   sending the manufacturer's name against another party's CIN would
 *   manufacture a mismatch the pack never had. The primary party supplies all of
 *   name, address, pincode, CIN and GSTIN together, or none of them.
 */
export function toVerifyBody(draft: LabelDraft): VerifyRequest {
  const body = emptyVerifyRequest();
  body.scan_id = draft.scan_id;

  for (const key of PRODUCT_FIELDS) {
    if ((LABEL_FIELD_NAMES as readonly string[]).includes(key)) {
      body[key as (typeof LABEL_FIELD_NAMES)[number]] = draft.product[key].value;
    }
  }

  const primary = primaryParty(draft.parties);
  if (primary) {
    body.manufacturer = primary.name.value;
    body.address = primary.address.value;
    body.pincode = primary.pincode.value;
    body.cin = primary.cin.value;
    body.gstin = primary.gstin.value;
    body.fssai = primary.fssai.value;
  }

  // A licence the user never placed is still printed on the pack, so it is worth
  // checking the format of - but only when the chosen party has none of its own,
  // so it can never silently override something the user confirmed.
  if (!body.fssai) {
    const spare = draft.unassigned_licences.find((l) => l.kind === "fssai");
    if (spare) body.fssai = spare.field.value;
  }

  return body;
}
