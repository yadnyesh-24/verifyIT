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


def _load(name: str) -> object:
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


def test_scan_sample_matches_api() -> None:
    assert client.post("/api/scan").json() == _load("scan_response.json")


def test_verify_empty_sample_matches_api() -> None:
    assert client.post("/api/verify", json={}).json() == _load("verify_response_empty.json")


def test_verify_fssai_valid_sample_matches_api() -> None:
    resp = client.post("/api/verify", json={"fssai": "10012022000123"})
    assert resp.json() == _load("verify_response_fssai_valid.json")


def test_verify_fssai_invalid_sample_matches_api() -> None:
    resp = client.post("/api/verify", json={"fssai": "123"})
    assert resp.json() == _load("verify_response_fssai_invalid.json")
