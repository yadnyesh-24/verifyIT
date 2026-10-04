# Verify It

Backend for the **Verify It** hackathon project — a label-verification API.
This repository currently contains the **backend only**; the frontend and the
OCR workstream live with the other teammates.

> **Registry status.** The backend makes **no external network calls**. The
> `company` check reads a *local* PostgreSQL snapshot of the MCA *Company Master
> Data* register that the team imports itself (see **[`MCA_SETUP.md`](MCA_SETUP.md)**);
> with no snapshot - or no confident match - it stays `not_checked`, and a company
> missing from the snapshot is never reported as a failure. FSSAI/BIS, Surepass and
> the OCR pipeline are still placeholders. The only other real signal is the
> deterministic FSSAI **format** check. No real or fake registry data is ever
> invented.

## Stack

- Python 3.11
- FastAPI + Uvicorn
- pytest (tests)

## Project layout

```
verify-it/
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI app (routes, schemas, CORS)
│   ├── providers.py         # Provider / integration layer (the only policy)
│   ├── db.py                # PostgreSQL access (degrades safely when absent)
│   └── mca.py               # MCA Company Master Data matching (pg_trgm)
├── scripts/
│   └── import_mca.py        # CSV/ZIP export -> local `companies` snapshot
├── sql/
│   └── 001_companies.sql    # `companies` table + trigram index (idempotent)
├── tests/
│   ├── test_api.py          # HTTP-level tests (FastAPI TestClient)
│   ├── test_providers.py    # Unit tests for the provider layer
│   ├── test_mca.py          # MCA matcher, importer and company-check policy
│   └── test_samples.py      # Guards: samples/ must match the API
├── samples/                 # Frozen mock responses for the frontend
├── data/                    # Local registry exports (git-ignored)
├── conftest.py              # Makes `backend` importable from the repo root
├── pytest.ini               # pytest config (testpaths = tests)
├── requirements.txt         # Runtime dependencies
├── requirements-dev.txt     # Test / dev dependencies
├── API_CONTRACT.md          # Frontend-facing request/response contract
├── FRONTEND_HANDOFF.md      # Onboarding notes for the frontend teammate
├── MCA_SETUP.md             # How to import the MCA registry snapshot
├── .clinerules              # Cline project rules
├── .gitignore
└── README.md
```

## Setup

```bash
# from the project root (verify-it/)
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt        # runtime
pip install -r requirements-dev.txt    # tests / tooling
```

> Windows: activate with `.venv\Scripts\activate`.

### Company registry snapshot (optional)

The `company` check stays an honest `not_checked` until you import a snapshot:

```bash
brew services start postgresql@16
createdb verifyit
./.venv/bin/python scripts/import_mca.py --file data/mca/company_master_data.csv
```

Full instructions — where to download the MCA export, the flags, how to verify —
are in **[`MCA_SETUP.md`](MCA_SETUP.md)**. The API never calls out to the network:
it reads the snapshot locally, and a missing snapshot or a missing match simply
leaves the check `not_checked`.

## Run the server

```bash
uvicorn backend.main:app --reload --port 8001
```

The API is available at <http://127.0.0.1:8001> (Swagger UI at `/docs`).

## Endpoints

| Method | Path          | Description                                            |
| ------ | ------------- | ------------------------------------------------------ |
| GET    | `/api/health` | Liveness check used by the frontend.                   |
| POST   | `/api/scan`   | Read a label photo and return the extracted fields.    |
| POST   | `/api/verify` | Confirmed fields -> checks, score and official links.  |

Every request/response shape, the field names and the `not_checked` semantics
are documented in **[`API_CONTRACT.md`](API_CONTRACT.md)**, with frozen mock
responses in **[`samples/`](samples/)**.

**Quick try:**

```bash
# liveness
curl -i http://127.0.0.1:8001/api/health

# verify with an empty body -> all checks not_checked
curl -i -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{}'

# valid FSSAI *format* -> no flag, registry still not_checked
curl -i -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"fssai":"10012022000123"}'

# invalid FSSAI format -> licence check gets an FSSAI_FORMAT_INVALID flag
curl -i -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"fssai":"123"}'

# scan (multipart)
curl -i -X POST http://127.0.0.1:8001/api/scan -F 'file=@label.jpg'
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
- `POST /api/scan` with and without a file -> placeholder, `fields: {}`.
- `POST /api/verify` contract shape, empty body, no body and partial body.
- FSSAI format: valid 14 ASCII digits -> **no flag** and registry `not_checked`;
  13/15 digits, letters, whitespace and Unicode digits -> `FSSAI_FORMAT_INVALID`.
- The MCA matcher: legal-suffix normalisation, exact-CIN and fuzzy-name matches,
  JSON-safe results and the snapshot counter. These run against an isolated
  *temporary* `companies` table seeded with synthetic fixtures, so the persistent
  table is never written to.
- The importer: header aliasing, date parsing, skip counters, `--limit` and a full
  dry run that never opens the database.
- Company-check policy: `pass` / `warn` / `not_checked` mapping, both MCA flag
  codes, and the invariant that the check is **never** `fail`.
- Official links and the "no invented fields" invariant.
- CORS: the dev origin is allowed, an unknown origin is not echoed.
- `samples/` fixtures match the live API exactly.

## Provider integration

All provider logic lives in `backend/providers.py` - it is the only place that
decides a check status, and the only place that assembles flags. The `company`
check already resolves against the local MCA snapshot through `backend/mca.py`
(data access lives in `backend/db.py`, which degrades to "no information" when the
database is absent). When FSSAI/BIS/Surepass credentials or the OCR pipeline become
available, replace those `check_*` functions; the route handlers and schemas in
`backend/main.py` stay unchanged.

## CORS

The API allows requests from the frontend dev server at `http://localhost:3000`
and `http://127.0.0.1:3000`.
