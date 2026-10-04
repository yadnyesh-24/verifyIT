"""Database connection helpers for VerifyIT.

A single ``get_conn()`` context manager is used by every script that touches
Supabase Postgres. It reads ``DATABASE_URL`` from ``backend/.env`` via
``python-dotenv``, opens a psycopg 3 connection with ``sslmode=require``
(Session pooler requires TLS), and sets ``search_path`` so the ``pg_trgm``
extension (installed in the ``extensions`` schema) is always reachable.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from dotenv import load_dotenv

__all__ = ["get_conn", "DATABASE_URL"]

logger = logging.getLogger(__name__)

# backend/app/db.py -> parents[1] is the backend/ directory.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
_SEARCH_PATH = "public, extensions"


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    """Yield a psycopg 3 connection to Supabase Postgres.

    * Reads ``DATABASE_URL`` from ``backend/.env`` (raises ``RuntimeError`` if
      it is missing or empty -- we fail fast rather than silently connecting
      to the wrong database).
    * Forwards ``sslmode=require`` in the connection (Supabase Session pooler
      mandates TLS).
    * Sets ``search_path = public, extensions`` on every new connection so
      ``pg_trgm`` (installed in the ``extensions`` schema) is always reachable.
    """
    # Reload every call so a freshly edited .env is picked up without a
    # process restart (handy for one-off scripts).
    load_dotenv(_ENV_PATH, override=True)
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to backend/.env and try again."
        )

    conn = psycopg.connect(dsn, sslmode="require", autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute(f"SET search_path = {_SEARCH_PATH}")
        conn.commit()
    except Exception:
        conn.close()
        raise
    try:
        yield conn
    finally:
        conn.close()