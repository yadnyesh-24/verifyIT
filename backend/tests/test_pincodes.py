"""Integration tests for the Supabase pincode tables.

These tests hit the real database; they're skipped automatically when
``DATABASE_URL`` is not set (so local ``pytest`` runs without a connection
still pass). They assume ``sql/001_pincodes.sql`` has been applied and
``backend/scripts/import_pincodes.py`` has been run at least once.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

# Make ``DATABASE_URL`` visible to ``pytestmark`` before collection.
# ``backend/.env`` is loaded explicitly because pytest (unlike our scripts)
# doesn't have a helper that loads it.
_BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_BACKEND_ENV, override=True)

from app.db import get_conn  # noqa: E402  (import after load_dotenv so get_conn sees the env)

pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="DATABASE_URL not set; skipping real-DB tests",
)


def _fetch_one(sql: str, params: tuple = ()):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()


# --------------------------------------------------------------------------------------
# Known-pincode resolution: the three big metros from the India Post directory.
# --------------------------------------------------------------------------------------


def test_208016_is_uttar_pradesh_kanpur_nagar():
    state = _fetch_one("SELECT state_norm FROM pincodes WHERE pincode = %s", ("208016",))[0]
    district = _fetch_one("SELECT district FROM pincodes WHERE pincode = %s", ("208016",))[0]
    assert state == "UTTAR PRADESH", f"208016 state was {state!r}"
    # The directory lists "KANPUR NAGAR" for IIT Kanpur SO under this pincode;
    # accept any case of that name.
    assert district is not None and district.upper().replace(" ", "") == "KANPURNAGAR", (
        f"208016 district was {district!r}"
    )


def test_110001_is_delhi():
    state = _fetch_one("SELECT state_norm FROM pincodes WHERE pincode = %s", ("110001",))[0]
    assert state == "DELHI", f"110001 state was {state!r}"


def test_400001_is_maharashtra():
    state = _fetch_one("SELECT state_norm FROM pincodes WHERE pincode = %s", ("400001",))[0]
    assert state == "MAHARASHTRA", f"400001 state was {state!r}"


# --------------------------------------------------------------------------------------
# Sanity bounds on the rolled-up pincodes table.
# --------------------------------------------------------------------------------------


def test_distinct_pincode_count_is_in_expected_range():
    (count,) = _fetch_one("SELECT COUNT(*) FROM pincodes")
    # The India Post pincode directory publishes ~19,500 active pincodes.
    # Allow a small slack either side for directory revisions.
    assert 19_000 <= count <= 20_000, f"distinct pincode count was {count}"