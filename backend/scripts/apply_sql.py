"""Apply sql/001_pincodes.sql to Supabase.

Idempotent: uses ``CREATE TABLE IF NOT EXISTS`` and re-running it is a no-op.
Run from the repo root::

    python backend/scripts/apply_sql.py sql/001_pincodes.sql
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make ``app`` importable when run directly from the repo root.
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.db import get_conn  # noqa: E402


def main(sql_file: str) -> int:
    sql_path = Path(sql_file)
    if not sql_path.exists():
        print(f"SQL file not found: {sql_path}", file=sys.stderr)
        return 1

    sql = sql_path.read_text(encoding="utf-8")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    print(f"applied {sql_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "sql/001_pincodes.sql"))