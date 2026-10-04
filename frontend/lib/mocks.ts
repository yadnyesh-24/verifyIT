/**
 * Mock fixtures for the demo.
 *
 * Three realistic Indian product labels - one company (`genuine`), one
 * multi-party marketer + 2 units (`multi`), one with a missing CIN and an
 * invalid FSSAI (`fake`). Each fixture is a complete `ScanResponse` +
 * `VerifyResponse` pair so the UI exercises every branch without a real
 * backend.
 *
 * The fixtures live here so a teammate can tweak them without touching the
 * screens. Use the floating "Demo" menu on the home page (or `?demo=1`) to
 * pick one; the URL stays at `/`.
 */
import type {
  Party,
  ScanResponse,
  VerifyResponse,
} from "./contract";

export type MockKey = "genuine" | "multi" | "fake";

function F(
  value: string | null,
  confidence: number,
  uncertain = false,
  source: "ocr" | "llm" | "both" | "user" = "ocr",
) {
  return { value, confidence, uncertain, source };
}

function E(): {
  value: string | null;
  confidence: number | null;
  uncertain: boolean;
  source: "ocr" | "llm" | "both" | "user" | null;
} {
  return { value: null, confidence: null, uncertain: false, source: null };
}

/* -------------------------------------------------------------------------- */
/*  Genuine                                                                  */
/* -------------------------------------------------------------------------- */

const genuineParty: Party = {
  id: "p-genuine-1",
  role: "manufacturer",
  unit_code: F("MH-101", 0.94),
  name: F("Annapurna Foods Private Limited", 0.96),
  address: F("Plot 14, MIDC Industrial Area, Aurangabad, 431003", 0.92),
  pincode: F("431003", 0.97),
  fssai: F("10018012000121", 0.98),
  cin: F("U15100MH2009PTC123121", 0.85),
  gstin: F("27AAACA123789J001", 0.9),
};

const genuineScan: ScanResponse = {
  scan_id: "demo-genuine",
  status: "ok",
  reason: null,
  fields: {
    product: {
      mrp: F("₹ 45", 0.97),
      net_quantity: F("200 g", 0.95),
      customer_care: F("1800-103-1212", 0.93),
      mfg_date: F("MAR 2026", 0.86),
      expiry_or_best_before: F("AUG 2026", 0.84, true),
      bis_cml: E(),
      is_number: F("IS 1466:1999", 0.88),
    },
    parties: [genuineParty],
    unassigned_licences: [],
  },
};

const genuineVerify: VerifyResponse = {
  scan_id: "demo-genuine",
  checks: [
    { id: "company", status: "pass", flags: [] },
    { id: "licence", status: "pass", flags: [] },
    { id: "label_law", status: "pass", flags: [] },
  ],
  score: 92,
  verdict: "looks_genuine",
  score_basis: { done: 3, total: 3 },
  official_links: [
    {
      label: "Verify on MCA portal",
      url: "https://www.mca.gov.in/mcafoportal/company/LLPstatus.html",
      copy: "U15100MH2009PTC123121",
    },
    {
      label: "Verify FSSAI licence",
      url: "https://foscos.fssai.gov.in/",
      copy: "10018012000121",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Multi                                                                    */
/* -------------------------------------------------------------------------- */

const multiMarketer: Party = {
  id: "p-multi-marketer",
  role: "marketer",
  unit_code: F("DL-201", 0.92),
  name: F("Bharat Snacks Limited", 0.95),
  address: F("A-12, Connaught Place, New Delhi, 110001", 0.93),
  pincode: F("110001", 0.97),
  fssai: F("10019011000145", 0.96),
  cin: F("L15490DL2010PLC198112", 0.88),
  gstin: F("07AAACB9876B1Z5", 0.9),
};

const multiUnitA: Party = {
  id: "p-multi-unit-a",
  role: "manufacturer",
  unit_code: F("MH-301", 0.9),
  name: F("Bharat Snacks Limited - Unit I", 0.93),
  address: F("Plot 7, MIDC, Pune, 411019", 0.91),
  pincode: F("411019", 0.96),
  fssai: F("10018013000278", 0.94),
  cin: F("L15490DL2010PLC198112", 0.87),
  gstin: F("27AAACB9876B1Z5", 0.89),
};

const multiUnitB: Party = {
  id: "p-multi-unit-b",
  role: "manufacturer",
  unit_code: F("KA-302", 0.89),
  name: F("Bharat Snacks Limited - Unit II", 0.92),
  address: F("Survey 88, Bommasandra, Bengaluru, 560099", 0.9),
  pincode: F("560099", 0.95),
  fssai: F("10017014000311", 0.93),
  cin: F("L15490DL2010PLC198112", 0.86),
  gstin: F("29AAACB9876B1Z5", 0.88),
};

const multiScan: ScanResponse = {
  scan_id: "demo-multi",
  status: "ok",
  reason: null,
  fields: {
    product: {
      mrp: F("₹ 20", 0.97),
      net_quantity: F("100 g", 0.95),
      customer_care: F("care@bharatsnacks.in", 0.91),
      mfg_date: F("02/2026", 0.9),
      expiry_or_best_before: F("08/2026", 0.9),
      bis_cml: F("1001234", 0.84, true),
      is_number: E(),
    },
    parties: [multiMarketer, multiUnitA, multiUnitB],
    unassigned_licences: [F("10099999000999", 0.7, true)],
  },
};

const multiVerify: VerifyResponse = {
  scan_id: "demo-multi",
  checks: [
    {
      id: "company",
      status: "warn",
      flags: [
        {
          code: "MCA_NAME_ONLY_MATCH",
          severity: "low",
          en: "The marketer name was found in the MCA register, but the CIN on the pack could not be matched exactly. Confirm the CIN.",
          hi: "विपणनकर्ता का नाम MCA रजिस्टर में मिला, पर पैक पर दिया CIN ठीक से मैच नहीं हुआ। CIN की पुष्टि करें।",
          evidence: {
            party: 0,
            role: "marketer",
            matched_on: "name",
            similarity: 0.94,
            cin: "L15490DL2010PLC198112",
            name: "BHARAT SNACKS LIMITED",
            status: "Active",
          },
        },
      ],
    },
    {
      id: "licence",
      status: "warn",
      flags: [
        {
          code: "STATE_MISMATCH",
          severity: "medium",
          en: "Unit I is in Maharashtra but the marketer's address is in Delhi. Verify both licences belong to the same brand.",
          hi: "यूनिट I महाराष्ट्र में है, पर विपणनकर्ता का पता दिल्ली में है। दोनों लाइसेंस एक ही ब्रांड के हैं, पुष्टि करें।",
          evidence: { party: 1, role: "manufacturer" },
        },
      ],
    },
    { id: "label_law", status: "pass", flags: [] },
  ],
  score: 68,
  verdict: "check_carefully",
  score_basis: { done: 2, total: 3 },
  official_links: [
    {
      label: "Verify on MCA portal",
      url: "https://www.mca.gov.in/mcafoportal/company/LLPstatus.html",
      copy: "L15490DL2010PLC198112",
    },
    {
      label: "Verify FSSAI licence (marketer)",
      url: "https://foscos.fssai.gov.in/",
      copy: "10019011000145",
    },
    {
      label: "Verify FSSAI licence (unit II)",
      url: "https://foscos.fssai.gov.in/",
      copy: "10017014000311",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Fake                                                                     */
/* -------------------------------------------------------------------------- */

const fakeParty: Party = {
  id: "p-fake-1",
  role: "manufacturer",
  unit_code: E(),
  name: F("Unknown Trader", 0.7, true),
  address: F("Sarojini Nagar, New Delhi", 0.65, true),
  pincode: F("110023", 0.85),
  fssai: F("1234", 0.6, true),
  cin: E(),
  gstin: E(),
};

const fakeScan: ScanResponse = {
  scan_id: "demo-fake",
  status: "ok",
  reason: null,
  fields: {
    product: {
      mrp: F("₹ 199", 0.6, true),
      net_quantity: F("1 kg", 0.65, true),
      customer_care: E(),
      mfg_date: E(),
      expiry_or_best_before: E(),
      bis_cml: E(),
      is_number: E(),
    },
    parties: [fakeParty],
    unassigned_licences: [F("AB123", 0.5, true)],
  },
};

const fakeVerify: VerifyResponse = {
  scan_id: "demo-fake",
  checks: [
    { id: "company", status: "not_checked", flags: [] },
    {
      id: "licence",
      status: "warn",
      flags: [
        {
          code: "FSSAI_FORMAT_INVALID",
          severity: "medium",
          en: "The FSSAI number is not 14 digits - it may be misread or misprinted.",
          hi: "FSSAI नंबर 14 अंकों का नहीं है - यह गलत पढ़ा या गलत छपा हो सकता है।",
          evidence: { fssai: "1234" },
        },
      ],
    },
    {
      id: "label_law",
      status: "warn",
      flags: [
        {
          code: "MRP_UNCLEAR",
          severity: "low",
          en: "The MRP value was hard to read. Please double-check it against the pack.",
          hi: "MRP साफ़ नहीं पढ़ा गया। पैक से फिर जाँच लें।",
          evidence: { mrp: "₹ 199" },
        },
      ],
    },
  ],
  score: 32,
  verdict: "high_risk",
  score_basis: { done: 2, total: 3 },
  official_links: [
    {
      label: "Verify FSSAI licence",
      url: "https://foscos.fssai.gov.in/",
      copy: "1234",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Lookup                                                                   */
/* -------------------------------------------------------------------------- */

const pairs: Record<MockKey, { scan: ScanResponse; verify: VerifyResponse }> = {
  genuine: { scan: genuineScan, verify: genuineVerify },
  multi: { scan: multiScan, verify: multiVerify },
  fake: { scan: fakeScan, verify: fakeVerify },
};

/** Canned `ScanResponse` for the demo key (defaults to genuine). */
export function mockScan(key: MockKey | string | null | undefined): ScanResponse {
  const k = (key ?? "genuine") as MockKey;
  return pairs[k]?.scan ?? pairs.genuine.scan;
}

/** Canned `VerifyResponse` for the demo key (defaults to genuine). */
export function mockVerify(key: MockKey | string | null | undefined): VerifyResponse {
  const k = (key ?? "genuine") as MockKey;
  return pairs[k]?.verify ?? pairs.genuine.verify;
}

export const mockKeys: MockKey[] = ["genuine", "multi", "fake"];