"""HTTP-level tests for the Verify It API (``backend.main``).

Uses FastAPI's ``TestClient`` so routing, validation and the CORS middleware are
exercised end to end. No network access is required.
"""

import pytest
from fastapi.testclient import TestClient

from backend import main, providers
from backend.main import app

client = TestClient(app)

#: The agreed response contract keys.
VERIFY_KEYS = {"scan_id", "checks", "score", "checks_ran", "verdict", "official_links"}
CHECK_IDS = ["company", "licence", "label_law"]


def test_health_ok() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "app": "Verify It"}


# --- GET /health (liveness + database) ---------------------------------------


def test_health_with_db_reports_the_database(monkeypatch: pytest.MonkeyPatch) -> None:
    """``db`` mirrors the registry probe, and the API stays ``ok`` either way."""
    monkeypatch.setattr(main.db, "is_available", lambda: True)
    assert client.get("/health").json() == {"status": "ok", "db": True}

    monkeypatch.setattr(main.db, "is_available", lambda: False)
    assert client.get("/health").json() == {"status": "ok", "db": False}


def test_health_with_db_survives_an_unreachable_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No database must never mean no health route - it degrades, not 500s."""
    monkeypatch.setattr(main.db, "is_available", lambda: False)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_api_health_stays_free_of_the_db_field() -> None:
    """The two routes answer different questions and must not merge.

    ``/api/health`` is compared byte for byte by ``tests/test_samples.py`` and by
    ``test_health_ok``; adding a key to it would break every frozen fixture.
    """
    assert "db" not in client.get("/api/health").json()


# --- POST /api/scan ---------------------------------------------------------


def test_scan_without_file_returns_placeholder() -> None:
    resp = client.post("/api/scan")
    assert resp.status_code == 200
    data = resp.json()
    assert set(data) == {"scan_id", "status", "reason", "fields"}
    assert isinstance(data["scan_id"], str)  # a real session id, not a hardcoded null
    assert data["scan_id"].startswith(providers.SCAN_ID_PREFIX)
    assert data["status"] == "not_checked"
    assert data["reason"] == "OCR pipeline not connected"
    assert data["fields"] == {}


def test_scan_with_image_returns_no_guessed_fields() -> None:
    """OCR runs on whatever is uploaded. Garbage bytes return a real response
    with all 13 fields defaulted to empty, but no field is *guessed* with
    a non-empty value. (Previously the placeholder returned ``fields: {}``
    with a fixed reason; the OCR pipeline is now wired so we always return
    a well-formed ScanResponse.)"""
    resp = client.post(
        "/api/scan",
        files={"file": ("label.jpg", b"\xff\xd8\xff\xe0not-a-real-jpeg", "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scan_id"].startswith("scan_")
    # Every API field is present and None — none was guessed.
    assert set(body["fields"].keys()) == {
        "manufacturer", "address", "pincode", "fssai", "bis_licence", "mrp",
        "net_qty", "mfg_date", "expiry", "customer_care", "cin", "gstin", "product_name",
    }
    for f in body["fields"].values():
        assert f["value"] is None


def test_verify_echoes_the_scan_id_from_the_scan() -> None:
    """The id minted by /api/scan survives the review round trip unchanged."""
    scan_id = client.post("/api/scan").json()["scan_id"]
    data = client.post("/api/verify", json={"scan_id": scan_id}).json()
    assert data["scan_id"] == scan_id
    # Echoing the id must not change any check: it is never a check input.
    assert all(c["status"] == "not_checked" for c in data["checks"])
    assert data["score"] is None
    assert data["checks_ran"] == 0


def test_verify_without_a_scan_id_stays_null() -> None:
    """A caller that never scanned (curl, tests) gets no invented id."""
    assert client.post("/api/verify", json={}).json()["scan_id"] is None


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
    assert data["checks_ran"] == 0
    assert data["verdict"] == "not_checked"
    assert data["official_links"] == []


def test_verify_without_body_is_accepted() -> None:
    resp = client.post("/api/verify")
    assert resp.status_code == 200
    assert resp.json()["verdict"] == "not_checked"


def test_verify_partial_body_still_keeps_label_law_pending_on_empty_fields() -> None:
    """A body that doesn't set any of label_law's inputs must keep
    label_law ``not_checked`` — *empty* fields mean "the user hasn't
    filled the form in yet", not "the label is missing them".

    ``manufacturer: "Placeholder Co"`` alone is enough for the label_law
    rules to evaluate: R1 (maker name) passes, the rest flag. The test
    is therefore "label_law reports the missing declarations" rather
    than "everything stays not_checked".
    """
    resp = client.post("/api/verify", json={"manufacturer": "Placeholder Co"})
    assert resp.status_code == 200
    data = resp.json()
    label_law = next(c for c in data["checks"] if c["id"] == "label_law")
    # R1 passes (manufacturer given) -> label_law is at least `warn`.
    assert label_law["status"] in {"warn", "fail"}
    # The other checks stay not_checked (no cin, no fssai).
    others = [c for c in data["checks"] if c["id"] != "label_law"]
    for c in others:
        assert c["status"] == "not_checked"


def test_verify_completely_empty_body_keeps_label_law_not_checked() -> None:
    """A truly empty body means "the user hasn't filled anything in" — even
    label_law should stay ``not_checked`` because no field is claimed."""
    resp = client.post("/api/verify", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert all(c["status"] == "not_checked" for c in data["checks"])


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


# --- Field forwarding (MOCKED: the label-law checker is stubbed) ---------------
#
# ``check_label_law`` is still a placeholder that returns ``not_checked`` whatever
# it is handed, so these tests assert the *wiring* only - which fields reach it -
# by replacing the checker and capturing its arguments. They say nothing about
# label-law rule behaviour, because there is no rule engine yet.

#: Every field the contract promises to forward, with a confirmed value.
FORWARDED_FIELDS = {
    "manufacturer": "Example Foods Pvt Ltd",
    "address": "12 Example Road, Mumbai",
    "pincode": "400001",
    "fssai": "10012022000123",
    "bis_licence": "CM/L-1234567890",
    "mrp": "50.00",
    "net_qty": "70 g",
    "mfg_date": "2026-01-01",
    "expiry": "2027-01-01",
    "customer_care": "1800-000-0000",
    "cin": "U15100MH2009PTC123456",
    "gstin": "27AAACR5055K1Z5",
    "product_name": "Example Namkeen",
}


def _capture_fields(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Stub ``check_label_law`` and return the dict of fields it was handed."""
    captured: dict = {}

    def _stub(*, fields: dict | None = None) -> dict:
        captured.update(fields or {})
        return {"id": "label_law", "status": "not_checked", "flags": []}

    monkeypatch.setattr(providers, "check_label_law", _stub)
    return captured


def test_verify_forwards_every_confirmed_field(monkeypatch: pytest.MonkeyPatch) -> None:
    """MRP, net quantity, dates, address and pincode all reach the checker."""
    captured = _capture_fields(monkeypatch)
    resp = client.post("/api/verify", json={**FORWARDED_FIELDS, "scan_id": "scan_abc"})
    assert resp.status_code == 200
    assert captured == FORWARDED_FIELDS  # every key, exactly the confirmed values
    assert "scan_id" not in captured  # a session id is not a label field


def test_verify_forwards_blank_fields_as_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """A field the user left blank still arrives - as ``None``.

    "The label does not print an MRP" is a Legal Metrology violation, so the rule
    engine has to be able to tell it apart from "the form was never filled in".
    """
    captured = _capture_fields(monkeypatch)
    client.post("/api/verify", json={"mrp": "50.00"})
    assert set(captured) == set(main.LABEL_FIELD_NAMES)
    assert captured["mrp"] == "50.00"
    assert captured["net_qty"] is None


def test_verify_forwards_blank_fields_when_the_body_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = _capture_fields(monkeypatch)
    client.post("/api/verify", json={})
    assert set(captured) == set(main.LABEL_FIELD_NAMES)
    assert all(value is None for value in captured.values())


def test_label_field_names_excludes_scan_id() -> None:
    """Guard the list itself: a session id must never look like a label field."""
    assert "scan_id" not in main.LABEL_FIELD_NAMES
    assert set(main.LABEL_FIELD_NAMES) == set(FORWARDED_FIELDS)


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


@pytest.mark.parametrize(
    "origin",
    [
        "http://192.168.1.14:3000",
        "http://10.0.0.5:3000",
        "http://172.17.21.35:3000",
    ],
)
def test_cors_allows_private_network_origins(origin: str) -> None:
    """A phone on the same Wi-Fi can reach the dev server without a code change.

    The IP changes with every network, so it is matched by range rather than
    listed - but only the RFC 1918 ranges, never ``*``.
    """
    resp = client.options(
        "/api/verify",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize(
    "origin",
    [
        "http://172.15.0.1:3000",  # just below the 172.16-31 private block
        "http://172.32.0.1:3000",  # just above it
        "http://8.8.8.8:3000",     # a public address
        "https://192.168.1.14",    # https is not what the dev server serves
    ],
)
def test_cors_rejects_public_lookalike_origins(origin: str) -> None:
    """The LAN regex must not leak past the private ranges it exists for."""
    resp = client.options(
        "/api/verify",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert resp.headers.get("access-control-allow-origin") != origin


def test_cors_does_not_allow_unknown_origin() -> None:
    resp = client.options(
        "/api/verify",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"
