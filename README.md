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
│  └─ lib/                      # types, i18n (en+hi), api client, mocks, session store
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
> `docs/label_rules.md`, `data/reference/*`, `data/ground_truth.csv` and the
> captured photos in `data/test_labels/`. The frontend now lives in `frontend/`
> and is already in `main`. Everything else shown above is already in `main`.

## Implementation status

Honest status, so nobody has to guess what a demo can show. "Working" means the
code is in `main`, covered by tests, and returns real data.

| Area | Status |
| ---- | ------ |
| `GET /api/health` | **Working** |
| `POST /api/verify` — 3 checks, derived Trust Score, verdict, official links | **Working** |
| `company` check vs the local MCA snapshot (1.99M rows, `pg_trgm`) | **Working** — needs an imported snapshot; without one it stays `not_checked` |
| FSSAI **format** check (14 ASCII digits) | **Working** — a valid format is *not* a verified licence |
| `POST /api/scan` | **Partial** — returns a real `scan_id` and an honest empty `fields` map; the OCR pipeline is not connected |
| OCR (`src/*.py`) | **Not started** — no modules committed yet |
| Label-law rules (`docs/label_rules.md`) | **Not started** — `label_law` is still a `not_checked` placeholder, but every confirmed field is already forwarded to it |
| FSSAI / BIS registry lookups (Surepass) | **Not connected** — no credentials exist, so those checks stay `not_checked` and the API returns official portal links instead |
| Frontend PWA (`frontend/`) | **Builds**; run it against the API, or with mock fixtures for an offline demo |

## Setup

```bash
# from the repo root
python3.11 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt     # runtime: backend API + OCR / vision stack
pip install -r requirements-dev.txt # tests / tooling
cp .env.example .env                # then fill in GEMINI_API_KEY etc.
```

Tesseract (with `eng` + `hin`) is only needed for the OCR track:

```bash
tesseract --list-langs   # must show: eng, hin
```

## The backend API

```bash
uvicorn backend.main:app --reload --port 8001
```

Swagger UI at <http://127.0.0.1:8001/docs>.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Liveness check used by the frontend. |
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
and `http://127.0.0.1:3000`.

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
