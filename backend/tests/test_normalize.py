"""Tests for the shared state-normalisation module."""
from __future__ import annotations

import logging

import pytest

from app.normalize import CANONICAL_STATES, normalize_state
from tests.profile_reader import distinct_state_values, placeholder_state_values

# --------------------------------------------------------------------------------------
# The core guarantee: every state value present in our data maps to a canonical name.
# --------------------------------------------------------------------------------------


def test_profile_lists_values():
    values = distinct_state_values()
    # 36 pincode spellings (excl. the NA placeholder) + 36 MCA spellings.
    assert len(values) == 72, f"unexpected number of profiled values: {len(values)}"


def test_every_profile_value_normalises():
    unmapped = [v for v in distinct_state_values() if normalize_state(v) is None]
    assert unmapped == [], f"state values that could not be mapped: {unmapped}"


def test_every_profile_value_maps_to_a_canonical_state():
    unknown = [
        v
        for v in distinct_state_values()
        if normalize_state(v) not in CANONICAL_STATES
    ]
    assert unknown == [], f"values mapped outside CANONICAL_STATES: {unknown}"


def test_placeholder_values_return_none():
    for value in placeholder_state_values():
        assert normalize_state(value) is None, f"{value!r} should not map to a state"


# --------------------------------------------------------------------------------------
# Canonical list sanity.
# --------------------------------------------------------------------------------------


def test_canonical_states_shape():
    assert len(CANONICAL_STATES) == 36  # 28 states + 8 union territories
    assert len(set(CANONICAL_STATES)) == 36
    assert all(name == name.upper() for name in CANONICAL_STATES)


def test_canonical_states_are_idempotent():
    for name in CANONICAL_STATES:
        assert normalize_state(name) == name


# --------------------------------------------------------------------------------------
# Historical / variant spellings.
# --------------------------------------------------------------------------------------

_MERGED_UT = "DADRA AND NAGAR HAVELI AND DAMAN AND DIU"

VARIANT_CASES = [
    ("ORISSA", "ODISHA"),
    ("Orissa", "ODISHA"),
    ("PONDICHERRY", "PUDUCHERRY"),
    ("Pondicherry", "PUDUCHERRY"),
    ("UTTARANCHAL", "UTTARAKHAND"),
    ("Uttaranchal", "UTTARAKHAND"),
    ("CHATTISGARH", "CHHATTISGARH"),
    ("Chattisgarh", "CHHATTISGARH"),
    ("JAMMU & KASHMIR", "JAMMU AND KASHMIR"),
    ("Jammu and Kashmir", "JAMMU AND KASHMIR"),
    ("DADRA & NAGAR HAVELI", _MERGED_UT),
    ("DAMAN & DIU", _MERGED_UT),
    ("Daman and Diu", _MERGED_UT),
    ("Dadra and Nagra Haveli", _MERGED_UT),
    ("THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", _MERGED_UT),
]


@pytest.mark.parametrize("raw,expected", VARIANT_CASES)
def test_variants_map_correctly(raw, expected):
    assert normalize_state(raw) == expected


# --------------------------------------------------------------------------------------
# Case / whitespace / punctuation insensitivity.
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("  orissa  ", "ODISHA"),
        ("Orissa.", "ODISHA"),
        ("oRiSsA", "ODISHA"),
        ("West   Bengal", "WEST BENGAL"),
        ("TAMIL\tNADU", "TAMIL NADU"),
        ("  tamil   nadu  ", "TAMIL NADU"),
        ("jAmMu & kAsHmIr", "JAMMU AND KASHMIR"),
        ("uttar-pradesh", "UTTAR PRADESH"),
    ],
)
def test_case_whitespace_and_punctuation_are_ignored(raw, expected):
    assert normalize_state(raw) == expected


# --------------------------------------------------------------------------------------
# Ladakh and Telangana must be distinct states.
# --------------------------------------------------------------------------------------


def test_ladakh_and_telangana_are_separate():
    assert normalize_state("Ladakh") == "LADAKH"
    assert normalize_state("Telangana") == "TELANGANA"
    assert "LADAKH" in CANONICAL_STATES
    assert "TELANGANA" in CANONICAL_STATES
    assert normalize_state("Ladakh") != normalize_state("Telangana")


# --------------------------------------------------------------------------------------
# Unknown / blank input.
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [None, "", "   ", "NA", "N/A", "ATLANTIS", "NARNIA", "12345", "???"],
)
def test_unknown_returns_none(raw):
    assert normalize_state(raw) is None


def test_unknown_value_is_logged(caplog):
    with caplog.at_level(logging.WARNING, logger="app.normalize"):
        assert normalize_state("ATLANTIS") is None
    assert any("ATLANTIS" in record.getMessage() for record in caplog.records)


def test_known_value_is_not_logged(caplog):
    with caplog.at_level(logging.WARNING, logger="app.normalize"):
        assert normalize_state("Delhi") == "DELHI"
    assert caplog.records == []
