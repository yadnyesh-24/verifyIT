"""Tests for the runtime state-code lookups (GST / FSSAI reference tables)."""
from __future__ import annotations

import csv
from pathlib import Path

import pytest

from app import states
from app.normalize import CANONICAL_STATES

REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"
GST_CSV = REFERENCE_DIR / "gst_state_codes.csv"
FSSAI_CSV = REFERENCE_DIR / "fssai_state_codes.csv"

_MERGED_UT = "DADRA AND NAGAR HAVELI AND DAMAN AND DIU"


# --------------------------------------------------------------------------------------
# GST lookups.
# --------------------------------------------------------------------------------------

GST_CASES = [
    ("01", "JAMMU AND KASHMIR"),
    (1, "JAMMU AND KASHMIR"),
    ("07", "DELHI"),
    (7, "DELHI"),
    ("21", "ODISHA"),
    ("26", _MERGED_UT),
    ("27", "MAHARASHTRA"),
    ("29", "KARNATAKA"),
    ("34", "PUDUCHERRY"),
    ("35", "ANDAMAN AND NICOBAR ISLANDS"),
    ("36", "TELANGANA"),
    ("37", "ANDHRA PRADESH"),
    ("38", "LADAKH"),
]


@pytest.mark.parametrize("code,expected", GST_CASES)
def test_gst_state_known(code, expected):
    assert states.gst_state(code) == expected


def test_gst_state_legacy_codes():
    # 25 (old Daman and Diu) and 28 (old Andhra Pradesh) fold into the current names.
    assert states.gst_state("25") == _MERGED_UT
    assert states.gst_state("28") == "ANDHRA PRADESH"


@pytest.mark.parametrize("code", ["00", "96", "97", "99", "zz", "", "  "])
def test_gst_state_unknown_returns_none(code):
    assert states.gst_state(code) is None


def test_gst_csv_codes_are_unique_and_well_formed():
    rows = list(csv.DictReader(GST_CSV.open(encoding="utf-8-sig", newline="")))
    codes = [row["code"].strip() for row in rows if row["code"].strip()]
    assert len(codes) == len(set(codes)), "duplicate GST codes in reference file"
    assert all(len(code) == 2 and code.isdigit() for code in codes)


def test_gst_csv_rows_have_exactly_three_fields():
    with GST_CSV.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        assert next(reader) == ["code", "state", "todo"]
        for lineno, row in enumerate(reader, start=2):
            assert len(row) == 3, f"line {lineno} has {len(row)} fields: {row}"


def test_every_gst_state_is_canonical():
    rows = list(csv.DictReader(GST_CSV.open(encoding="utf-8-sig", newline="")))
    for row in rows:
        name = row["state"].strip()
        if name:
            assert name in CANONICAL_STATES, f"non-canonical GST state: {name!r}"


# --------------------------------------------------------------------------------------
# FSSAI lookups (codes intentionally empty until filled from real labels).
# --------------------------------------------------------------------------------------


def test_fssai_csv_rows_have_exactly_four_fields():
    with FSSAI_CSV.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        assert next(reader) == ["code", "state", "verified", "source_note"]
        for lineno, row in enumerate(reader, start=2):
            assert len(row) == 4, f"line {lineno} has {len(row)} fields: {row}"


def test_fssai_codes_are_empty_for_now():
    rows = list(csv.DictReader(FSSAI_CSV.open(encoding="utf-8-sig", newline="")))
    assert rows, "FSSAI reference file should list the canonical states"
    assert all(row["code"].strip() == "" for row in rows)
    assert all(row["verified"].strip().lower() == "false" for row in rows)


def test_fssai_covers_every_canonical_state():
    rows = list(csv.DictReader(FSSAI_CSV.open(encoding="utf-8-sig", newline="")))
    listed = {row["state"].strip() for row in rows}
    assert listed == set(CANONICAL_STATES)


def test_fssai_state_unknown_until_codes_added():
    # No codes are populated yet, so every lookup must miss safely.
    assert states.fssai_state("100") is None
    assert states.fssai_state(1) is None


# --------------------------------------------------------------------------------------
# canonical_states().
# --------------------------------------------------------------------------------------


def test_canonical_states_matches_normalize_module():
    assert states.canonical_states() == CANONICAL_STATES
    assert isinstance(states.canonical_states(), tuple)
    assert len(states.canonical_states()) == 36
