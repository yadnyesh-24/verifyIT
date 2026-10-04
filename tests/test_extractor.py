"""Unit tests for backend.ocr.extractor — name mapping + glue ``extract``."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO))

from backend.ocr import extractor  # noqa: E402


# --------------------------------------------------------------------------- #
# Name mapping
# --------------------------------------------------------------------------- #

def test_to_api_fields_drops_internal_only_keys():
    scan = {
        "manufacturer_name": {"value": "Acme", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "is_number": {"value": "1234", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "marketed_by_name": {"value": "X", "confidence": 0.9, "uncertain": False, "source": "ocr"},
    }
    out = extractor._to_api_fields(scan)
    assert "manufacturer" in out
    assert "is_number" not in out
    assert "marketed_by_name" not in out
    assert out["manufacturer"]["value"] == "Acme"
    assert out["manufacturer"]["source"] == "ocr"


def test_to_api_fields_renames_every_internal_key():
    scan = {
        "manufacturer_name": {"value": "A", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "manufacturer_address": {"value": "X", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "net_quantity": {"value": "100 g", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "expiry_or_best_before": {"value": "Aug-27", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "bis_cml": {"value": "1234", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "fssai": {"value": "10012022000123", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "cin": {"value": "U15100MH2009PTC123456", "confidence": 0.9, "uncertain": False, "source": "ocr"},
        "gstin": {"value": "27AAPFU0939F1Z5", "confidence": 0.9, "uncertain": False, "source": "ocr"},
    }
    out = extractor._to_api_fields(scan)
    assert out["net_qty"]["value"] == "100 g"
    assert out["expiry"]["value"] == "Aug-27"
    assert out["bis_licence"]["value"] == "1234"


def test_to_api_fields_preserves_explicit_empty_string():
    """An empty-string value is kept (it's not the same as ``None``);
    ``None`` is treated as "not present" and replaced with the default."""
    scan = {
        "manufacturer_name": {"value": "", "confidence": 0.0, "uncertain": False, "source": "ocr"},
    }
    out = extractor._to_api_fields(scan)
    # value="" is kept (different from value=None, which would be dropped).
    assert out["manufacturer"]["value"] == ""
    assert out["manufacturer"]["source"] == "ocr"


def test_to_api_fields_drops_none_value():
    """``value=None`` is treated as "not present" — the default empty field stays."""
    scan = {
        "manufacturer_name": {"value": None, "confidence": 0.0, "uncertain": False, "source": "ocr"},
    }
    out = extractor._to_api_fields(scan)
    # value=None is dropped, so the default empty field is what remains.
    assert out["manufacturer"]["value"] is None
    assert out["manufacturer"]["source"] is None


def test_to_api_fields_initialises_all_api_keys():
    out = extractor._to_api_fields({})
    for key in extractor.API_FIELDS:
        assert key in out
        assert out[key]["value"] is None


def test_to_internal_fields_roundtrips_names():
    api = {
        "manufacturer": "Acme",
        "address": "Plot 21, MIDC",
        "net_qty": "100 g",
        "expiry": "Aug-27",
        "bis_licence": "1234",
        "fssai": "10012022000123",
    }
    out = extractor._to_internal_fields(api)
    assert out["manufacturer_name"]["value"] == "Acme"
    assert out["manufacturer_address"]["value"] == "Plot 21, MIDC"
    assert out["net_quantity"]["value"] == "100 g"
    assert out["expiry_or_best_before"]["value"] == "Aug-27"
    assert out["bis_cml"]["value"] == "1234"


def test_to_internal_fields_skips_empty_values():
    out = extractor._to_internal_fields({"manufacturer": "", "fssai": "10012022000123"})
    assert "manufacturer_name" not in out
    assert "fssai" in out


def test_to_internal_fields_skips_scan_id():
    out = extractor._to_internal_fields({"scan_id": "scan_abc", "fssai": "10012022000123"})
    assert "scan_id" not in out
    assert "fssai" in out


# --------------------------------------------------------------------------- #
# new_scan_id
# --------------------------------------------------------------------------- #

def test_new_scan_id_format():
    sid = extractor.new_scan_id()
    assert sid.startswith("scan_")
    assert len(sid) == len("scan_") + 32  # uuid4 hex


def test_new_scan_id_is_unique():
    a = extractor.new_scan_id()
    b = extractor.new_scan_id()
    assert a != b


# --------------------------------------------------------------------------- #
# extract() — error paths
# --------------------------------------------------------------------------- #

def test_extract_returns_not_checked_when_file_missing(tmp_path: Path):
    result = extractor.extract(tmp_path / "does-not-exist.jpg")
    assert result["status"] == "not_checked"
    assert "not found" in result["reason"]
    assert result["scan_id"].startswith("scan_")
    # Every API field is present as an empty default.
    for f in extractor.API_FIELDS:
        assert f in result["fields"]
        assert result["fields"][f]["value"] is None


def test_extract_uses_provided_scan_id(tmp_path: Path):
    result = extractor.extract(tmp_path / "nope.jpg", scan_id="scan_abc")
    assert result["scan_id"] == "scan_abc"


# --------------------------------------------------------------------------- #
# extract() — end-to-end with a real label
# --------------------------------------------------------------------------- #

def test_extract_end_to_end_on_real_label():
    """Smoke test: run the full pipeline on a real photo, expect at least
    a non-empty scan_id and a fields dict (may be empty on hard shots)."""
    label = Path(r"D:\VerifyIT\data\test_labels\real\1.jpeg")
    if not label.exists():
        pytest.skip("real label not available in this checkout")
    result = extractor.extract(label, lang="eng")  # avoid Hindi model dep
    assert result["scan_id"].startswith("scan_")
    assert "fields" in result
    assert set(result["fields"].keys()) == set(extractor.API_FIELDS)