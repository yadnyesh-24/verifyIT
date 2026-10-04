# Verify It

Backend for the **Verify It** hackathon project — a label-verification API.
This repository currently contains the **backend only**; the frontend and the
OCR workstream live with the other teammates.

> **Registry status.** No registry provider (company/CIN, FSSAI, BIS, Surepass)
> and no OCR pipeline is connected yet, and the backend makes **no external
> network calls**. Every check therefore returns an honest `not_checked`
> placeholder so the response contract stays stable for the frontend. No real or
> fake registry data is ever returned.

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
│   └── providers.py         # Provider / integration layer (placeholders)
├── tests/
│   ├── test_api.py          # HTTP-level tests (FastAPI TestClient)
│   ├── test_providers.py    # Unit tests for the provider layer
│   └── test_samples.py      # Guards: samples/ must match the API
├── samples/                 # Frozen mock responses for the frontend
├── conftest.py              # Makes `backend` importable from the repo root
├── pytest.ini               # pytest config (testpaths = tests)
├── requirements.txt         # Runtime dependencies
├── requirements-dev.txt     # Test / dev dependencies
├── API_CONTRACT.md          # Frontend-facing request/response contract
├── FRONTEND_HANDOFF.md      # Onboarding notes for the frontend teammate
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
needs no network access.

```bash
./.venv/bin/python -m pytest
```

What it covers:

- `GET /api/health` payload.
- `POST /api/scan` with and without a file -> placeholder, `fields: {}`.
- `POST /api/verify` contract shape, empty body, no body and partial body.
- FSSAI format: valid 14 ASCII digits -> **no flag** and registry `not_checked`;
  13/15 digits, letters, whitespace and Unicode digits -> `FSSAI_FORMAT_INVALID`.
- Official links and the "no invented fields" invariant.
- CORS: the dev origin is allowed, an unknown origin is not echoed.
- `samples/` fixtures match the live API exactly.

## Provider integration

All provider logic lives in `backend/providers.py`. When credentials/endpoints
(or the OCR pipeline) are available, replace the `check_*` functions there; the
route handlers and schemas in `backend/main.py` stay unchanged.

## CORS

The API allows requests from the frontend dev server at `http://localhost:3000`
and `http://127.0.0.1:3000`.
