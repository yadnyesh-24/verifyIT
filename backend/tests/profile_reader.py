"""Helpers to read the machine-readable tables out of ``data/profile.md``.

Used by the state-normalisation tests so the "source of truth" for the distinct state
values stays a single markdown file rather than being duplicated in the tests.
"""
from __future__ import annotations

import re
from pathlib import Path

PROFILE_PATH = Path(__file__).resolve().parents[2] / "data" / "profile.md"

_ROW_RE = re.compile(
    r"^\|\s*(pincode|companies)\s*\|\s*(?P<value>.+?)\s*\|\s*\d+\s*\|"
)


def _rows_in_section(heading_prefix: str) -> list[str]:
    """Return the raw_value column of every pincode/companies row in one section."""
    lines = PROFILE_PATH.read_text(encoding="utf-8").splitlines()
    prefix = heading_prefix.strip().lower()

    start = None
    for index, line in enumerate(lines):
        if line.strip().lower().startswith(prefix):
            start = index + 1
            break
    if start is None:
        raise AssertionError(f"section {heading_prefix!r} not found in {PROFILE_PATH}")

    values: list[str] = []
    for line in lines[start:]:
        if line.strip().startswith("## "):
            break
        match = _ROW_RE.match(line.strip())
        if match:
            values.append(match.group("value"))
    return values


def distinct_state_values() -> list[str]:
    """Every raw state spelling listed under 'Distinct state values'."""
    return _rows_in_section("## Distinct state values")


def placeholder_state_values() -> list[str]:
    """Every raw value listed under 'Non-state / placeholder values'."""
    return _rows_in_section("## Non-state / placeholder values")
