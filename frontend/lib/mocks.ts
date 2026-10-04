/**
 * Demo fixtures + mock-mode detection.
 *
 * Mock mode is what lets the app be demoed with no backend and no OCR pipeline:
 * every page honours `?mock=genuine|multi|fake`, and the app also falls back to
 * mocks when `NEXT_PUBLIC_API_URL` is unset (`NEXT_PUBLIC_USE_MOCK=true` forces
 * it). The home page prints a banner whenever mock mode is active, so a demo
 * audience is never told that fixture data came from a government register.
 *
 * **Honesty rules for these fixtures:**
 *
 * - Every `checks[].status` here is something the real backend can return today:
 *   `pass` only on the company check (an exact CIN with an Active MCA status),
 *   `warn` only with a flag code that exists, `not_checked` everywhere the
 *   registry is not connected. No `licence: "pass"` - the FSSAI/BIS registries
 *   are not connected, so that state cannot occur and a green licence badge would
 *   misrepresent what the system can do.
 * - `score` / `checks_ran` / `verdict` follow the real formula
 *   (`API_CONTRACT.md` -> "The trust score"): weights 40/35/25, warn credits
 *   0.8/0.5/0.0, bands 75/40, and the verdict is the worse of the score band and
 *   the worst flag severity. A mock can therefore never show a score the backend
 *   would not produce.
 * - The OCR'd `fields` are illustrative: the OCR pipeline is not connected, so
 *   the real `/api/scan` returns `fields: {}`. They exist only so the review
 *   screen can be built and demoed, and only ever behind the demo banner.
 */

import type {
  FieldSource,
  Flag,
  OfficialLink,
  Party,
  PartyRole,
  ScanField,
  ScanResponse,
  VerifyResponse,
} from "./types";

export const mockKeys = ["genuine", "multi", "fake"] as const;
export type MockKey = (typeof mockKeys)[number];

/** True when the app should serve bundled fixtures instead of calling the API. */
export function isMockMode(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return true;
  return !process.env.NEXT_PUBLIC_API_URL;
}

/** Narrow an arbitrary `?mock=` value to a known fixture key. */
export function asMockKey(value: string | null | undefined): MockKey | null {
  return value && (mockKeys as readonly string[]).includes(value)
    ? (value as MockKey)
    : null;
}

// --- Fixture builders --------------------------------------------------------

function field(
  value: string | null,
  options: {
    uncertain?: boolean;
    confidence?: number;
    source?: FieldSource;
  } = {},
): ScanField {
  const { uncertain = false, confidence = 0.92, source = "ocr" } = options;
  return {
    value,
    confidence: value === null ? null : confidence,
    uncertain,
    source,
  };
}

function party(
  role: PartyRole,
  values: Partial<Record<keyof Omit<Party, "id" | "role">, ScanField>>,
): Party {
  return {
    id: `${role}-1`,
    role,
    unit_code: field(null),
    name: field(null),
    address: field(null),
    pincode: field(null),
    fssai: field(null),
    cin: field(null),
    gstin: field(null),
    ...values,
  };
}

function flag(
  code: string,
  severity: Flag["severity"],
  en: string,
  hi: string,
  evidence: Record<string, unknown> | null = null,
): Flag {
  return { code, severity, en, hi, evidence };
}

const FSSAI_LINK: OfficialLink = {
  label: "Verify FSSAI licence",
  url: "https://foscos.fssai.gov.in/",
  copy: "10012022000123",
};

const MCA_LINK: OfficialLink = {
  label: "Verify company on MCA",
  url: "https://www.mca.gov.in/",
  copy: "U15100MH2009PTC123456",
};

const SAMPLE_REASON =
  "OCR pipeline not connected - sample fields for the review screen";

// --- POST /api/scan fixtures -------------------------------------------------

const SCAN_FIXTURES: Record<MockKey, ScanResponse> = {
  genuine: {
    scan_id: "scan_demo_genuine",
    status: "not_checked",
    reason: SAMPLE_REASON,
    fields: {
      product: {
        mrp: field("₹50.00"),
        net_quantity: field("70 g"),
        customer_care: field("1800-000-0000", { uncertain: true }),
        mfg_date: field("2026-01-01"),
        expiry_or_best_before: field("12 months from packing"),
      },
      parties: [
        party("manufacturer", {
          name: field("EXAMPLE FOODS PRIVATE LIMITED"),
          address: field("12 Example Road, Andheri East, Mumbai"),
          pincode: field("400093"),
          fssai: field("10012022000123", { uncertain: true }),
          cin: field("U15100MH2009PTC123456"),
        }),
      ],
      unassigned_licences: [],
    },
  },
  multi: {
    scan_id: "scan_demo_multi",
    status: "not_checked",
    reason: SAMPLE_REASON,
    fields: {
      product: {
        mrp: field("₹20.00"),
        net_quantity: field("200 g", { uncertain: true }),
        customer_care: field("1800-111-2222"),
      },
      parties: [
        party("marketer", {
          name: field("EXAMPLE MARKETING LLP"),
          address: field("5 Example Street, Delhi"),
          pincode: field("110001"),
        }),
        party("manufacturer", {
          name: field("EXAMPLE FOODS PVT LTD"),
          address: field("Plot 8, Industrial Area, Pune"),
          pincode: field("411001"),
          fssai: field("123", { uncertain: true, confidence: 0.61 }),
        }),
        party("packer", {
          name: field("EXAMPLE PACKAGING"),
          address: field("Unit 3, Nashik"),
          pincode: field("422001"),
        }),
      ],
      unassigned_licences: [field("10012022000999", { uncertain: true })],
    },
  },
  fake: {
    scan_id: "scan_demo_fake",
    status: "not_checked",
    reason: SAMPLE_REASON,
    fields: {
      product: {
        mrp: field("₹99.00"),
        net_quantity: field(null, { uncertain: true }),
      },
      parties: [
        party("manufacturer", {
          name: field("UNKNOWN TRADERS"),
          fssai: field("12", { uncertain: true, confidence: 0.4 }),
          cin: field("U15100MH2009PTC999999", {
            uncertain: true,
            confidence: 0.5,
          }),
        }),
      ],
      unassigned_licences: [],
    },
  },
};

export function mockScan(key: MockKey): ScanResponse {
  return structuredClone(SCAN_FIXTURES[key]);
}

// --- POST /api/verify fixtures ----------------------------------------------
//
// Score arithmetic, from the contract's formula:
//
//   genuine  company pass          -> 40 / 40                = 100, 1 check, low_risk
//   multi    company warn (low)    -> 32        (40 * 0.8)
//            licence warn (medium) -> 17.5      (35 * 0.5)
//                                    49.5 / 75   = 66, 2 checks, medium_risk
//   fake     company warn (high)   -> 0         (40 * 0.0)
//            licence warn (medium) -> 17.5      (35 * 0.5)
//                                    17.5 / 75   = 23, 2 checks, high_risk
//                                     (the high-severity flag keeps it high_risk)

const FSSAI_FORMAT_FLAG = (seen: string): Flag =>
  flag(
    "FSSAI_FORMAT_INVALID",
    "medium",
    "The FSSAI number is not 14 digits - it may be misread or misprinted.",
    "FSSAI नंबर 14 अंकों का नहीं है - यह गलत पढ़ा या गलत छपा हो सकता है।",
    { fssai: seen },
  );

const VERIFY_FIXTURES: Record<MockKey, VerifyResponse> = {
  genuine: {
    scan_id: "scan_demo_genuine",
    checks: [
      { id: "company", status: "pass", flags: [] },
      { id: "licence", status: "not_checked", flags: [] },
      { id: "label_law", status: "not_checked", flags: [] },
    ],
    score: 100,
    checks_ran: 1,
    verdict: "low_risk",
    official_links: [FSSAI_LINK, MCA_LINK],
  },
  multi: {
    scan_id: "scan_demo_multi",
    checks: [
      {
        id: "company",
        status: "warn",
        flags: [
          flag(
            "MCA_NAME_ONLY_MATCH",
            "low",
            "The manufacturer name was found in the MCA register by name only - confirm the CIN to be sure it is the same company.",
            "निर्माता का नाम MCA रजिस्टर में केवल नाम के आधार पर मिला है - एक ही कंपनी होने की पुष्टि के लिए CIN जाँचें।",
            {
              manufacturer: "EXAMPLE FOODS PRIVATE LIMITED",
              cin: "U15100MH2009PTC123456",
              status: "Active",
              similarity: 1.0,
              matched_on: "name",
            },
          ),
        ],
      },
      { id: "licence", status: "warn", flags: [FSSAI_FORMAT_FLAG("123")] },
      { id: "label_law", status: "not_checked", flags: [] },
    ],
    score: 66,
    checks_ran: 2,
    verdict: "medium_risk",
    official_links: [FSSAI_LINK, MCA_LINK],
  },
  fake: {
    scan_id: "scan_demo_fake",
    checks: [
      {
        id: "company",
        status: "warn",
        flags: [
          flag(
            "MCA_COMPANY_NOT_ACTIVE",
            "high",
            "MCA records show this company as 'Strike Off', not Active - treat the maker's claim on this label with caution.",
            "MCA रिकॉर्ड में यह कंपनी 'Strike Off' दर्ज है, Active नहीं - लेबल पर दिए निर्माता के दावे को सावधानी से लें।",
            {
              cin: "U15100MH2009PTC999999",
              name: "UNKNOWN TRADERS",
              status: "Strike Off",
              matched_on: "cin",
            },
          ),
        ],
      },
      { id: "licence", status: "warn", flags: [FSSAI_FORMAT_FLAG("12")] },
      { id: "label_law", status: "not_checked", flags: [] },
    ],
    score: 23,
    checks_ran: 2,
    verdict: "high_risk",
    official_links: [FSSAI_LINK],
  },
};

export function mockVerify(key: MockKey): VerifyResponse {
  return structuredClone(VERIFY_FIXTURES[key]);
}
