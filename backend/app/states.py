"""Runtime lookups over the reference state-code tables.

Loads ``data/reference/gst_state_codes.csv`` and ``data/reference/fssai_state_codes.csv``
once at import time and exposes them as plain code -> canonical-state lookups.

Both files store their ``state`` column as a canonical name (see ``app.normalize``); the
loader re-runs it through :func:`app.normalize.normalize_state` so that a stray spelling in
a hand-edited CSV is caught (and logged) rather than silently returned.
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Optional

from app.normalize import CANONICAL_STATES, normalize_state

__all__ = ["gst_state", "fssai_state", "canonical_states"]

logger = logging.getLogger(__name__)

# backend/app/states.py -> parents[2] is the repo root.
_REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"
_GST_CSV = _REFERENCE_DIR / "gst_state_codes.csv"
_FSSAI_CSV = _REFERENCE_DIR / "fssai_state_codes.csv"


def _norm_code(code: object) -> str:
    """Normalise a state code to its 2-digit string form (``7`` -> ``"07"``)."""
    return str(code).strip().zfill(2)


def _load_code_map(path: Path, code_col: str, state_col: str) -> dict[str, str]:
    """Read a (code, state) reference CSV into a ``{code: canonical_state}`` dict."""
    mapping: dict[str, str] = {}
    if not path.exists():
        logger.warning("states: reference file missing: %s", path)
        return mapping

    with path.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            code = (row.get(code_col) or "").strip()
            state_raw = (row.get(state_col) or "").strip()
            if not code or not state_raw:
                # Blank code or blank state => not a usable mapping (e.g. 97 / 99).
                continue

            canonical = normalize_state(state_raw)
            if canonical is None:
                logger.warning(
                    "states: %s has unmappable state %r for code %s",
                    path.name,
                    state_raw,
                    code,
                )
                continue
            mapping[_norm_code(code)] = canonical
    return mapping


_GST_BY_CODE: dict[str, str] = _load_code_map(_GST_CSV, "code", "state")
_FSSAI_BY_CODE: dict[str, str] = _load_code_map(_FSSAI_CSV, "code", "state")


def gst_state(code: object) -> Optional[str]:
    """Canonical state for a GSTIN state code (e.g. ``"07"`` -> ``"DELHI"``)."""
    return _GST_BY_CODE.get(_norm_code(code))


def fssai_state(code: object) -> Optional[str]:
    """Canonical state for an FSSAI licence state code, or ``None`` if unknown."""
    return _FSSAI_BY_CODE.get(_norm_code(code))


def canonical_states() -> tuple[str, ...]:
    """The canonical Indian state / UT names used across VerifyIT."""
    return CANONICAL_STATES
