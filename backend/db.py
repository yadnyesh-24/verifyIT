"""Database access for the Verify It backend.

The only registry data available today is a **local** PostgreSQL snapshot of the
MCA *Company Master Data* register (see ``MCA_SETUP.md``). This module is the
single door to it - nothing else in the backend opens a connection.

Design rules:

* **No external network calls.** ``DATABASE_URL`` points at a local database.
* **Never break the API.** When the database is missing, empty or unreachable,
  every helper degrades to "no information" (``None`` / ``False``) so the API
  keeps returning honest ``not_checked`` placeholders instead of guessing or
  erroring.
* **Never invent registry data.** Rows come from an imported government export
  and are returned exactly as stored.

``DATABASE_URL`` overrides the default connection string.
"""

from __future__ import annotations

import contextlib
import logging
import os
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)

#: Connection string used when ``DATABASE_URL`` is not set: the local Homebrew
#: PostgreSQL, database ``verifyit``, current OS user, no password.
DEFAULT_DATABASE_URL = "postgresql://127.0.0.1:5432/verifyit"

#: Seconds to wait for a connection before giving up, so ``/api/verify`` stays
#: responsive even when PostgreSQL is not running.
CONNECT_TIMEOUT_SECONDS = 2


class DatabaseUnavailable(RuntimeError):
    """Raised when the configured registry database cannot be reached."""


def database_url() -> str:
    """Return the connection string in use (``DATABASE_URL`` or the default)."""
    return os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL


@contextlib.contextmanager
def connection(*, connect_timeout: int = CONNECT_TIMEOUT_SECONDS) -> Iterator[Any]:
    """Yield an open ``psycopg`` connection.

    Raises ``DatabaseUnavailable`` when the driver is missing or the server
    cannot be reached, so callers can decide how to degrade.
    """
    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover - the dependency is pinned
        raise DatabaseUnavailable("psycopg is not installed") from exc

    try:
        conn = psycopg.connect(database_url(), connect_timeout=connect_timeout)
    except Exception as exc:
        raise DatabaseUnavailable(str(exc)) from exc

    try:
        yield conn
    finally:
        conn.close()


def fetch_all(
    sql: str,
    params: dict[str, Any] | None = None,
    *,
    connect_timeout: int = CONNECT_TIMEOUT_SECONDS,
) -> list[dict[str, Any]] | None:
    """Run ``sql`` and return the rows as dicts.

    Returns ``None`` - never raises - when the database is unreachable **or** the
    query fails (e.g. the ``companies`` table has not been created yet). Callers
    treat ``None`` as "no information available" and keep the honest
    ``not_checked`` placeholder.
    """
    from psycopg.rows import dict_row

    try:
        with connection(connect_timeout=connect_timeout) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(sql, params)
                if cur.description is None:
                    return []
                return list(cur.fetchall())
    except Exception as exc:
        logger.debug("registry database returned no rows: %s", exc)
        return None


def is_available(*, connect_timeout: int = CONNECT_TIMEOUT_SECONDS) -> bool:
    """Return ``True`` only when the configured database answers a trivial query."""
    return fetch_all("SELECT 1 AS ok", connect_timeout=connect_timeout) is not None


def apply_sql_file(path: str | Path) -> None:
    """Execute a ``.sql`` script against the configured database.

    Uses ``psycopg.ClientCursor`` (simple protocol) so a script with several
    statements - ``CREATE EXTENSION``, ``CREATE TABLE``, ``CREATE INDEX`` - runs
    in one call. Raises ``DatabaseUnavailable`` if the server cannot be reached.
    """
    import psycopg

    script = Path(path).read_text(encoding="utf-8")
    with connection() as conn:
        with psycopg.ClientCursor(conn) as cur:
            cur.execute(script)
        conn.commit()
