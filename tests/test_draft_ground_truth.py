"""Unit tests for backend.ocr.normalize, scoring, dummy extractor, and
draft_ground_truth pure helpers (no Gemini calls)."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pytest

# Allow importing backend.* from the repo root.
_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO))

from backend.ocr import (  # noqa: E402
    draft_ground_truth as dgt,
    dummy_extractor,
    evaluate,
    normalize,
    scoring,
)


# --------------------------------------------------------------------------- #
# normalize
# --------------------------------------------------------------------------- #

def test_norm_text_uppercases_and_collapses_whitespace():
    assert normalize.norm_text("  Acme Foods  Pvt Ltd  ") == "ACME FOODS PVT LTD"


def test_norm_text_none_is_empty():
    assert normalize.norm_text(None) == ""


def test_norm_numeric_strips_plus91_and_dashes():
    assert normalize.norm_numeric("+91 73407-58758") == "917340758758"


def test_norm_numeric_strips_non_digits():
    # The B→8 / O→0 / l→1 / S→5 corrections apply inside runs that contain
    # a digit. Pure-letter words ("ABC") are stripped without being touched.
    assert normalize.norm_numeric("10012022 000123") == "10012022000123"
    assert normalize.norm_numeric("ABC-1234") == "1234"
    assert normalize.norm_numeric("O1234") == "01234"  # letter inside a digit run
    assert normalize.norm_numeric("12B34") == "12834"


def test_norm_mrp_two_decimals():
    assert normalize.norm_mrp("MRP Rs. 40/-") == "40.00"
    assert normalize.norm_mrp("₹39.85") == "39.85"
    assert normalize.norm_mrp("40") == "40.00"


def test_norm_customer_care_single_string():
    assert normalize.norm_customer_care("+91 7340758758") == "917340758758"


def test_norm_customer_care_multiple_in_one_string():
    assert (
        normalize.norm_customer_care("1800-123-456 | 022-41304130")
        == "1800123456 | 02241304130"
    )


def test_norm_customer_care_list():
    assert (
        normalize.norm_customer_care(["1800-123-456", "022-41304130"])
        == "1800123456 | 02241304130"
    )


def test_norm_field_dispatches_correctly():
    assert normalize.norm_field("MRP Rs. 40", "mrp") == "40.00"
    assert normalize.norm_field("10012022000123", "fssai") == "10012022000123"
    assert normalize.norm_field("Acme", "manufacturer_name") == "ACME"


# --------------------------------------------------------------------------- #
# scoring
# --------------------------------------------------------------------------- #

def test_values_match_exact_for_numeric():
    assert scoring.values_match("10012022000123", "10012022 000123", "fssai") is True


def test_values_match_fuzzy_for_manufacturer():
    # 85% threshold — small differences should pass. "PVT LTD" vs "PRIVATE LIMITED"
    # is too divergent (ratio ~0.55); choose a closer pair.
    assert scoring.values_match("ACME FOODS PVT LTD", "ACME FOODS PRIVATE LTD", "manufacturer_name") is True


def test_values_match_no_match_for_unrelated():
    assert scoring.values_match("FOO", "BAR", "mrp") is False


def test_per_field_metrics_perfect_prediction():
    triples = {"fssai": [("10012022000123", "10012022000123", False, "real/1.jpg")]}
    m = scoring.per_field_metrics_tuples(triples, avg_ms_per_image=10.0)
    assert m["fssai"].precision == 1.0
    assert m["fssai"].recall == 1.0
    assert m["fssai"].accuracy == 1.0
    assert m["fssai"].support == 1


def test_per_field_metrics_mistake_flagged_uncertain_counts():
    triples = {
        "fssai": [
            ("1001202200012X", "10012022000123", True, "real/1.jpg"),
            ("10012022000123", "10012022000123", False, "real/2.jpg"),
        ],
    }
    m = scoring.per_field_metrics_tuples(triples)
    assert m["fssai"].support == 2
    assert m["fssai"].tp == 1
    assert m["fssai"].fp == 1
    assert m["fssai"].fn == 1
    assert m["fssai"].recall == 0.5
    assert m["fssai"].precision == 0.5
    assert m["fssai"].uncertain_share == 1.0


def test_empty_ground_truth_field_does_not_count_as_fp():
    triples = {
        "fssai": [
            ("10012022000123", "", False, "real/1.jpg"),
        ],
    }
    m = scoring.per_field_metrics_tuples(triples)
    assert m["fssai"].support == 0
    assert m["fssai"].tp == 0
    assert m["fssai"].fp == 0


def test_format_table_is_human_readable():
    triples = {"fssai": [("10012022000123", "10012022000123", False, "real/1.jpg")]}
    m = scoring.per_field_metrics_tuples(triples)
    table = scoring.format_table(m)
    assert "fssai" in table
    assert "prec" in table


def test_write_csv_roundtrip(tmp_path: Path):
    triples = {"fssai": [("10012022000123", "10012022000123", False, "real/1.jpg")]}
    m = scoring.per_field_metrics_tuples(triples, avg_ms_per_image=12.5)
    out = tmp_path / "results.csv"
    scoring.write_csv(m, out)
    with out.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["field"] == "fssai"
    assert float(rows[0]["avg_ms_per_image"]) == 12.5


# --------------------------------------------------------------------------- #
# dummy_extractor
# --------------------------------------------------------------------------- #

def test_dummy_extractor_returns_empty_fields():
    out = dummy_extractor.extract("real/1.jpg")
    assert out["status"] == "not_checked"
    assert out["fields"] == {}
    assert out["scan_id"] is None


# --------------------------------------------------------------------------- #
# draft_ground_truth — pure helpers
# --------------------------------------------------------------------------- #

def test_digits_only_handles_none_and_punct():
    assert dgt._digits_only(None) == ""
    assert dgt._digits_only("+91 73407-58758") == "917340758758"


def test_format_mrp_decimal_and_integer():
    assert dgt._format_mrp("40") == "40.00"
    assert dgt._format_mrp("₹39.85") == "39.85"
    assert dgt._format_mrp(None) == ""


def test_format_customer_care_list_and_pipe():
    assert dgt._format_customer_care(["1800-123", "022-41304130"]) == "1800123 | 02241304130"
    assert dgt._format_customer_care("1800-123 | 022-41304130") == "1800123 | 02241304130"


def test_format_product_row_drops_difficulty_and_language():
    row = dgt._format_product_row(
        "real/1.jpg",
        {
            "mrp": "40",
            "net_quantity": "100 g",
            "customer_care": ["+91 7340758758"],
            "mfg_date": "Aug-26",
            "expiry_or_best_before": "36 months",
            "bis_cml": None,
            "is_number": None,
        },
    )
    assert row["image"] == "real/1.jpg"
    assert row["difficulty"] == ""
    assert row["language"] == ""
    assert row["mrp"] == "40.00"
    assert row["customer_care"] == "917340758758"
    assert row["bis_cml"] == ""


def test_format_party_row_clamps_unknown_role_to_unassigned():
    row = dgt._format_party_row(
        "real/1.jpg",
        {"role": "wizard", "name": "Acme", "address": "1 Street",
         "pincode": "110 001", "fssai": "10 012022 000123"},
    )
    assert row["role"] == "unassigned"
    assert row["pincode"] == "110001"
    assert row["fssai"] == "10012022000123"


def test_discover_images_lists_real_and_fake(tmp_path: Path):
    real = tmp_path / "real"
    fake = tmp_path / "fake"
    real.mkdir()
    fake.mkdir()
    (real / "1.jpg").write_bytes(b"")
    (real / "2.jpeg").write_bytes(b"")
    (fake / "1.png").write_bytes(b"")
    (real / "_skip.jpg").write_bytes(b"")
    found = dgt._discover_images(tmp_path)
    assert set(found) == {"real/1.jpg", "real/2.jpeg", "fake/1.png"}


def test_merge_draft_replaces_keys():
    existing = [{"image": "a", "mrp": "10"}, {"image": "b", "mrp": "20"}]
    new = [{"image": "a", "mrp": "99"}, {"image": "c", "mrp": "30"}]
    merged = dgt._merge_draft(existing, new, ["image"])
    by_img = {r["image"]: r["mrp"] for r in merged}
    assert by_img == {"a": "99", "b": "20", "c": "30"}


def test_finalize_filters_checked_and_dedupes(tmp_path: Path):
    product_draft = tmp_path / "ground_truth_draft.csv"
    parties_draft = tmp_path / "ground_truth_parties_draft.csv"
    product_final = tmp_path / "ground_truth.csv"
    parties_final = tmp_path / "ground_truth_parties.csv"

    with product_draft.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=dgt.PRODUCT_COLUMNS)
        writer.writeheader()
        writer.writerow({"image": "real/1.jpg", "difficulty": "clear", "language": "en",
                          "net_quantity": "100 g", "customer_care": "", "mfg_date": "",
                          "expiry_or_best_before": "", "bis_cml": "", "is_number": "",
                          "mrp": "10.00", "checked": "y"})
        writer.writerow({"image": "real/2.jpg", "difficulty": "clear", "language": "en",
                          "net_quantity": "", "customer_care": "", "mfg_date": "",
                          "expiry_or_best_before": "", "bis_cml": "", "is_number": "",
                          "mrp": "20.00", "checked": ""})
    with parties_draft.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=dgt.PARTIES_COLUMNS)
        writer.writeheader()
        writer.writerow({"image": "real/1.jpg", "role": "manufacturer", "unit_code": "",
                          "name": "Acme", "address": "1 Street", "pincode": "110001",
                          "fssai": "10012022000123", "cin": "", "gstin": "", "checked": "y"})

    rc = dgt._finalize(product_draft, parties_draft, product_final, parties_final)
    assert rc == 1  # at least one unchecked -> non-zero exit
    with product_final.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["image"] == "real/1.jpg"
    assert "checked" not in rows[0]
    with parties_final.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["role"] == "manufacturer"
    assert "checked" not in rows[0]


def test_finalize_preserves_existing_rows(tmp_path: Path):
    product_draft = tmp_path / "ground_truth_draft.csv"
    parties_draft = tmp_path / "ground_truth_parties_draft.csv"
    product_final = tmp_path / "ground_truth.csv"
    parties_final = tmp_path / "ground_truth_parties.csv"

    with product_final.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["image", "language", "mrp"])
        writer.writeheader()
        writer.writerow({"image": "real/old.jpg", "language": "en", "mrp": "5.00"})

    with product_draft.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=dgt.PRODUCT_COLUMNS)
        writer.writeheader()
        writer.writerow({"image": "real/new.jpg", "difficulty": "", "language": "en",
                          "net_quantity": "", "customer_care": "", "mfg_date": "",
                          "expiry_or_best_before": "", "bis_cml": "", "is_number": "",
                          "mrp": "99.00", "checked": "y"})
    with parties_draft.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=dgt.PARTIES_COLUMNS)
        writer.writeheader()

    dgt._finalize(product_draft, parties_draft, product_final, parties_final)
    with product_final.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert {r["image"] for r in rows} == {"real/old.jpg", "real/new.jpg"}


# --------------------------------------------------------------------------- #
# evaluate (without running Gemini)
# --------------------------------------------------------------------------- #

def test_load_ground_truth_skips_missing_images(tmp_path: Path, capsys, monkeypatch):
    monkeypatch.setattr(evaluate, "_REPO_ROOT", tmp_path)
    tl = tmp_path / "data" / "test_labels"
    real = tl / "real"
    real.mkdir(parents=True)
    (real / "exists.jpg").write_bytes(b"")
    gt = tmp_path / "ground_truth.csv"
    with gt.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["image", "language", "mrp", "checked"])
        writer.writeheader()
        writer.writerow({"image": "real/exists.jpg", "language": "en", "mrp": "10.00", "checked": ""})
        writer.writerow({"image": "real/missing.jpg", "language": "en", "mrp": "20.00", "checked": ""})

    by_image, meta = evaluate.load_ground_truth(gt)
    assert "real/exists.jpg" in by_image
    assert "real/missing.jpg" not in by_image
    captured = capsys.readouterr()
    assert "[warn]" in captured.out


def test_evaluate_dummy_end_to_end(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(evaluate, "_REPO_ROOT", tmp_path)
    tl = tmp_path / "data" / "test_labels"
    real = tl / "real"
    real.mkdir(parents=True)
    (real / "1.jpg").write_bytes(b"")
    gt = tmp_path / "ground_truth.csv"
    with gt.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["image", "difficulty", "language", "source", "mrp", "checked"],
        )
        writer.writeheader()
        writer.writerow({
            "image": "real/1.jpg", "difficulty": "clear", "language": "en",
            "source": "own", "mrp": "10.00", "checked": "",
        })

    metrics, preds, avg_ms = evaluate.run(
        "backend.ocr.dummy_extractor", "dummy", gt, ["mrp"]
    )
    assert "mrp" in metrics
    assert metrics["mrp"].support == 1
    assert metrics["mrp"].tp == 0
    assert metrics["mrp"].fn == 1