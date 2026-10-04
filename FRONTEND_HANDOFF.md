# Frontend handoff — for Sunil

Everything you need to build the UI **without waiting on the backend**. The
backend already returns the exact contract below. Most checks are honest
`not_checked` placeholders because the registries are not connected yet; the
`company` check is the exception - it resolves once the team imports the MCA
snapshot (see [`MCA_SETUP.md`](MCA_SETUP.md)), so build it for every status.

- **Base URL (local):** `http://127.0.0.1:8001`
- **CORS:** `http://localhost:3000` and `http://127.0.0.1:3000` are allowed.
- **Frozen mock data:** [`samples/`](samples/) — use these as fixtures and build
  the whole interface against them until the API is wired.

## Getting the code

```bash
git clone https://github.com/yadnyesh-24/verifyIT.git
cd verifyIT
git checkout frontend/yadnyesh
```

The team repo is <https://github.com/yadnyesh-24/verifyIT>. `frontend/yadnyesh` is
your branch (the name predates the role swap — keep it so local checkouts keep
working). `frontend/app/` and `frontend/components/` are on `main`, so merge `main`
in to pick them up:

```bash
git checkout frontend/yadnyesh
git pull --rebase origin frontend/yadnyesh
git merge origin/main
```

**`frontend/lib/` is still uncommitted.** It was invisible because `.gitignore`'s
Python `lib/` rule matched it at every depth; that is fixed on `main`, so a
`git merge origin/main` followed by `git add frontend/lib` will commit yours. Until
then `npm run build` fails on the missing imports (`@/lib/types`, `@/lib/api`,
`@/lib/i18n`, `@/lib/mocks`, `@/lib/scan-store`, `@/lib/utils`).

Push to that branch (`git pull --rebase origin frontend/yadnyesh` → commit →
`git push origin frontend/yadnyesh`). `main` is the integration trunk; open a PR
into it when a chunk is demo-ready. **The backend in this repo and
`API_CONTRACT.md` are frozen** — read them, don't change them.

## User journey (how the calls fit)

1. **Upload / camera** → `POST /api/scan` with the image.
   Today it returns `status: "not_checked"`, `fields: {}` — show "Reading label…"
   then fall back gracefully (see *Handling `not_checked`*).
2. **Review screen** → render every field; `uncertain: true` → yellow border +
   "Please check" badge; `null` value → "Not found". User edits, then hits
   **Confirm & verify**.
3. **Results** → `POST /api/verify` with the edited fields → render the three
   check cards, the Trust Score gauge and the official links.

## Endpoints

| Step | Call | Body | Purpose |
| ---- | ---- | ---- | ------- |
| 1 | `POST /api/scan` | `multipart/form-data`, field `file` | Upload label photo → fields |
| 2 | `POST /api/verify` | JSON | Confirmed fields → checks + score + links |
| — | `GET /api/health` | — | Liveness: `{"status":"ok","app":"Verify It"}` |

## Field names — use EXACTLY these

```
scan_id, manufacturer, address, pincode, fssai, bis_licence, mrp, net_qty,
mfg_date, expiry, customer_care, cin, gstin, product_name
```

## Response contract (frozen)

### `POST /api/scan`

```json
{ "scan_id": "scan_9f2c…", "status": "not_checked", "reason": "OCR pipeline not connected", "fields": {} }
```

`scan_id` is minted fresh on every scan —
[`samples/scan_response.json`](samples/scan_response.json) documents the shape with
a `<generated>` placeholder because the value changes per call. Send it back with
the confirmed fields in step 3 and the API echoes it unchanged, which is how you tie
a result to the scan it came from. It is `null` only when you never scanned.

Per field (once OCR is wired): `{ "value": "…", "confidence": 0.0-1.0,
"uncertain": true|false, "source": "ocr" | "llm" | "both" }`.

### `POST /api/verify`

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

- `checks[].status` ∈ `"pass" | "warn" | "fail" | "not_checked"`
- `checks[].flags[]` = `{ code, severity: "high" | "medium" | "low", en, hi, evidence }`
- `score` = `0..100` **or `null`** when no check could run
- `checks_ran` = `0..3`, how many checks fed `score`
- `verdict` ∈ `"low_risk" | "medium_risk" | "high_risk" | "not_checked"`
- `official_links[]` = `{ label, url, copy }`

### Handling `not_checked` (important)

`not_checked` is **not** a failure and **not** a pass. Render it as
**"Verification pending"**, not a red/green badge. `score: null` /
`verdict: "not_checked"` → the gauge shows a pending/— state, **not 0**.

### Showing the score (important)

`score` is computed from the checks that **ran**, so never render it on its own —
always pair it with `checks_ran`:

```jsx
{score === null
  ? "—"                                              // nothing ran: pending, not 0
  : `Trust score ${score} — based on ${checks_ran} of 3 checks`}
```

`"Trust score 100 — based on 1 of 3 checks"` is honest. A bare `100` is not. The
full formula is in
[`API_CONTRACT.md`](API_CONTRACT.md#the-trust-score).

**Colour and wording come from `verdict`, never from a threshold in the client.**
The backend applies the score bands *and* the worst flag severity, so a
re-implemented threshold disagrees with the API — the old gauge used 75/45 while the
contract uses 75/40, and a high-severity flag can return `high_risk` at a score of
60.

```jsx
const VERDICT_STYLE = {
  low_risk:    { color: "text-success",     label: "Low risk in completed checks" },
  medium_risk: { color: "text-warning",     label: "Check carefully" },
  high_risk:   { color: "text-destructive", label: "High risk found" },
} as const;
```

Always say what the number does **not** mean: it covers the checks that ran, so it
is not proof that the product is authentic or safe.

### Sending the confirmed fields back

`/api/verify` forwards **every** field in the request to the label-law checker,
including the ones the user left blank — "the label does not print an MRP" is a
violation while "the form was not filled in" is not, and the rules have to tell
those apart. So send the full body every time, with `null` for anything genuinely
absent:

```jsonc
{
  "scan_id": "scan_9f2c…",
  "manufacturer": "…", "address": "…", "pincode": "…",
  "fssai": "…", "bis_licence": "…", "cin": "…", "gstin": "…",
  "mrp": "…", "net_qty": "…", "mfg_date": "…", "expiry": "…",
  "customer_care": "…", "product_name": "…"
}
```

### What you can already demo

One real signal exists today: an invalid FSSAI **format** raises a flag.

```bash
curl -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"fssai":"123"}'
```

→ `licence.status: "warn"` with `code: "FSSAI_FORMAT_INVALID"` (English + Hindi),
and `score: 50` / `checks_ran: 1` / `verdict: "medium_risk"` — the first response
that carries a real trust score.
Use [`samples/verify_response_fssai_invalid.json`](samples/verify_response_fssai_invalid.json)
to build and demo both the flag UI and the gauge. **A valid format is not a
verified licence** — never show "Verified" for it.

### The `company` check can now answer (two new flag codes)

Once the MCA snapshot is imported the `company` check returns real statuses. Build
this now - the `samples/` fixtures must match the API exactly, and they stay
`not_checked` because no snapshot exists in the sample run.

| `company.status` | Meaning | What to render |
| ---------------- | ------- | -------------- |
| `pass` | The CIN is a real, **Active** entry in the imported MCA snapshot | Success card: "Found in the MCA register" |
| `warn` + `MCA_NAME_ONLY_MATCH` (low) | Only the name matched, fuzzily | "Name found in MCA - confirm the CIN" |
| `warn` + `MCA_COMPANY_NOT_ACTIVE` (high) | The CIN is real but not Active (e.g. `Strike Off`) | Caution card showing the recorded status |
| `not_checked` | No snapshot, or no confident match | "Verification pending" - **not** a failure |

`evidence` carries `similarity` (0-1), `cin`, `name`, `status` and `matched_on`
(`"cin"` or `"name"`). Exact shapes and both flag messages (English + Hindi) are
in [`API_CONTRACT.md`](API_CONTRACT.md#the-second-real-signal-the-company-check-vs-the-local-mca-snapshot).

## Environment

Read the base URL from `NEXT_PUBLIC_API_URL`; while it is unset, load the
`samples/` fixtures so you can build offline.

```js
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
// no API_BASE -> import the sample JSON instead
```

## Run the backend locally

```bash
cd verify-it
./.venv/bin/uvicorn backend.main:app --reload --port 8001
# Swagger UI: http://127.0.0.1:8001/docs
```

## What to build (from the plan)

- Upload + `<input type="file" accept="image/*" capture="environment">`; shrink
  the image on a `<canvas>` (longest side 1600px, JPEG 0.85) before upload.
- Loading skeleton ("Reading label…", "Checking records…").
- Review screen (edit + uncertain highlighting).
- Results: SVG Trust Score gauge + 3 check cards + flags + official buttons.
- `navigator.clipboard.writeText(link.copy)` then `window.open(link.url)` +
  toast "Number copied. Paste it on the official page."
- English/Hindi toggle (`en`/`hi`) — flag messages already come in both.
