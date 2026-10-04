"""HTTP-level tests for the Verify It API (``backend.main``).

Uses FastAPI's ``TestClient`` so routing, validation and the CORS middleware are
exercised end to end. No network access is required.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

#: The agreed response contract keys.
VERIFY_KEYS = {"scan_id", "checks", "score", "verdict", "official_links"}
CHECK_IDS = ["company", "licence", "label_law"]


def test_health_ok() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "app": "Verify It"}


# --- POST /api/scan ---------------------------------------------------------


def test_scan_without_file_returns_placeholder() -> None:
    resp = client.post("/api/scan")
    assert resp.status_code == 200
    data = resp.json()
    assert set(data) == {"scan_id", "status", "reason", "fields"}
    assert data["scan_id"] is None
    assert data["status"] == "not_checked"
    assert data["reason"] == "OCR pipeline not connected"
    assert data["fields"] == {}


def test_scan_with_image_returns_no_guessed_fields() -> None:
    resp = client.post(
        "/api/scan",
        files={"file": ("label.jpg", b"\xff\xd8\xff\xe0not-a-real-jpeg", "image/jpeg")},
    )
    assert resp.status_code == 200
    assert resp.json()["fields"] == {}


# --- POST /api/verify -------------------------------------------------------


def test_verify_empty_body_contract() -> None:
    resp = client.post("/api/verify", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert set(data) == VERIFY_KEYS
    assert [c["id"] for c in data["checks"]] == CHECK_IDS
    assert all(c["status"] == "not_checked" for c in data["checks"])
    assert all(c["flags"] == [] for c in data["checks"])
    assert data["scan_id"] is None
    assert data["score"] is None
    assert data["verdict"] == "not_checked"
    assert data["official_links"] == []


def test_verify_without_body_is_accepted() -> None:
    resp = client.post("/api/verify")
    assert resp.status_code == 200
    assert resp.json()["verdict"] == "not_checked"


def test_verify_partial_body_stays_pending() -> None:
    resp = client.post("/api/verify", json={"manufacturer": "Placeholder Co"})
    assert resp.status_code == 200
    assert all(c["status"] == "not_checked" for c in resp.json()["checks"])


def test_verify_valid_fssai_format_is_not_a_licence_check() -> None:
    resp = client.post("/api/verify", json={"fssai": "10012022000123"})
    assert resp.status_code == 200
    data = resp.json()
    licence = next(c for c in data["checks"] if c["id"] == "licence")
    assert licence["status"] == "not_checked"  # format valid != licence verified
    assert licence["flags"] == []
    assert data["official_links"] == [
        {
            "label": "Verify FSSAI licence",
            "url": "https://foscos.fssai.gov.in/",
            "copy": "10012022000123",
        }
    ]


def test_verify_invalid_fssai_format_flags_a_warning() -> None:
    resp = client.post("/api/verify", json={"fssai": "123"})
    assert resp.status_code == 200
    licence = next(c for c in resp.json()["checks"] if c["id"] == "licence")
    assert licence["status"] == "warn"
    flag = licence["flags"][0]
    assert flag["code"] == "FSSAI_FORMAT_INVALID"
    assert flag["en"] and flag["hi"]


@pytest.mark.parametrize(
    "bad", ["123", "1234567890123", "123456789012345", "1234567890123a"]
)
def test_verify_invalid_fssai_variants_flag(bad: str) -> None:
    licence = next(
        c
        for c in client.post("/api/verify", json={"fssai": bad}).json()["checks"]
        if c["id"] == "licence"
    )
    assert licence["flags"][0]["code"] == "FSSAI_FORMAT_INVALID"


def test_verify_unicode_digits_are_rejected() -> None:
    unicode_digits = (
        "\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u0660\u0661\u0662\u0663\u0664"
    )
    licence = next(
        c
        for c in client.post("/api/verify", json={"fssai": unicode_digits}).json()["checks"]
        if c["id"] == "licence"
    )
    assert licence["flags"][0]["code"] == "FSSAI_FORMAT_INVALID"


def test_verify_response_has_no_invented_fields() -> None:
    """No ``licence_valid`` / ``trust_score`` - we never invent registry verdicts."""
    body = client.post(
        "/api/verify", json={"manufacturer": "X", "fssai": "10012022000123"}
    ).text
    assert "licence_valid" not in body
    assert "trust_score" not in body
    assert "\"pass\"" not in body  # nothing is asserted as passing without a registry


# --- CORS -------------------------------------------------------------------


def test_cors_allows_frontend_dev_origin() -> None:
    resp = client.options(
        "/api/verify",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_does_not_allow_unknown_origin() -> None:
    resp = client.options(
        "/api/verify",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"
