"""Database connection helpers for the Supabase toolchain.

A single ``get_conn()`` context manager is used by every script that touches
Supabase Postgres (the pincode / state imports). It opens a psycopg 3 connection
with ``sslmode=require`` (the Session pooler mandates TLS) and sets ``search_path``
so the ``pg_trgm`` extension (installed in the ``extensions`` schema) is always
reachable.

**This is not the API's database door.** ``backend/db.py`` is the registry
connection the API uses, and it reads the real environment plus the repository
``.env``. This module is a separate, deliberate connection to Supabase, configured
from ``backend/.env``.

Configuration precedence is explicit and non-destructive:

1. the ``DATABASE_URL`` **environment variable** (what a shell, CI job or test
   harness exports), then
2. ``DATABASE_URL`` in ``backend/.env``.

The file is read, never *loaded into* ``os.environ``. An earlier version called
``load_dotenv(_ENV_PATH, override=True)``, which wrote Supabase's URL into the whole
process and would silently repoint ``backend/db.py`` - the API's registry door - at
Supabase for the rest of the run. Reading the file, and letting the environment win,
keeps the two connections independent and the precedence predictable.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from dotenv import dotenv_values

__all__ = ["get_conn", "resolve_dsn"]

logger = logging.getLogger(__name__)

# backend/app/db.py -> parents[1] is the backend/ directory.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
_SEARCH_PATH = "public, extensions"


def resolve_dsn(env_path: Path | None = None) -> str | None:
    """Return the Supabase DSN to use, or ``None`` when it is not configured.

    Precedence, highest first, so an explicit setting always wins:

    1. the ``DATABASE_URL`` environment variable,
    2. ``DATABASE_URL`` in ``backend/.env`` (``env_path`` overrides the location for
       tests).

    ``os.environ`` is only ever *read*. The ``.env`` file is parsed into a local
    mapping, so nothing here can leak into the process and change what
    ``backend/db.py`` connects to.
    """
    from_env = os.environ.get("DATABASE_URL")
    if from_env:
        return from_env

    path = env_path or _ENV_PATH
    if not path.exists():
        return None
    value = dotenv_values(path).get("DATABASE_URL")
    return value or None


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    """Yield a psycopg 3 connection to Supabase Postgres.

    * Resolves ``DATABASE_URL`` through :func:`resolve_dsn` and raises
      ``RuntimeError`` when it is missing or empty -- we fail fast rather than
      silently connecting to the wrong database.
    * Forwards ``sslmode=require`` in the connection (Supabase Session pooler
      mandates TLS).
    * Sets ``search_path = public, extensions`` on every new connection so
      ``pg_trgm`` (installed in the ``extensions`` schema) is always reachable.
    """
    # Resolved per call, so a freshly edited .env is picked up without a process
    # restart -- without ever writing it back into os.environ.
    dsn = resolve_dsn()
    if not dsn:
        raise RuntimeError(
            "DATABASE_URL is not set. Export it, or add it to backend/.env, and "
            "try again."
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