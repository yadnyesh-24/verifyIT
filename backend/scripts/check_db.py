"""Smoke-test the Supabase Postgres connection.

Run with the project virtualenv active::

    .venv/Scripts/python.exe backend/scripts/check_db.py

The script prints exactly two values (and nothing else), so it's easy to grep::

    connected
    PostgreSQL 15.x ...
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make ``app`` importable when running this file directly from the repo root
# (pytest.ini does the same thing for the test runner via ``pythonpath``).
_BACKEND = Path(__file__).resolve().parents[1]
for p in (str(_BACKEND),):
    if p not in sys.path:
        sys.path.insert(0, p)

from app.db import get_conn  # noqa: E402


def main() -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version()")
            version = cur.fetchone()[0]
    print("connected")
    print(version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())