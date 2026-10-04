# VerifyIT

A label scanner that checks every claim printed on a product against India's
official records (MCA, FSSAI, BIS, Legal Metrology) and returns a **0–100 Trust
Score** in seconds.

> Round 1 submission — Cline AI Builders Hackathon · PClub IIT Kanpur.

## Team

| Track | Owner | Lives in |
| ----- | ----- | -------- |
| **Backend, data & scoring** — `/api/scan`, `/api/verify`, the checks, the Trust Score, official links, the MCA registry and DB/integration | Aditya Raunak | `backend/`, `scripts/`, `sql/` |
| **Frontend** — the Next.js PWA | Sunil Jakhar | [`frontend/`](frontend/README.md) |
| **Read (OCR) + Label-law** — label photo → structured fields, and the Legal Metrology rules | Yadnyesh Muratkar | `src/`, `docs/label_rules.md` |

The frontend-facing contract is **frozen** in [`API_CONTRACT.md`](API_CONTRACT.md),
with mock responses in [`samples/`](samples/). Start there.

## Getting the repo

```bash
git clone https://github.com/yadnyesh-24/verifyIT.git
cd verifyIT
git checkout <your-branch>     # frontend/yadnyesh | ocr/sunil | main
```

| Branch | Owner | Use it for |
| ------ | ----- | ---------- |
| `main` | Aditya | integration trunk; everything merges here |
| `frontend/yadnyesh` | Sunil | the PWA in [`frontend/`](frontend/README.md) |
| `ocr/sunil` | Yadnyesh | `src/` — the Read + Label-law track |

> The two branch names predate the role swap in the team table above. They are
> left as they are so nobody's local checkout breaks — rename them only once the
> whole team agrees.

Work on your own branch (`git pull --rebase origin <branch>` → commit →
`git push origin <branch>`) and open a PR into `main` when a chunk is demo-ready.
Only `backend/providers.py` is shared on purpose — it is the single integration
seam. Do not edit `backend/main.py` (routes and schemas): the contract is frozen.

## Layout

```text
VerifyIT/
├─ API_CONTRACT.md              # frozen request/response contract (frontend reads this)
├─ FRONTEND_HANDOFF.md          # onboarding notes for the frontend track
├─ MCA_SETUP.md                 # how to import the MCA registry snapshot
├─ docs/label_rules.md          # Rule 6, LM (Packaged Commodities) Rules 2011 → 8 rules
├─ backend/
│  ├─ main.py                   # FastAPI app (routes, schemas, CORS)
│  ├─ providers.py              # provider / integration layer (the only policy)
│  ├─ db.py                     # PostgreSQL access (degrades safely when absent)
│  └─ mca.py                    # MCA Company Master Data matching (pg_trgm)
├─ scripts/
│  ├─ import_mca.py             # CSV/ZIP export → local `companies` snapshot
│  ├─ check-github.ps1          # team helper (Windows)
│  └─ watch-github.ps1          # team helper (Windows)
├─ sql/001_companies.sql        # `companies` table + trigram index (idempotent)
├─ samples/                     # frozen mock responses for the frontend
├─ tests/                       # API, provider, MCA and sample-freshness tests
├─ src/                         # Yadnyesh's Read + Label-law track
│  ├─ preprocess.py             # resize → gray → CLAHE → bilateral → adaptive thresh → deskew
│  ├─ ocr.py                    # pytesseract image_to_data, eng+hin, PSM 6 vs 11
│  ├─ fields.py                 # format extractors + anchors + candidate scoring + Gemini fallback
│  ├─ label_law.py              # R1..R8 → CheckResult
│  ├─ evaluate.py               # runs every photo vs ground_truth.csv
│  └─ tests/                    # pytest for each rule
├─ frontend/                    # the Next.js PWA (Sunil's track)
│  ├─ app/                      # App Router: home → scanning → review → results
│  ├─ components/               # score gauge, party card, product details, ui primitives
│  └─ lib/                      # NOT committed yet - see the note below
├─ data/
│  ├─ mca/                      # MCA Company Master Data (git-ignored; CSV template committed)
│  ├─ test_labels/{real,fake}/  # git-ignored; captured by anyone on the team
│  ├─ reference/                # e.g. FSSAI state-code table
│  └─ ground_truth.csv          # expected answers for every photo
├─ conftest.py / pytest.ini
├─ requirements.txt / requirements-dev.txt
└─ .env.example
```

> **Not committed yet** — these land with the owners' commits: the `src/*.py`
> modules (`preprocess`, `ocr`, `fields`, `label_law`, `evaluate`),
> `docs/label_rules.md`, `data/reference/*`, `data/ground_truth.csv`, the captured
> photos in `data/test_labels/`, and **`frontend/lib/*`** (the frontend's types,
> API client, i18n dictionary, mocks and session store). The rest of `frontend/` is
> in `main`. Everything else shown above is already in `main`.
>
> `frontend/lib/` was invisible for a while: the Python block in `.gitignore` has a
> `lib/` rule for build artefacts, git applies it at every depth, and it silently
> matched `frontend/lib/` too. It is negated now (`!frontend/lib/`) and
> `tests/test_repo_hygiene.py` fails if that negation is removed — so the files can
> be committed, but nobody has committed them yet.

## Implementation status

Honest status, so nobody has to guess what a demo can show. "Working" means the
code is in `main`, covered by tests, and returns real data.

| Area | Status |
| ---- | ------ |
| `GET /api/health` | **Working** |
| `POST /api/verify` — 3 checks, derived Trust Score, verdict, official links | **Working** |
| `company` check vs the local MCA snapshot (1.99M rows, `pg_trgm`) | **Working** — needs an imported snapshot; without one it stays `not_checked` |
| FSSAI **format** check (14 ASCII digits) | **Working** — a valid format is *not* a verified licence |
| `POST /api/scan` | **Working** — a photo runs the real pipeline and returns the 13 fields; with no file it still returns the honest `scan_id` + empty `fields` placeholder |
| OCR (`backend/ocr/*.py`) | **Working** — preprocess → Tesseract (PSM 6 vs 11) → field extraction, needs the Tesseract binary |
| Gemini Vision fallback | **Working** — runs on every scan when `GEMINI_API_KEY` is set and overrides OCR values the reader flagged uncertain; silently skipped without a key |
| Label-law rules (`docs/label_rules.md`) | **Not started** — `label_law` is still a `not_checked` placeholder, but every confirmed field is already forwarded to it |
| FSSAI / BIS registry lookups (Surepass) | **Not connected** — no credentials exist, so those checks stay `not_checked` and the API returns official portal links instead |
| Frontend PWA (`frontend/`) | **Builds and runs** — `frontend/lib/*` is committed, the UI is wired to the real API through Next rewrites, and `npm run smoke` checks every response against the contract |

## Setup

Four steps, in order: Python deps, the Tesseract binary, **your own Gemini API
key**, then the Node deps. A scan needs all four — Tesseract reads the text off
the photo and Gemini re-reads the same photo to correct it.

### 1. Python

```bash
# from the repo root
python3.11 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt     # runtime: backend API + OCR / vision stack
pip install -r requirements-dev.txt # tests / tooling
```

### 2. Tesseract (`eng` + `hin`)

The OCR pass shells out to the Tesseract binary, which is **not** a Python
package — install it separately.

```bash
winget install UB-Mannheim.TesseractOCR   # Windows
brew install tesseract tesseract-lang     # macOS
sudo apt install tesseract-ocr tesseract-ocr-hin   # Debian / Ubuntu
```

```bash
tesseract --list-langs   # must show: eng, hin
```

The Windows installer ships `eng` and `osd` only. If `hin` is missing, download
[`hin.traineddata`](https://github.com/tesseract-ocr/tessdata/raw/main/hin.traineddata)
into `C:\Program Files\Tesseract-OCR\tessdata\` (an admin prompt — that folder is
write-protected) and run `--list-langs` again.

### 3. Your own Gemini API key

```bash
cp .env.example .env
```

Open `.env` and put **your own** key in `GEMINI_API_KEY`. No key ships with this
repo and none is shared — get a free one at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) (sign in, *Create
API key*, copy it).

```ini
GEMINI_API_KEY=your-key-here
```

Paste the key with **no spaces and no quotes** around it. A stray leading space
is the single most common failure here, and it is invisible in an editor: the
Vision call then fails authentication, the fallback swallows the error by design,
and every field silently falls back to raw OCR — which looks like bad accuracy
rather than a bad key.

`.env` is git-ignored, so your key stays on your machine. The variables that
matter for a scan:

| Variable | Default | What it does |
| -------- | ------- | ------------ |
| `GEMINI_API_KEY` | *(none)* | Without it the Vision pass is skipped entirely and you get raw OCR values. The app still runs. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Override when Google retires the default. A retired model returns 404 and is swallowed like any other failure. |
| `TESSERACT_CMD` | `C:\Program Files\Tesseract-OCR\tesseract.exe` | Only needed when the binary is not on `PATH`. |

To confirm the key works before scanning anything:

```bash
python -c "from dotenv import load_dotenv; load_dotenv(); import os, google.generativeai as genai; genai.configure(api_key=os.environ['GEMINI_API_KEY']); print(genai.GenerativeModel(os.environ.get('GEMINI_MODEL','gemini-3.8-flash')).generate_content('Say OK').text)"
```

A printed `OK` means you are set. **Restart the API after editing `.env`** —
`load_dotenv` never overwrites a variable the running process already has, so a
corrected key is ignored until a full restart (uvicorn's auto-reload is not
enough).

## 4. Running the whole app (one command)

```bash
npm install                 # once, at the repo root (installs concurrently)
npm install --prefix frontend
npm run dev:all
```

That starts both halves with coloured prefixes - `[api]` on
<http://localhost:8000> and `[web]` on <http://localhost:3000> - and works
identically on Windows, macOS and Linux. The Python interpreter is resolved by
`scripts/dev-api.mjs` (`.venv\Scripts\python.exe` or `.venv/bin/python`), so
there is no separate Windows variant to remember.

Open <http://localhost:3000>. The frontend only ever calls relative `/api/...`
URLs, which `frontend/next.config.mjs` rewrites to `BACKEND_URL`
(default `http://localhost:8000`) - so the browser stays on one origin and never
needs a CORS preflight.

| Variable | Default | What it does |
| -------- | ------- | ------------ |
| `BACKEND_URL` | `http://localhost:8000` | Where the rewrites point. Server-side only. |
| `NEXT_PUBLIC_DATA_MODE` | `auto` | `auto` uses the API when `/api/health/db` answers and bundled fixtures otherwise; `live` and `mock` force one or the other. |
| `API_PORT` | `8000` | Port for uvicorn. |
| `API_RELOAD` | `1` | `0` drops uvicorn's watcher process - useful on a low-memory machine. |

### Scanning your first label

Open <http://localhost:3000>, photograph (or upload) any packaged product label
and let it run. A scan takes roughly **25–30 seconds**: the photo is
preprocessed, read by Tesseract, then read again by Gemini Vision, and the two
readings are merged. That second pass is why the wait is worth it — on a curved
or blurred pack, raw OCR routinely returns an MRP of `1.00` where the Vision
model reads `349.00`.

Nothing is auto-submitted. The review screen shows every field with its source
(`OCR`, `LLM` or `both`) and flags the uncertain ones with **Please check**, so
you confirm or correct the values before anything is verified. A field the pack
does not print should be left blank rather than guessed.

Without a `GEMINI_API_KEY` the app still scans — it just shows the raw OCR
values, which on a real-world photo are often wrong enough to need hand
correction on most fields.

### Smoke test

With both servers running:

```bash
npm run smoke
```

It POSTs every `samples/verify_request_*.json` and one image from
`data/test_labels/real/` **through the frontend** at `localhost:3000`, so the
rewrites, the ports and the multipart field name are all exercised. Each
response is parsed with the very same zod schemas the app uses
(`frontend/lib/contract.ts`, imported directly - Node strips the types), then
checked against the contract invariants a schema cannot express: three checks in
a fixed order, `score` and `checks_ran` agreeing, and `scan_id` echoed rather
than minted. It prints a pass/fail table and exits non-zero on any failure.

### If a build or dev server dies with "out of memory"

On a machine near its Windows commit limit, V8 aborts with
`Zone Allocation failed` while its heap is only tens of megabytes - the *OS* is
refusing the reservation, so raising `--max-old-space-size` makes it worse.
`frontend/scripts/build.mjs` and `frontend/scripts/dev.mjs` therefore cap the
heap (override with `BUILD_HEAP_MB` / `DEV_HEAP_MB`). If it still fails, close
some applications or enlarge the page file.

## The backend API

```bash
# on your own machine only
uvicorn backend.main:app --reload --port 8001

# or, reachable by teammates on the same Wi-Fi (binds every interface)
./.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8001
```

Swagger UI at <http://127.0.0.1:8001/docs>.

Binding `0.0.0.0` only makes the server *listen* everywhere - it does **not** let a
browser on another machine call it, because [`API_CONTRACT.md`](API_CONTRACT.md)'s
CORS list still has to name that page's origin. The dev origins are kept explicit
on purpose; `*` is never opened. See
[`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md) for the current LAN URL.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Liveness check. Frozen shape: `{"status":"ok","app":"Verify It"}`. |
| GET | `/health` | Liveness **plus** whether the registry database answers: `{"status":"ok","db":true\|false}`. Reached from the frontend as `/api/health/db`. |
| POST | `/api/scan` | Read a label photo, return the extracted fields. |
| POST | `/api/verify` | Confirmed fields → checks, score and official links. |

Every request/response shape, the field names and the `not_checked` semantics are
documented in [`API_CONTRACT.md`](API_CONTRACT.md).

Quick try:

```bash
curl -i http://127.0.0.1:8001/api/health

# verify with an empty body -> all checks not_checked
curl -i -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{}'

# scan (multipart)
curl -i -X POST http://127.0.0.1:8001/api/scan -F 'file=@label.jpg'
```

### Registry status — we are honest, always

The backend never calls a registry API. The `company` check reads a PostgreSQL
snapshot of the MCA *Company Master Data* register that the team imports itself:
your local database by default, or the team's shared Postgres via `DATABASE_URL`
(see [`MCA_SETUP.md`](MCA_SETUP.md)). With no snapshot — or no confident match —
it stays `not_checked`, and a company that is missing from the snapshot is
**never** reported as `fail`. FSSAI/BIS and Surepass are still placeholders; the
only other real signal is the deterministic FSSAI **format** check. No real or
fake registry data is ever invented.

The **Trust Score** obeys the same rule: it is computed only from the checks that
actually ran — a check that did not run is excluded, never counted as a zero — and
it is `null` (with `verdict: "not_checked"`) when nothing could run at all.
`checks_ran` travels with it so a partial score is never read as a whole-label
verdict. The formula is in
[`API_CONTRACT.md`](API_CONTRACT.md#the-trust-score).

Check the snapshot the check reads, in one command:

```bash
./.venv/bin/python scripts/check_registry.py
```

### Company registry snapshot (optional)

```bash
brew services start postgresql@16
createdb verifyit

./.venv/bin/python scripts/import_mca.py --file data/mca/company_master_data.csv --dry-run
./.venv/bin/python scripts/import_mca.py --file data/mca/company_master_data.csv --source-date 2026-03-31
```

Full instructions live in [`MCA_SETUP.md`](MCA_SETUP.md).

### Reading the Read track (Sunil's slice)

```python
from src.fields import extract
fields = extract(["path/to/label.jpg"])   # one or two photos (front/back)

from src.label_law import label_law_check
result = label_law_check(fields)
```

```bash
python -m src.evaluate   # accuracy summary + per-field report
```

## Tests

The suite runs against the real app (routing, validation and CORS middleware) and
needs no network access. The MCA tests use the local PostgreSQL snapshot and skip
themselves when it is not running.

```bash
./.venv/bin/python -m pytest
```

What it covers:

- `GET /api/health` payload.
- `POST /api/scan` with and without a file → placeholder, `fields: {}`.
- `POST /api/verify` contract shape, empty body, no body and partial body.
- FSSAI format: valid 14 ASCII digits → no flag and registry `not_checked`;
  13/15 digits, letters, whitespace and Unicode digits → `FSSAI_FORMAT_INVALID`.
- The MCA matcher: legal-suffix normalisation, exact-CIN and fuzzy-name matches,
  JSON-safe results and the snapshot counter. These run against an isolated
  *temporary* `companies` table seeded with synthetic fixtures, so the persistent
  table is never written to.
- The importer: header aliasing, date parsing, skip counters, `--limit` and a full
  dry run that never opens the database.
- Company-check policy: `pass` / `warn` / `not_checked` mapping, both MCA flag
  codes, and the invariant that the check is **never** `fail`.
- The trust score: derived from the checks that ran, `null` when none ran, the
  worst-flag credit, the verdict bands, and the rule that a high-severity flag is
  never played down by a healthy score.
- Official links and the "no invented fields" invariant.
- CORS: the dev origin is allowed, an unknown origin is not echoed.
- `samples/` fixtures match the live API exactly.

## Provider integration

All provider logic lives in `backend/providers.py` — it is the only place that
decides a check status and the only place that assembles flags. The `company` check
already resolves against the local MCA snapshot through `backend/mca.py` (data
access lives in `backend/db.py`, which degrades to "no information" when the
database is absent). When FSSAI/BIS/Surepass credentials or the OCR pipeline become
available, replace those `check_*` functions; the route handlers and schemas in
`backend/main.py` stay unchanged.

## CORS

The API allows requests from the frontend dev server at `http://localhost:3000`
and `http://127.0.0.1:3000`, plus any `http://` origin on a private network
(`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) on any port - that is what lets a
phone on the same Wi-Fi open the dev server without editing code every time the
network hands out a new IP. Only those RFC 1918 ranges match; a public address
still has to be added by hand, and `*` is never opened.

In practice the browser rarely needs any of this: the frontend calls relative
`/api/...` URLs that Next rewrites server-side, so requests reach the API from
the Next process rather than cross-origin from the page.

## Done means

- A real photo returns all 12+ fields with confidence + uncertain flags in <3s
  (<5s with the Gemini fallback).
- No crash on a blurry / empty / non-label image — returns empty fields with a
  clear error.
- 8 label-law rules, each with a pytest test and a Hindi + English message.
- `evaluate.py` produces: **≥90% fakes caught, ≤10% false alarms**.
- Each rule in `label_law.py` is traceable to the Legal Metrology text in
  `docs/label_rules.md`.

## License

Internal hackathon project.
