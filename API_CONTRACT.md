# Verify It — API Contract

The **actual** request/response contract of the Verify It backend as implemented
in `backend/main.py` and `backend/providers.py`. Written for frontend consumers.

- **Base URL (local):** `http://127.0.0.1:8001`
- **Content type:** `application/json`, except `POST /api/scan` which is
  `multipart/form-data`.
- **CORS:** the dev origins `http://localhost:3000` and `http://127.0.0.1:3000`.
- **Frozen mock data:** [`samples/`](samples/) — kept in sync by
  `tests/test_samples.py`.

> **Registry status.** The backend makes **no external network calls**. The
> `company` check reads a *local* PostgreSQL snapshot of the MCA *Company Master
> Data* register when the team has imported one (see
> **[`MCA_SETUP.md`](MCA_SETUP.md)**); with no snapshot - or with no confident
> match - it returns `status: "not_checked"`. FSSAI/BIS, Surepass and the OCR
> pipeline are not connected. `score` stays `null` and `verdict` stays
> `"not_checked"`: one resolvable check is not a whole-label verdict. No real or
> fake registry data is ever invented.

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

**Response `200 OK`:**

```json
{
  "scan_id": null,
  "status": "not_checked",
  "reason": "OCR pipeline not connected",
  "fields": {}
}
```

`fields` is a map of field name -> `ScanField`. Once the OCR pipeline is
connected each field looks like:

```json
{ "value": "70 g", "confidence": 0.9, "uncertain": false, "source": "ocr" }
```

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
  "verdict": "not_checked",
  "official_links": []
}
```

| Field            | Type              | Notes                                                        |
| ---------------- | ----------------- | ------------------------------------------------------------ |
| `scan_id`        | `string \| null`  | Echo of the scan id, or `null`.                              |
| `checks`         | `Check[]`         | Always three, in order `company`, `licence`, `label_law`.    |
| `score`          | `integer \| null` | Trust score 0-100, or `null` while unresolved.               |
| `verdict`        | `string`          | `low_risk` / `medium_risk` / `high_risk` / `not_checked`.    |
| `official_links` | `OfficialLink[]`  | One-tap official verification links.                         |

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
| `cin` is in the register and the recorded status is Active | `"pass"` | none |
| `cin` is in the register but the status is not Active (e.g. `Strike Off`) | `"warn"` | `MCA_COMPANY_NOT_ACTIVE` (high) |
| only the `manufacturer` name matched, fuzzily (similarity >= 0.62) | `"warn"` | `MCA_NAME_ONLY_MATCH` (low) |
| no match, no snapshot, or a company the snapshot does not contain | `"not_checked"` | none - a miss is **never** a failure |

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

> **`company: "pass"` means "this CIN is a real, active entry in the snapshot you
> imported".** The snapshot is a dated export, so it can lag, and a match is not a
> statement that the label itself is genuine. `"not_checked"` is never a failure,
> and `"fail"` is deliberately not produced by this check at all.

## Displaying statuses

- `not_checked` -> render **"Verification pending"**, not a pass/fail badge.
  It means the check has not run yet. Never infer a failure from it.
- `score: null` / `verdict: "not_checked"` -> the gauge shows a pending state,
  **not 0**.

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
  return res.json(); // { scan_id, checks, score, verdict, official_links }
}

// not_checked is NOT a failure - it means the check has not run yet.
const label = (status) => (status === "not_checked" ? "Verification pending" : status);
```
