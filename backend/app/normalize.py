"""Shared Indian state normalisation for VerifyIT.

Single source of truth for collapsing the many spellings of Indian states / union
territories found across the MCA company master, the India Post pincode directory and
OCR'd product labels onto one canonical name.

Canonical names are upper-case with ``AND`` spelled out, e.g. ``JAMMU AND KASHMIR``.

The variant list is derived from the distinct state values profiled in
``data/profile.md``; ``backend/tests/test_normalize.py`` asserts that every value listed
there maps to a canonical name.  Unknown values return ``None`` and are logged.
"""
from __future__ import annotations

import logging
import re

__all__ = ["CANONICAL_STATES", "normalize_state"]

logger = logging.getLogger(__name__)

# 28 states + 8 union territories = 36 canonical names.
CANONICAL_STATES: tuple[str, ...] = (
    "ANDAMAN AND NICOBAR ISLANDS",
    "ANDHRA PRADESH",
    "ARUNACHAL PRADESH",
    "ASSAM",
    "BIHAR",
    "CHANDIGARH",
    "CHHATTISGARH",
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
    "DELHI",
    "GOA",
    "GUJARAT",
    "HARYANA",
    "HIMACHAL PRADESH",
    "JAMMU AND KASHMIR",
    "JHARKHAND",
    "KARNATAKA",
    "KERALA",
    "LADAKH",
    "LAKSHADWEEP",
    "MADHYA PRADESH",
    "MAHARASHTRA",
    "MANIPUR",
    "MEGHALAYA",
    "MIZORAM",
    "NAGALAND",
    "ODISHA",
    "PUDUCHERRY",
    "PUNJAB",
    "RAJASTHAN",
    "SIKKIM",
    "TAMIL NADU",
    "TELANGANA",
    "TRIPURA",
    "UTTAR PRADESH",
    "UTTARAKHAND",
    "WEST BENGAL",
)

# The merged union territory (Dadra & Nagar Haveli + Daman & Diu, 2020).
_MERGED_UT = "DADRA AND NAGAR HAVELI AND DAMAN AND DIU"

# Historical / variant spellings -> canonical.  Keys are written in their *raw* form;
# they are normalised to lookup keys (see ``_key``) when the table is built below.
_VARIANT_SOURCES: dict[str, str] = {
    # renamed states
    "ORISSA": "ODISHA",
    "PONDICHERRY": "PUDUCHERRY",
    "UTTARANCHAL": "UTTARAKHAND",
    # spelling variants seen in the MCA company master
    "CHATTISGARH": "CHHATTISGARH",
    "DADRA AND NAGRA HAVELI": _MERGED_UT,
    # ampersand spellings (the '&' is stripped by _key before lookup)
    "JAMMU KASHMIR": "JAMMU AND KASHMIR",
    "DADRA NAGAR HAVELI": _MERGED_UT,
    "DAMAN DIU": _MERGED_UT,
    "DAMAN AND DIU": _MERGED_UT,
    "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU": _MERGED_UT,
}

_PUNCT_RE = re.compile(r"[^A-Z0-9]+")


def _key(raw: str) -> str:
    """Upper-case, strip punctuation, collapse runs of whitespace into one space."""
    return _PUNCT_RE.sub(" ", raw.upper()).strip()


def _build_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}
    for canonical in CANONICAL_STATES:
        lookup[_key(canonical)] = canonical
    for variant, canonical in _VARIANT_SOURCES.items():
        lookup[_key(variant)] = canonical
    return lookup


_LOOKUP: dict[str, str] = _build_lookup()


def normalize_state(raw: str | None) -> str | None:
    """Return the canonical state name for *raw*, or ``None`` if it cannot be mapped.

    Case, surrounding whitespace, internal spacing and punctuation are ignored, so
    ``"  orissa "``, ``"ORISSA"`` and ``"Orissa."`` all yield ``"ODISHA"``.
    Unmapped values are logged and return ``None``.
    """
    if raw is None:
        return None

    value = raw if isinstance(raw, str) else str(raw)
    key = _key(value)
    if not key:
        logger.warning("normalize_state: blank state value %r", raw)
        return None

    canonical = _LOOKUP.get(key)
    if canonical is None:
        logger.warning("normalize_state: unmapped state value %r", raw)
        return None
    return canonical
