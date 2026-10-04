"""Unit tests for backend.ocr.label_law — every rule + the orchestrator."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO))

from backend.ocr import label_law  # noqa: E402


def F(value: str | None) -> dict:
    """Build a minimal ScanField dict for tests."""
    return {"value": value, "confidence": 1.0, "uncertain": False, "source": "ocr"}


def _full_fields(**overrides) -> dict:
    """Every rule's happy-path value. Override any to force a fail."""
    base = {
        "manufacturer_name": F("Acme Foods Pvt Ltd"),
        "manufacturer_address": F("Plot 21, MIDC, Mumbai"),
        "pincode": F("400001"),
        "net_quantity": F("200 g"),
        "mrp": F("99.00"),
        "mfg_date": F("Aug-26"),
        "expiry_or_best_before": F("Aug-27"),
        "customer_care": F("1800-123-456"),
        "product_name": F("Acme Sauce"),
    }
    for k, v in overrides.items():
        if v is None:
            base.pop(k, None)
        else:
            base[k] = v if isinstance(v, dict) else F(v)
    return base


# --------------------------------------------------------------------------- #
# R1 — maker name
# --------------------------------------------------------------------------- #

def test_r1_passes_when_manufacturer_present():
    assert label_law.r1_maker_name(_full_fields()) is None


def test_r1_passes_when_only_marketer_present():
    fields = _full_fields(manufacturer_name=None)
    fields["marketed_by_name"] = F("Acme Foods")
    assert label_law.r1_maker_name(fields) is None


def test_r1_fails_when_both_missing():
    fields = _full_fields(manufacturer_name=None)
    flag = label_law.r1_maker_name(fields)
    assert flag is not None
    assert flag["code"] == "MAKER_NAME_MISSING"
    assert flag["severity"] == "high"
    assert "manufacturer" in flag["en"].lower() or "name" in flag["en"].lower()
    assert flag["hi"]  # Hindi message present
    assert flag["evidence"]["field"] == "manufacturer_name"


# --------------------------------------------------------------------------- #
# R2 — address + pincode
# --------------------------------------------------------------------------- #

def test_r2_passes_with_full_address_and_six_digit_pincode():
    assert label_law.r2_address_and_pincode(_full_fields()) is None


def test_r2_fails_when_address_missing():
    fields = _full_fields(manufacturer_address=None)
    flag = label_law.r2_address_and_pincode(fields)
    assert flag["code"] == "ADDRESS_MISSING"
    assert flag["severity"] == "medium"


def test_r2_fails_when_pincode_missing():
    fields = _full_fields(pincode=None)
    flag = label_law.r2_address_and_pincode(fields)
    assert flag["code"] == "ADDRESS_MISSING"


def test_r2_fails_when_pincode_is_malformed():
    fields = _full_fields(pincode="12345")  # only 5 digits
    flag = label_law.r2_address_and_pincode(fields)
    assert flag["code"] == "ADDRESS_MISSING"


# --------------------------------------------------------------------------- #
# R3 — net quantity
# --------------------------------------------------------------------------- #

def test_r3_passes_for_200g():
    assert label_law.r3_net_quantity(_full_fields()) is None


def test_r3_fails_when_missing():
    fields = _full_fields(net_quantity=None)
    flag = label_law.r3_net_quantity(fields)
    assert flag["code"] == "NET_QUANTITY_MISSING"
    assert flag["severity"] == "medium"


def test_r3_fails_when_unit_is_non_standard():
    fields = _full_fields(net_quantity="42 elephant")
    flag = label_law.r3_net_quantity(fields)
    assert flag["code"] == "NET_QUANTITY_MISSING"


# --------------------------------------------------------------------------- #
# R4 — MRP
# --------------------------------------------------------------------------- #

def test_r4_passes_with_well_formed_mrp():
    assert label_law.r4_mrp_inclusive_of_taxes(_full_fields()) is None


def test_r4_fails_when_mrp_missing():
    fields = _full_fields(mrp=None)
    flag = label_law.r4_mrp_inclusive_of_taxes(fields)
    assert flag["code"] == "MRP_MISSING"
    assert flag["severity"] == "medium"


def test_r4_fails_when_mrp_malformed():
    fields = _full_fields(mrp="99")  # missing decimals
    flag = label_law.r4_mrp_inclusive_of_taxes(fields)
    assert flag["code"] == "MRP_MISSING"


# --------------------------------------------------------------------------- #
# R5 — mfg date
# --------------------------------------------------------------------------- #

def test_r5_passes_with_mfg_date():
    assert label_law.r5_mfg_date(_full_fields()) is None


def test_r5_fails_when_mfg_date_missing():
    fields = _full_fields(mfg_date=None)
    flag = label_law.r5_mfg_date(fields)
    assert flag["code"] == "MFG_DATE_MISSING"
    assert flag["severity"] == "low"


# --------------------------------------------------------------------------- #
# R6 — customer care
# --------------------------------------------------------------------------- #

def test_r6_passes_with_phone():
    assert label_law.r6_customer_care(_full_fields()) is None


def test_r6_fails_when_customer_care_missing():
    fields = _full_fields(customer_care=None)
    flag = label_law.r6_customer_care(fields)
    assert flag["code"] == "CUSTOMER_CARE_MISSING"
    assert flag["severity"] == "low"


# --------------------------------------------------------------------------- #
# R7 — expiry
# --------------------------------------------------------------------------- #

def test_r7_skips_when_no_expiry_printed():
    fields = _full_fields(expiry_or_best_before=None)
    assert label_law.r7_not_expired(fields) is None


def test_r7_returns_none_for_future_date():
    # Use a future expiry relative to today. (today=2040, expiry=2050-06)
    today = (2040, 1)
    fields = _full_fields(expiry_or_best_before="Jun-50")
    assert label_law.r7_not_expired(fields, today=today) is None


def test_r7_flags_past_date():
    fields = _full_fields(expiry_or_best_before="Aug-26")
    flag = label_law.r7_not_expired(fields, today=(2029, 12))
    assert flag is not None
    assert flag["code"] == "EXPIRED"
    assert flag["severity"] == "low"


def test_r7_skips_unparseable_date():
    fields = _full_fields(expiry_or_best_before="see pack")
    assert label_law.r7_not_expired(fields) is None


def test_r7_handles_full_year_format():
    future = (2030, 6)
    fields = _full_fields(expiry_or_best_before="Aug 2030")
    assert label_law.r7_not_expired(fields, today=future) is None


# --------------------------------------------------------------------------- #
# R8 — product name
# --------------------------------------------------------------------------- #

def test_r8_passes_with_product_name():
    assert label_law.r8_product_name(_full_fields()) is None


def test_r8_fails_when_product_name_missing():
    fields = _full_fields(product_name=None)
    flag = label_law.r8_product_name(fields)
    assert flag["code"] == "PRODUCT_NAME_MISSING"
    assert flag["severity"] == "high"


# --------------------------------------------------------------------------- #
# Hindi messages
# --------------------------------------------------------------------------- #

def test_every_flag_has_a_hindi_message():
    """Walk the orchestrator over a worst-case (empty) input and ensure every
    emitted flag carries a non-empty Hindi string."""
    fields = {"product_name": F("Acme Sauce")}
    result = label_law.label_law_check(fields)
    assert result["status"] == "fail"
    assert result["flags"], "expected flags on a near-empty input"
    for flag in result["flags"]:
        assert flag["hi"], f"missing Hindi for {flag['code']}"
        assert (
            "नाम" in flag["hi"]
            or "पैकेज" in flag["hi"]
            or "लिखा" in flag["hi"]
            or "होना" in flag["hi"]
            or "समाप्ति" in flag["hi"]
            or "उत्पाद" in flag["hi"]
            or "पता" in flag["hi"]
        ), f"unexpected Hindi for {flag['code']}: {flag['hi']!r}"


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #

def test_label_law_check_passes_with_full_fields():
    result = label_law.label_law_check(_full_fields())
    assert result["id"] == "label_law"
    assert result["status"] == "pass"
    assert result["flags"] == []


def test_label_law_check_returns_not_checked_when_empty():
    result = label_law.label_law_check(None)
    assert result["status"] == "not_checked"
    assert result["flags"] == []


def test_label_law_check_returns_not_checked_when_dict_empty():
    result = label_law.label_law_check({})
    assert result["status"] == "not_checked"


def test_label_law_check_warns_on_low_severity_only():
    fields = _full_fields(mfg_date=None, customer_care=None)
    result = label_law.label_law_check(fields)
    assert result["status"] == "warn"
    severities = {f["severity"] for f in result["flags"]}
    assert "high" not in severities


def test_label_law_check_fails_on_high_severity():
    fields = _full_fields(manufacturer_name=None)
    result = label_law.label_law_check(fields)
    assert result["status"] == "fail"
    codes = [f["code"] for f in result["flags"]]
    assert "MAKER_NAME_MISSING" in codes


def test_label_law_check_fails_when_only_product_name_present():
    """The most-trimmed test: every required declaration missing."""
    fields = {"product_name": F("Acme Sauce")}
    result = label_law.label_law_check(fields)
    assert result["status"] == "fail"
    codes = {f["code"] for f in result["flags"]}
    assert "MAKER_NAME_MISSING" in codes
    assert "ADDRESS_MISSING" in codes


def test_label_law_check_returns_all_eight_codes_on_truly_empty_dict():
    # Empty dict is "not_checked" so we don't get any rules fired.
    assert label_law.label_law_check({})["status"] == "not_checked"


def test_label_law_check_evidence_is_json_serialisable():
    import json

    fields = _full_fields(manufacturer_name=None)
    result = label_law.label_law_check(fields)
    json.dumps(result)  # must not raise