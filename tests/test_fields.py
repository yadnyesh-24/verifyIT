"""Unit tests for backend.ocr.fields — pure helpers + candidate scoring + extract()."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO))

from backend.ocr import fields  # noqa: E402
from backend.ocr.ocr import Line, Word  # noqa: E402


def _line(text: str, conf: float = 0.9) -> Line:
    return Line(text=text, conf=conf, bbox=(0, 0, 100, 20), words=[
        Word(text=text, conf=conf, bbox=(0, 0, 100, 20), block=1, par=1, line=1)
    ])


# --------------------------------------------------------------------------- #
# Format-only extractors
# --------------------------------------------------------------------------- #

def test_extract_fssai_finds_14_digits():
    assert fields.extract_fssai("FSSAI Lic No 10012022000123") == "10012022000123"


def test_extract_fssai_ignores_other_lengths():
    assert fields.extract_fssai("pincode 1100601") is None
    assert fields.extract_fssai("phone 1234567890") is None


def test_extract_fssai_rejects_unicode_digits():
    arabic_14 = "١" * 14
    assert fields.extract_fssai(arabic_14) is None


def test_extract_pincode_finds_6_digits():
    assert fields.extract_pincode("New Delhi 110001 India") == "110001"


def test_extract_pincode_ignores_within_longer_digit_run():
    # The 6-digit run inside a 14-digit FSSAI number must NOT match as pincode.
    assert fields.extract_pincode("10012022000123") is None


def test_extract_mrp_normalises_to_two_decimals():
    assert fields.extract_mrp("MRP Rs. 40/-") == "40.00"
    assert fields.extract_mrp("₹39.85") == "39.85"
    assert fields.extract_mrp("MRP 100") == "100.00"


def test_extract_mrp_returns_none_without_digits():
    assert fields.extract_mrp("see price tag") is None


def test_extract_net_quantity_captures_value_and_unit():
    assert fields.extract_net_quantity("Net wt. 100 g") == "100g"
    assert fields.extract_net_quantity("1 N") == "1N"
    assert fields.extract_net_quantity("200ml") == "200ml"


def test_extract_bis_cml_finds_is_number():
    assert fields.extract_bis_cml("IS 1234") == "1234"
    assert fields.extract_bis_cml("BIS CML-1234567") == "1234567"


def test_extract_cin_matches_standard_pattern():
    assert fields.extract_cin("U15100MH2009PTC123456") == "U15100MH2009PTC123456"


def test_extract_gstin_matches_standard_pattern():
    assert fields.extract_gstin("27AAPFU0939F1Z5") == "27AAPFU0939F1Z5"


def test_extract_customer_care_strips_formatting():
    assert fields.extract_customer_care("+91 73407-58758") == "917340758758"
    assert fields.extract_customer_care("1800-123-456") == "1800123456"


def test_extract_customer_care_rejects_short_numbers():
    assert fields.extract_customer_care("123") is None


def test_extract_date_finds_month_year_formats():
    assert fields.extract_date("Aug-26") == "Aug-26"
    assert fields.extract_date("08/2024") == "08/2024"


def test_extract_best_before_finds_durations():
    assert fields.extract_best_before("Best before 12 months") == "12 months"


# --------------------------------------------------------------------------- #
# Anchors + candidate scoring
# --------------------------------------------------------------------------- #

def test_anchor_line_score_matches_prefix():
    score, anchor = fields._anchor_line_score(
        "Manufactured by: Acme Foods Pvt Ltd", ("manufactured by",)
    )
    assert score == 1.0
    assert anchor == "manufactured by"


def test_anchor_line_score_handles_missing_anchor():
    score, _ = fields._anchor_line_score(
        "Just a random line", ("manufactured by",)
    )
    assert score == 0.0


def test_value_after_anchor_strips_label():
    assert fields._value_after_anchor(
        "Manufactured by: Acme Foods", ("manufactured by",)
    ) == "Acme Foods"


def test_value_after_anchor_returns_none_when_missing():
    assert fields._value_after_anchor(
        "Customer Care: 1800-123", ("manufactured by",)
    ) is None


def test_find_candidates_returns_one_per_matching_line():
    lines = [
        _line("Top header."),
        _line("Manufactured by: Acme Foods Pvt Ltd", conf=0.95),
        _line("Plot 21, MIDC, Mumbai 400001"),
        _line("Random other text"),
    ]
    cands = fields.find_candidates(lines, "manufacturer_name")
    assert len(cands) >= 1
    assert any("Acme" in c.value for c in cands)


def test_pick_best_returns_highest_score():
    a = fields.Candidate("A", 0.5, 0, "", "x")
    b = fields.Candidate("B", 0.9, 1, "", "x")
    best = fields.pick_best([a, b])
    assert best.value == "B"


def test_pick_best_marks_uncertain_when_top_two_close():
    a = fields.Candidate("A", 0.85, 0, "", "x")
    b = fields.Candidate("B", 0.83, 1, "", "x")
    best = fields.pick_best([a, b])
    assert best.uncertain is True


# --------------------------------------------------------------------------- #
# extract() — top-level orchestrator
# --------------------------------------------------------------------------- #

def test_extract_returns_all_default_fields_with_empty_values():
    out = fields.extract([])
    for f in fields.DEFAULT_FIELDS:
        assert f in out
        assert out[f]["value"] is None
        assert out[f]["source"] is None


def test_extract_finds_format_fields_in_realistic_label():
    lines = [
        _line("FRESH FOODS PVT LTD", conf=0.9),
        _line("MRP Rs. 99/-  Best before", conf=0.95),
        _line("Net wt. 200 g", conf=0.95),
        _line("FSSAI Lic No 10012022000123", conf=0.9),
        _line("Mfg: Aug-26  Exp: Aug-27", conf=0.85),
        _line("Customer Care: 1800-123-456", conf=0.9),
        _line("Manufactured by: Fresh Foods Pvt Ltd", conf=0.95),
        _line("Plot 21, MIDC, Mumbai 400001", conf=0.9),
    ]
    out = fields.extract(lines)
    assert out["mrp"]["value"] == "99.00"
    assert out["net_quantity"]["value"] == "200g"
    assert out["fssai"]["value"] == "10012022000123"
    assert out["customer_care"]["value"] == "1800123456"
    assert out["manufacturer_name"]["value"] == "Fresh Foods Pvt Ltd"


def test_extract_skips_llm_when_confidence_is_high():
    lines = [_line("FSSAI 10012022000123", conf=0.95) for _ in range(10)]
    out = fields.extract(lines)
    assert all(out[f]["source"] in (None, "ocr") for f in out)


def test_extract_triggers_llm_when_low_conf_and_image(monkeypatch):
    # LLM fills in a field OCR couldn't find (cin) so the merge keeps the
    # OCR value (empty) but adopts the LLM value as a new entry.
    monkeypatch.setattr(fields, "gemini_fallback", lambda *_a, **_kw: {
        "cin": {"value": "U15100MH2009PTC123456", "confidence": 0.7, "uncertain": True, "source": "llm"}
    })
    lines = [_line("manufactured by: ??", conf=0.2) for _ in range(5)]
    out = fields.extract(lines, image_bytes=b"fake-bytes")
    assert out["cin"]["value"] == "U15100MH2009PTC123456"
    assert out["cin"]["source"] == "llm"


def test_merge_ocr_and_llm_agreement_raises_confidence():
    ocr_f = {"mrp": {"value": "40.00", "confidence": 0.6, "uncertain": False, "source": "ocr"}}
    llm_f = {"mrp": {"value": "40.00", "confidence": 0.7, "uncertain": True, "source": "llm"}}
    merged = fields.merge_ocr_and_llm(ocr_f, llm_f)
    assert merged["mrp"]["source"] == "both"
    assert merged["mrp"]["uncertain"] is False
    assert merged["mrp"]["confidence"] > 0.6


def test_merge_ocr_and_llm_disagreement_marks_uncertain():
    ocr_f = {"mrp": {"value": "40.00", "confidence": 0.6, "uncertain": False, "source": "ocr"}}
    llm_f = {"mrp": {"value": "39.99", "confidence": 0.7, "uncertain": True, "source": "llm"}}
    merged = fields.merge_ocr_and_llm(ocr_f, llm_f)
    assert merged["mrp"]["source"] == "ocr"
    assert merged["mrp"]["uncertain"] is True


def test_merge_ocr_and_llm_adds_llm_only():
    ocr_f = {"mrp": {"value": "40.00", "confidence": 0.6, "uncertain": False, "source": "ocr"}}
    llm_f = {"cin": {"value": "U15100MH2009PTC123456", "confidence": 0.7, "uncertain": True, "source": "llm"}}
    merged = fields.merge_ocr_and_llm(ocr_f, llm_f)
    assert merged["mrp"]["source"] == "ocr"
    assert merged["cin"]["value"] == "U15100MH2009PTC123456"


def test_empty_field_is_isolated():
    a = fields.empty_field()
    b = fields.empty_field()
    a["value"] = "x"
    assert b["value"] is None