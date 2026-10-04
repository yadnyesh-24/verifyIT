"""Guard: the frozen sample fixtures must match what the API returns.

Yadnyesh builds the whole frontend against ``samples/`` - if the API and the
samples drift apart, this test fails. Keep them in sync.
"""

import json
import pathlib

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
SAMPLES = pathlib.Path(__file__).resolve().parent.parent / "samples"

#: ``/api/scan`` mints a fresh session id on every call, so ``scan_response.json``
#: cannot hold a literal value. It documents the shape with this placeholder, and
#: ``test_scan_sample_matches_api`` normalises the live id before comparing.
GENERATED_SCAN_ID = "<generated>"

#: A scan id used by the echo test - deliberately a fixed value so the fixture can
#: be compared byte for byte.
ECHOED_SCAN_ID = "scan_0123456789abcdef0123456789abcdef"


def _load(name: str) -> object:
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


def test_scan_sample_matches_api() -> None:
    """Everything except the freshly minted ``scan_id`` must match exactly."""
    body = client.post("/api/scan").json()
    assert body["scan_id"] != GENERATED_SCAN_ID  # it is really generated
    assert {**body, "scan_id": GENERATED_SCAN_ID} == _load("scan_response.json")


def test_scan_id_is_minted_per_call() -> None:
    """Each scan is its own session - the ids must not repeat."""
    first = client.post("/api/scan").json()["scan_id"]
    second = client.post("/api/scan").json()["scan_id"]
    assert first.startswith("scan_")
    assert first != second


def test_verify_empty_sample_matches_api() -> None:
    assert client.post("/api/verify", json={}).json() == _load("verify_response_empty.json")


def test_verify_fssai_valid_sample_matches_api() -> None:
    resp = client.post("/api/verify", json={"fssai": "10012022000123"})
    assert resp.json() == _load("verify_response_fssai_valid.json")


def test_verify_fssai_invalid_sample_matches_api() -> None:
    resp = client.post("/api/verify", json={"fssai": "123"})
    assert resp.json() == _load("verify_response_fssai_invalid.json")


def test_verify_scan_id_echo_sample_matches_api() -> None:
    """The scan id handed back by the review screen is returned unchanged."""
    resp = client.post("/api/verify", json={"scan_id": ECHOED_SCAN_ID})
    assert resp.json() == _load("verify_response_scan_id_echo.json")
