# Verify It — API Contract

The **actual** request/response contract of the Verify It backend as implemented
in `backend/main.py` and `backend/providers.py`. Written for frontend consumers.

- **Base URL (same Wi-Fi as Aditya's Mac):** `http://172.17.21.35:8001`
- **Base URL (localhost):** `http://127.0.0.1:8001`
- **Content type:** `application/json`, except `POST /api/scan` which is
  `multipart/form-data`.
- **CORS:** only the dev origins `http://localhost:3000` and
  `http://127.0.0.1:3000`. Any other origin - including a browser page served from
  a LAN IP - is rejected with `OPTIONS -> 400` until it is added explicitly. `*` is
  never opened; send the exact origin to be allowed.
- **Frozen mock data:** [`samples/`](samples/) — kept in sync by
  `tests/test_samples.py`.

> **Registry status.** The backend makes **no external network calls**. The
> `company` check reads a *local* PostgreSQL snapshot of the MCA *Company Master
> Data* register when the team has imported one (see
> **[`MCA_SETUP.md`](MCA_SETUP.md)**); with no snapshot - or with no confident
> match - it returns `status: "not_checked"`. FSSAI/BIS, Surepass and the OCR
> pipeline are not connected. `score` is **computed from the checks that actually
> ran** (see **[The trust score](#the-trust-score)**) and is `null` - with
> `verdict: "not_checked"` - only when none of them could run. `checks_ran`
> reports how many checks fed the number, so a partial score can never be read as
> a whole-label verdict. No real or fake registry data is ever invented.

## Endpoints

| Method | Path          | Description                                        |
| ------ | ------------- | -------------------------------------------------- |
| GET    | `/api/health` | Liveness check.                                    |
| POST   | `/api/scan`   | Read a label photo and return the extracted fields. |
| POST   | `/api/verify` | Confirmed fields -> checks, score and official links. |

### `GET /api/health`

```json
{ "status": "ok", "app": "Verify It" }
```

### `POST /api/scan`

`multipart/form-data` with an optional `file` field (the label photo).

**Response `200 OK` (no file uploaded — the placeholder):**

```json
{
  "scan_id": "scan_<uuid4hex>",
  "status": "not_checked",
  "reason": "OCR pipeline not connected",
  "fields": {}
}
```

**Response `200 OK` (with a real photo — the OCR pipeline is wired):**

```json
{
  "scan_id": "scan_<uuid4hex>",
  "status": "checked",
  "reason": null,
  "fields": {
    "manufacturer":  {"value": "Acme Foods Pvt Ltd", "confidence": 0.92, "uncertain": false, "source": "ocr"},
    "address":       {"value": "Plot 21, MIDC, Mumbai", "confidence": 0.88, "uncertain": false, "source": "ocr"},
    "pincode":       {"value": "400001", "confidence": 0.95, "uncertain": false, "source": "ocr"},
    "fssai":         {"value": "10012022000123", "confidence": 0.90, "uncertain": false, "source": "ocr"},
    "bis_licence":   {"value": "1234", "confidence": 0.30, "uncertain": true,  "source": "ocr"},
    "mrp":           {"value": "99.00", "confidence": 0.85, "uncertain": false, "source": "ocr"},
    "net_qty":       {"value": "200g", "confidence": 0.85, "uncertain": false, "source": "ocr"},
    "mfg_date":      {"value": null, "confidence": null, "uncertain": false, "source": null},
    "expiry":        {"value": null, "confidence": null, "uncertain": false, "source": null},
    "customer_care": {"value": "1800123456", "confidence": 0.80, "uncertain": false, "source": "ocr"},
    "cin":           {"value": null, "confidence": null, "uncertain": false, "source": null},
    "gstin":         {"value": null, "confidence": null, "uncertain": false, "source": null},
    "product_name":  {"value": "Acme Sauce", "confidence": 0.92, "uncertain": false, "source": "ocr"}
  }
}
```

`fields` is a map of field name -> `ScanField`. The 13 keys (one per
required declaration) are always present, even when OCR didn't find
them — in which case the value is `null` and the field stays
`source: null`. This lets the review screen render a single shape for
"found" and "not found" without branching.

| Field        | Type             | Notes                                     |
| ------------ | ---------------- | ----------------------------------------- |
| `value`      | `string \| null` | The read value, or `null` if not found.   |
| `confidence` | `number \| null` | Reader confidence 0-1.                    |
| `uncertain`  | `boolean`        | `true` -> highlight for the user to check.|
| `source`     | `string \| null` | `"ocr"`, `"llm"` or `"both"`.             |

### `POST /api/verify`

The body is **optional** and every field inside it is **optional** (all
strings). `{}` or no body is valid and returns `200 OK`.

**Request fields:** `scan_id`, `manufacturer`, `address`, `pincode`, `fssai`,
`bis_licence`, `mrp`, `net_qty`, `mfg_date`, `expiry`, `customer_care`, `cin`,
`gstin`, `product_name`.

**Response `200 OK`:**

```json
{
  "scan_id": null,
  "checks": [
    { "id": "company",   "status": "not_checked", "flags": [] },
    { "id": "licence",   "status": "not_checked", "flags": [] },
    { "id": "label_law", "status": "not_checked", "flags": [] }
  ],
  "score": null,
  "checks_ran": 0,
  "verdict": "not_checked",
  "official_links": []
}
```

| Field            | Type              | Notes                                                                |
| ---------------- | ----------------- | -------------------------------------------------------------------- |
| `scan_id`        | `string \| null`  | Echo of the scan id, or `null`.                                      |
| `checks`         | `Check[]`         | Always three, in order `company`, `licence`, `label_law`.            |
| `score`          | `integer \| null` | Trust score 0-100 **of the checks that ran**, or `null` if none ran.  |
| `checks_ran`     | `integer`         | `0..3` - how many checks fed `score`.                                |
| `verdict`        | `string`          | `low_risk` / `medium_risk` / `high_risk` / `not_checked`.             |
| `official_links` | `OfficialLink[]`  | One-tap official verification links.                                 |

`Check`: `{ id: string, status: "pass"|"warn"|"fail"|"not_checked", flags: Flag[] }`

`Flag`: `{ code: string, severity: "high"|"medium"|"low", en: string, hi: string, evidence: object|null }`

`OfficialLink`: `{ label: string, url: string, copy: string }` — the frontend
copies `copy` and opens `url`; the user pastes the number and solves the captcha.
No site is pre-filled.

## The only real signal today: FSSAI format

A supplied `fssai` that is **not exactly 14 ASCII digits** adds a
`FSSAI_FORMAT_INVALID` flag to the `licence` check and sets its status to
`"warn"`:

```json
{
  "id": "licence",
  "status": "warn",
  "flags": [
    {
      "code": "FSSAI_FORMAT_INVALID",
      "severity": "medium",
      "en": "The FSSAI number is not 14 digits - it may be misread or misprinted.",
      "hi": "FSSAI नंबर 14 अंकों का नहीं है - यह गलत पढ़ा या गलत छपा हो सकता है।",
      "evidence": { "fssai": "123" }
    }
  ]
}
```

> **A valid format is NOT a valid licence.** `{"fssai":"10012022000123"}`
> produces **no flag** and leaves `licence.status` at `"not_checked"`. Never
> present a format-valid number as "verified".

## The second real signal: the `company` check vs the local MCA snapshot

Once the team has imported an MCA *Company Master Data* snapshot (see
[`MCA_SETUP.md`](MCA_SETUP.md)) the `company` check can resolve. Without a
snapshot, or without a confident match, it stays `"not_checked"`.

| Situation | `status` | Flags |
| --------- | -------- | ----- |
| `cin` is in the register, its status is Active, **and** any supplied `manufacturer` name reconciles with the register's name for that CIN | `"pass"` | none |
| `cin` is in the register but the status is not Active (e.g. `Strike Off`) | `"warn"` | `MCA_COMPANY_NOT_ACTIVE` (high) |
| `cin` is in the register but **no status is recorded** for it | `"warn"` | `MCA_COMPANY_STATUS_UNKNOWN` (medium) |
| `cin` is in the register, but the supplied `manufacturer` name belongs to a different company | `"warn"` | `MCA_NAME_MISMATCH` (medium) |
| only the `manufacturer` name matched, fuzzily (similarity >= 0.62), and that record is Active | `"warn"` | `MCA_NAME_ONLY_MATCH` (low) |
| a name matched, and that record is *explicitly* not Active | `"warn"` | `MCA_NAME_ONLY_MATCH_NOT_ACTIVE` (medium) |
| a name matched, and that record has **no status recorded** | `"warn"` | `MCA_NAME_ONLY_MATCH_STATUS_UNKNOWN` (medium) |
| no match, no snapshot, or a company the snapshot does not contain | `"not_checked"` | none - a miss is **never** a failure |

The name and the status are **independent findings on a CIN hit**, so both are
reported when both apply: a struck-off company whose printed name also disagrees
carries two flags, worst severity first.

Three rules make the table easier to read:

- **A `pass` needs both questions answered.** An exact CIN settles *which record*
  this is; it says nothing about whether that company is still live, and nothing
  about whether the label is even describing it. `pass` therefore requires an Active
  status **and** a reconciling printed name.
- **A legal-form suffix is not a mismatch.** Both names are normalised first, so
  `PVT` / `LTD` / `LIMITED` / `LLP` / `&` / punctuation differences disappear and
  "Acme Foods Pvt Ltd" matches "Acme Foods Limited" outright - no fuzzy comparison is
  even needed for those.
- **A name disagreement is never an accusation.** An unfamiliar abbreviation, a
  trading name, a group company or a misread label all look exactly like a swapped
  CIN, so the flag asks the user to confirm on the portal. It never says the label is
  fake, and it is never `fail`.

Both status rules exist because of the same failure mode: a company that is not
active (or not recorded as active) must never be presented as a confirmed active
maker.

Values below are illustrative - build the UI from the shapes, not the numbers.

`MCA_NAME_ONLY_MATCH` - the name matched, but a name is not a unique identifier:

```json
{
  "id": "company",
  "status": "warn",
  "flags": [
    {
      "code": "MCA_NAME_ONLY_MATCH",
      "severity": "low",
      "en": "The manufacturer name was found in the MCA register by name only - confirm the CIN to be sure it is the same company.",
      "hi": "निर्माता का नाम MCA रजिस्टर में केवल नाम के आधार पर मिला है - एक ही कंपनी होने की पुष्टि के लिए CIN जाँचें।",
      "evidence": {
        "manufacturer": "ACME FOODS PRIVATE LIMITED",
        "cin": "U15100MH2009PTC123456",
        "status": "Active",
        "similarity": 1.0,
        "matched_on": "name"
      }
    }
  ]
}
```

`MCA_COMPANY_NOT_ACTIVE` - the CIN is real, but the company is not active:

```json
{
  "id": "company",
  "status": "warn",
  "flags": [
    {
      "code": "MCA_COMPANY_NOT_ACTIVE",
      "severity": "high",
      "en": "MCA records show this company as 'Strike Off', not Active - treat the maker's claim on this label with caution.",
      "hi": "MCA रिकॉर्ड में यह कंपनी 'Strike Off' दर्ज है, Active नहीं - लेबल पर दिए निर्माता के दावे को सावधानी से लें।",
      "evidence": {
        "cin": "U15100MH2009PTC123456",
        "name": "ACME FOODS PRIVATE LIMITED",
        "status": "Strike Off",
        "matched_on": "cin"
      }
    }
  ]
}
```

`MCA_COMPANY_STATUS_UNKNOWN` - the CIN is in the register, but with no status:

```json
{
  "id": "company",
  "status": "warn",
  "flags": [
    {
      "code": "MCA_COMPANY_STATUS_UNKNOWN",
      "severity": "medium",
      "en": "This CIN is in the MCA register but no company status is recorded for it, so the maker's registration cannot be confirmed as Active.",
      "hi": "यह CIN MCA रजिस्टर में है, परंतु इसके लिए कंपनी की स्थिति दर्ज नहीं है, इसलिए निर्माता का पंजीकरण Active होने की पुष्टि नहीं हो सकती।",
      "evidence": {
        "cin": "U15100MH2009PTC123456",
        "name": "ACME FOODS PRIVATE LIMITED",
        "status": null,
        "matched_on": "cin"
      }
    }
  ]
}
```

`MCA_NAME_ONLY_MATCH_NOT_ACTIVE` - a name match whose record is not Active. Two
doubts at once: the identity is unconfirmed *and* the record is not Active:

```json
{
  "id": "company",
  "status": "warn",
  "flags": [
    {
      "code": "MCA_NAME_ONLY_MATCH_NOT_ACTIVE",
      "severity": "medium",
      "en": "The manufacturer name matched an MCA record by name only, and that record is not Active (recorded as 'Strike Off'). Confirm the CIN: a name match may be a different company, and if it is the same one its registration may no longer be active.",
      "hi": "निर्माता का नाम MCA रिकॉर्ड से केवल नाम के आधार पर मिला है, और वह रिकॉर्ड Active नहीं है (दर्ज स्थिति 'Strike Off')। CIN की पुष्टि करें: नाम का मिलान किसी और कंपनी का हो सकता है, और यदि वही कंपनी है तो उसका पंजीकरण अब सक्रिय नहीं हो सकता।",
      "evidence": {
        "manufacturer": "ACME FOODS PRIVATE LIMITED",
        "cin": "U15100MH2009PTC123456",
        "status": "Strike Off",
        "similarity": 0.91,
        "matched_on": "name"
      }
    }
  ]
}
```

`MCA_NAME_MISMATCH` - the CIN is real, but the printed name is a different company.
Note the evidence carries **both** names, and the wording asks rather than accuses:

```json
{
  "id": "company",
  "status": "warn",
  "flags": [
    {
      "code": "MCA_NAME_MISMATCH",
      "severity": "medium",
      "en": "This CIN is registered to 'ACME FOODS PRIVATE LIMITED', which does not match the manufacturer name printed on the label ('GLOBEX TRADERS'). The CIN may be correct and the name abbreviated, or these may be different companies - confirm on the MCA portal before trusting the maker's claim.",
      "hi": "यह CIN 'ACME FOODS PRIVATE LIMITED' के नाम पर पंजीकृत है, जो लेबल पर छपे निर्माता के नाम ('GLOBEX TRADERS') से मेल नहीं खाता। हो सकता है CIN सही हो और नाम संक्षिप्त हो, या ये अलग कंपनियाँ हों - निर्माता के दावे पर भरोसा करने से पहले MCA पोर्टल पर पुष्टि करें।",
      "evidence": {
        "cin": "U15100MH2009PTC123456",
        "registry_name": "ACME FOODS PRIVATE LIMITED",
        "manufacturer": "GLOBEX TRADERS",
        "name_similarity": 0.0833,
        "status": "Active",
        "matched_on": "cin"
      }
    }
  ]
}
```

`MCA_NAME_ONLY_MATCH_STATUS_UNKNOWN` - a name match on a record with no status. The
wording deliberately never says "not Active": the export says nothing, and
"unknown" and "inactive" are different statements:

```json
{
  "id": "company",
  "status": "warn",
  "flags": [
    {
      "code": "MCA_NAME_ONLY_MATCH_STATUS_UNKNOWN",
      "severity": "medium",
      "en": "The manufacturer name matched an MCA record by name only, and that record has no company status recorded, so the register cannot confirm whether it is still Active. Confirm the CIN: the name match may be a different company.",
      "hi": "निर्माता का नाम MCA रिकॉर्ड से केवल नाम के आधार पर मिला है, और उस रिकॉर्ड में कंपनी की स्थिति दर्ज नहीं है, इसलिए रजिस्टर यह पुष्टि नहीं कर सकता कि यह अब भी Active है। CIN की पुष्टि करें: नाम का मिलान किसी और कंपनी का हो सकता है।",
      "evidence": {
        "manufacturer": "ACME FOODS PRIVATE LIMITED",
        "cin": "U15100MH2009PTC123456",
        "status": null,
        "similarity": 0.91,
        "matched_on": "name"
      }
    }
  ]
}
```

> **`company: "pass"` means "this CIN is a real, active entry in the snapshot you
> imported, and the name printed on the label is that company's name".** The snapshot
> is a dated export, so it can lag, and a match is not a
> statement that the label itself is genuine. `"not_checked"` is never a failure,
> and `"fail"` is deliberately not produced by this check at all.

## The trust score

`score` and `verdict` are **derived from the checks that ran** - never invented,
and never a silent zero for a registry the backend has not connected.

1. Each check carries a weight: `company` 40, `licence` 35, `label_law` 25. The
   three add up to 100, so a label that passes every check it was possible to run
   scores `100`.
2. A check earns a fraction of its weight:
   - `pass` -> the whole weight
   - `warn` -> the credit of its **worst** flag: `low` 0.8, `medium` 0.5, `high` 0.0
   - `fail` -> nothing (no check emits `fail` today)
   - `not_checked` -> **excluded from the calculation entirely**
3. `score = round(100 * earned / weight of the checks that ran)`.

`verdict` is the **more serious** of the score's band and the worst flag severity
found, so a high-severity finding is never played down by an otherwise clean score:

| Score    | Band          |
| -------- | ------------- |
| `>= 75`  | `low_risk`    |
| `>= 40`  | `medium_risk` |
| `< 40`   | `high_risk`   |

| Worst flag severity | Verdict floor |
| ------------------- | ------------- |
| `high`              | `high_risk`   |
| `medium`            | `medium_risk` |
| `low`               | `low_risk`    |

With no score at all - no check ran - there is nothing to band: `score` is `null`
and `verdict` stays `not_checked` (a pending state, not a failure).

**Worked examples.** Only the checks that ran are counted, so the same number can
mean different things; `checks_ran` is what disambiguates it:

| Checks that ran | Arithmetic | `score` | `checks_ran` | `verdict` |
| --------------- | ---------- | ------- | ------------ | --------- |
| none (`{}`) | - | `null` | `0` | `not_checked` |
| `licence` = `warn` (`medium`) | `35 * 0.5 / 35` | `50` | `1` | `medium_risk` |
| `company` = `pass` | `40 * 1.0 / 40` | `100` | `1` | `low_risk` |
| `company` = `warn` (`high`), `licence` = `pass`, `label_law` = `pass` | `(0 + 35 + 25) / 100` | `60` | `3` | `high_risk` |

## Displaying statuses

- `not_checked` -> render **"Verification pending"**, not a pass/fail badge.
  It means the check has not run yet. Never infer a failure from it.
- `score: null` / `verdict: "not_checked"` -> the gauge shows a pending state,
  **not 0**.
- `score: 0..100` -> show the number **together with `checks_ran`**, e.g.
  `"Trust score 50 - based on 1 of 3 checks"`. A bare number reads as a
  whole-label verdict, which it is not unless `checks_ran == 3`.

## Examples

### Empty body `{}`

```bash
curl -X POST http://127.0.0.1:8001/api/verify -H 'Content-Type: application/json' -d '{}'
```

### Valid FSSAI format (no flag, registry still pending)

```bash
curl -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"fssai":"10012022000123"}'
```

### Invalid FSSAI format (adds a flag)

```bash
curl -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"fssai":"123"}'
```

### Scan

```bash
curl -X POST http://127.0.0.1:8001/api/scan -F 'file=@label.jpg'
```

## Frontend fetch example

```js
const API_BASE = "http://127.0.0.1:8001";

async function scanLabel(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/scan`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`scan failed: ${res.status}`);
  return res.json(); // { scan_id, status, reason, fields }
}

async function verifyItem(fields = {}) {
  const res = await fetch(`${API_BASE}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`verify failed: ${res.status}`);
  return res.json(); // { scan_id, checks, score, checks_ran, verdict, official_links }
}

// not_checked is NOT a failure - it means the check has not run yet.
const label = (status) => (status === "not_checked" ? "Verification pending" : status);
```
