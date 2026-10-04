/**
 * Bundled fixtures, so the whole interface can be built and demoed with no
 * backend running.
 *
 * The verify fixtures are hand-computed with the real scoring rules from
 * `API_CONTRACT.md` (weights company 40 / licence 35 / label_law 25; a `warn`
 * keeps its worst flag's credit - low 0.8, medium 0.5, high 0.0; `not_checked`
 * is excluded entirely). `scripts/smoke.mjs` replays the same inputs against
 * the live API, which is what stops these numbers from drifting into fiction.
 *
 * The scan fixtures use the same flat `fields` map the API will return once OCR
 * is connected, including the `party.<n>.<field>` key convention that
 * `draftFromScan` understands - so the mock path and the live path run through
 * exactly the same parsing code.
 */
import type { ScanResponse, VerifyResponse } from "./contract";

export const MOCK_KEYS = ["genuine", "multi", "fake"] as const;
export type MockKey = (typeof MOCK_KEYS)[number];

/** Kept as a mutable array: `Array.includes` on a readonly tuple needs a cast. */
export const mockKeys: MockKey[] = [...MOCK_KEYS];

export function isMockKey(value: string | null | undefined): value is MockKey {
  return value !== null && value !== undefined && mockKeys.includes(value as MockKey);
}

/**
 * True when the build is pinned to fixtures.
 *
 * `DATA_MODE=auto` (the default) is *not* mock mode: it probes `/health` at
 * runtime and only falls back to fixtures when nothing answers, which is
 * decided in `lib/api.ts` rather than here.
 */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_MODE === "mock";
}

function field(
  value: string | null,
  opts: { uncertain?: boolean; confidence?: number; source?: string } = {},
) {
  return {
    value,
    confidence: opts.confidence ?? (value === null ? null : 0.95),
    uncertain: opts.uncertain ?? false,
    source: opts.source ?? "ocr",
  };
}

const SCANS: Record<MockKey, ScanResponse> = {
  genuine: {
    scan_id: "scan_mock_genuine",
    status: "pass",
    reason: "",
    fields: {
      product_name: field("Classic Salted Namkeen"),
      mrp: field("₹20"),
      net_qty: field("70 g"),
      mfg_date: field("2026-01-04"),
      expiry: field("2026-07-04"),
      customer_care: field("1800-000-0000"),
      bis_licence: field(null),
      "party.0.role": field("manufacturer"),
      "party.0.name": field("ACME FOODS PRIVATE LIMITED"),
      "party.0.address": field("12 Example Road, Andheri East, Mumbai"),
      "party.0.pincode": field("400069"),
      "party.0.fssai": field("10012022000123"),
      "party.0.cin": field("U15100MH2009PTC123456"),
      "party.0.gstin": field("27AAACR5055K1Z5"),
    },
  },

  // Two manufacturing units plus a marketer, and one licence the reader could
  // not tie to an address - the case the review screen's assignment UI exists for.
  multi: {
    scan_id: "scan_mock_multi",
    status: "warn",
    reason: "",
    fields: {
      product_name: field("Masala Crunch Mix"),
      mrp: field("₹45", { uncertain: true, confidence: 0.52, source: "both" }),
      net_qty: field("150 g"),
      mfg_date: field("2026-02-11"),
      expiry: field("2026-11-11"),
      customer_care: field("care@example.in"),
      bis_licence: field(null),
      "party.0.role": field("marketer"),
      "party.0.name": field("GLOBEX TRADERS"),
      "party.0.address": field("4th Floor, Trade Centre, Bengaluru"),
      "party.0.pincode": field("560001"),
      "party.1.role": field("manufacturer"),
      "party.1.unit_code": field("I"),
      "party.1.name": field("ACME FOODS PRIVATE LIMITED"),
      "party.1.address": field("Plot 7, MIDC, Pune"),
      "party.1.pincode": field("411019", { uncertain: true, confidence: 0.48, source: "llm" }),
      "party.1.fssai": field("10012022000123"),
      "party.2.role": field("manufacturer"),
      "party.2.unit_code": field("II"),
      "party.2.name": field("ACME FOODS PRIVATE LIMITED"),
      "party.2.address": field("Survey 44, Hosur"),
      "party.2.pincode": field("635109"),
      "unassigned_licence.0": field("11522004000456", { uncertain: true, confidence: 0.6 }),
    },
  },

  fake: {
    scan_id: "scan_mock_fake",
    status: "warn",
    reason: "",
    fields: {
      product_name: field("Premium Health Mix"),
      mrp: field("₹199"),
      net_qty: field("500 g", { uncertain: true, confidence: 0.4, source: "llm" }),
      mfg_date: field(null),
      expiry: field(null),
      customer_care: field(null),
      bis_licence: field(null),
      "party.0.role": field("manufacturer"),
      "party.0.name": field("ACME FOODS PRIVATE LIMITED"),
      "party.0.address": field("Shed 3, Industrial Area"),
      "party.0.pincode": field(null),
      // 5 digits: the one real signal the backend can raise today.
      "party.0.fssai": field("12345", { uncertain: true, confidence: 0.35 }),
      "party.0.cin": field("U15100MH2009PTC123456"),
    },
  },
};

const VERIFIES: Record<MockKey, VerifyResponse> = {
  // company pass -> 40/40 = 100, from one check.
  genuine: {
    scan_id: "scan_mock_genuine",
    checks: [
      { id: "company", status: "pass", flags: [] },
      { id: "licence", status: "not_checked", flags: [] },
      { id: "label_law", status: "not_checked", flags: [] },
    ],
    score: 100,
    checks_ran: 1,
    verdict: "low_risk",
    official_links: [
      {
        label: "Verify FSSAI licence",
        url: "https://foscos.fssai.gov.in/",
        copy: "10012022000123",
      },
      {
        label: "Verify company on MCA",
        url: "https://www.mca.gov.in/",
        copy: "U15100MH2009PTC123456",
      },
    ],
  },

  // company warn (low) -> 40 * 0.8 / 40 = 80, from one check.
  multi: {
    scan_id: "scan_mock_multi",
    checks: [
      {
        id: "company",
        status: "warn",
        flags: [
          {
            code: "MCA_NAME_ONLY_MATCH",
            severity: "low",
            en: "The manufacturer name was found in the MCA register by name only - confirm the CIN to be sure it is the same company.",
            hi: "निर्माता का नाम MCA रजिस्टर में केवल नाम के आधार पर मिला है - एक ही कंपनी होने की पुष्टि के लिए CIN जाँचें।",
            evidence: {
              manufacturer: "ACME FOODS PRIVATE LIMITED",
              cin: "U15100MH2009PTC123456",
              status: "Active",
              similarity: 1,
              matched_on: "name",
              party: 1,
            },
          },
        ],
      },
      { id: "licence", status: "not_checked", flags: [] },
      { id: "label_law", status: "not_checked", flags: [] },
    ],
    score: 80,
    checks_ran: 1,
    verdict: "low_risk",
    official_links: [
      {
        label: "Verify FSSAI licence",
        url: "https://foscos.fssai.gov.in/",
        copy: "10012022000123",
      },
    ],
  },

  // company warn (high) -> 0; licence warn (medium) -> 35 * 0.5 = 17.5.
  // 17.5 / 75 = 23.3 -> 23, and the high-severity flag floors the verdict.
  fake: {
    scan_id: "scan_mock_fake",
    checks: [
      {
        id: "company",
        status: "warn",
        flags: [
          {
            code: "MCA_COMPANY_NOT_ACTIVE",
            severity: "high",
            en: "MCA records show this company as 'Strike Off', not Active - treat the maker's claim on this label with caution.",
            hi: "MCA रिकॉर्ड में यह कंपनी 'Strike Off' दर्ज है, Active नहीं - लेबल पर दिए निर्माता के दावे को सावधानी से लें।",
            evidence: {
              cin: "U15100MH2009PTC123456",
              name: "ACME FOODS PRIVATE LIMITED",
              status: "Strike Off",
              matched_on: "cin",
              party: 0,
            },
          },
        ],
      },
      {
        id: "licence",
        status: "warn",
        flags: [
          {
            code: "FSSAI_FORMAT_INVALID",
            severity: "medium",
            en: "The FSSAI number is not 14 digits - it may be misread or misprinted.",
            hi: "FSSAI नंबर 14 अंकों का नहीं है - यह गलत पढ़ा या गलत छपा हो सकता है।",
            evidence: { fssai: "12345", party: 0 },
          },
        ],
      },
      { id: "label_law", status: "not_checked", flags: [] },
    ],
    score: 23,
    checks_ran: 2,
    verdict: "high_risk",
    official_links: [
      {
        label: "Verify FSSAI licence",
        url: "https://foscos.fssai.gov.in/",
        copy: "12345",
      },
      {
        label: "Verify company on MCA",
        url: "https://www.mca.gov.in/",
        copy: "U15100MH2009PTC123456",
      },
    ],
  },
};

/** The shape the API returns with nothing connected: honest, and entirely empty. */
export const EMPTY_VERIFY: VerifyResponse = {
  scan_id: null,
  checks: [
    { id: "company", status: "not_checked", flags: [] },
    { id: "licence", status: "not_checked", flags: [] },
    { id: "label_law", status: "not_checked", flags: [] },
  ],
  score: null,
  checks_ran: 0,
  verdict: "not_checked",
  official_links: [],
};

export function mockScan(key: MockKey): ScanResponse {
  return structuredClone(SCANS[key]);
}

export function mockVerify(key: MockKey): VerifyResponse {
  return structuredClone(VERIFIES[key]);
}

/** One-line description for the demo menu (shown only with `?demo=1`). */
export const MOCK_DESCRIPTIONS: Record<MockKey, { en: string; hi: string }> = {
  genuine: {
    en: "One manufacturer, found and active in MCA",
    hi: "एक निर्माता, MCA में मिला और सक्रिय",
  },
  multi: {
    en: "Marketer + two units, one licence unplaced",
    hi: "विपणनकर्ता + दो यूनिट, एक लाइसेंस बिना कंपनी",
  },
  fake: {
    en: "Company struck off, FSSAI number malformed",
    hi: "कंपनी स्ट्राइक ऑफ़, FSSAI नंबर ग़लत",
  },
};
