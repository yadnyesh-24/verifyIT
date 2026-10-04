"""Check the registry snapshot that the ``company`` check reads.

The ``company`` check **never fails**: when the snapshot is missing, empty or
unreachable it honestly stays ``not_checked``. That is the right behaviour, but it
also means a broken snapshot is invisible from the API alone. This script makes
it visible in one command.

It reports

* which connection string is in use (password masked),
* whether PostgreSQL answers, and what version it is,
* whether ``pg_trgm``, the ``companies`` table and its trigram index exist,
* how many rows were imported and which snapshot date they carry,
* whether ``name_normalized`` is populated - an empty column silently disables
  the fuzzy name match, which is exactly what a dashboard CSV upload leaves
  behind,
* the most common company statuses, so the data can be eyeballed.

Exit codes: ``0`` ready, ``1`` reachable but not ready, ``2`` unreachable.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

# Allow ``python scripts/check_registry.py`` from the repository root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import db  # noqa: E402  (import after sys.path setup)

OK = "[ok]"
BAD = "[!!]"
INFO = "[--]"


def mask_password(url: str) -> str:
    """Return ``url`` with any password replaced by ``***``.

    Used so the report can be pasted into a chat without leaking credentials.
    """
    parts = urlsplit(url)
    if not parts.password:
        return url
    userinfo = f"{parts.username}:***" if parts.username else "***"
    netloc = f"{userinfo}@{parts.hostname or ''}"
    if parts.port:
        netloc = f"{netloc}:{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def _scalar(cur: Any, sql: str) -> Any:
    """Run ``sql`` and return the first column of the first row (``None`` if empty)."""
    cur.execute(sql)
    row = cur.fetchone()
    return None if row is None else row[0]


def _rows(cur: Any, sql: str) -> list[Any]:
    """Run ``sql`` and return every row."""
    cur.execute(sql)
    return list(cur.fetchall())


def _print_hints(url: str, error: str) -> None:
    """Print the likely cause of a connection failure.

    Every hint here is a mistake that is easy to make and hard to read from the
    driver's error message alone.
    """
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    lowered = error.lower()

    if "tenant/user" in lowered or "tenant or user not found" in lowered:
        print(f"{BAD}   the pooler username must be `postgres.<project-ref>` and the")
        print(f"{BAD}   host's region must match the project's region.")
    if "prepared statement" in lowered:
        print(f"{BAD}   port 6543 is Supabase's transaction pooler; use session mode (5432).")
    if parts.port == 6543:
        print(f"{BAD}   port 6543 is the transaction pooler - no prepared statements,")
        print(f"{BAD}   no TEMP tables. Use session mode, port 5432.")
    if host.endswith(".supabase.co") and not host.startswith("aws-"):
        print(f"{BAD}   `db.<project-ref>.supabase.co` is IPv6-only. Use the Supavisor")
        print(f"{BAD}   pooler host: aws-0-<region>.pooler.supabase.com")
    if "timeout" in lowered or "timed out" in lowered:
        print(f"{BAD}   the project may be paused (Free plan pauses after 7 days of")
        print(f"{BAD}   low activity) - resume it in the dashboard. Or raise --timeout.")
    if "connection refused" in lowered or "could not connect" in lowered:
        print(f"{BAD}   is PostgreSQL running? `brew services start postgresql@16`")


def main(argv: list[str] | None = None) -> int:
    """Run every check, print the report and return the exit code."""
    parser = argparse.ArgumentParser(
        prog="check_registry.py",
        description=(
            "Check the PostgreSQL registry snapshot behind the `company` check "
            "(connection, pg_trgm, schema, row count, name_normalized)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--database-url", default=None, help="Override DATABASE_URL for this run.")
    parser.add_argument(
        "--timeout", type=int, default=10, help="Connect timeout in seconds (default: 10)."
    )
    args = parser.parse_args(argv)

    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    url = db.database_url()
    print("Verify It - registry snapshot check")
    print(f"{INFO} connection: {mask_password(url)}")

    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover - the dependency is pinned
        print(f"{BAD} psycopg is not installed: {exc}")
        return 2

    try:
        conn = psycopg.connect(url, connect_timeout=args.timeout)
    except Exception as exc:
        print(f"{BAD} cannot connect: {exc}")
        _print_hints(url, str(exc))
        return 2

    ready = True
    try:
        with conn, conn.cursor() as cur:
            print(f"{OK} connected: {str(_scalar(cur, 'select version()')).split(',')[0]}")

            if _scalar(cur, "select 1 from pg_extension where extname = 'pg_trgm'") is None:
                print(f"{BAD} pg_trgm is not installed - apply sql/001_companies.sql")
                ready = False
            else:
                print(f"{OK} pg_trgm installed")

            if _scalar(cur, "select to_regclass('companies')") is None:
                print(f"{BAD} the `companies` table does not exist - apply sql/001_companies.sql")
                print(f"{BAD}   nothing is imported, so the check stays not_checked")
                return 1

            total = _scalar(cur, "select count(*) from companies")
            print(f"{OK if total else BAD} imported rows: {total}")

            if not total:
                print(f"{BAD} the snapshot is empty - see MCA_SETUP.md to import an export")
                return 1

            print(f"{INFO} newest snapshot date: {_scalar(cur, 'select max(source_date) from companies')}")

            named = _scalar(
                cur, "select count(*) from companies where coalesce(name_normalized, '') <> ''"
            )
            if named:
                print(f"{OK} name_normalized populated: {named}/{total}")
            else:
                print(f"{BAD} name_normalized is EMPTY - the fuzzy name match returns nothing")
                print(f"{BAD}   re-import with scripts/import_mca.py, not a dashboard CSV upload")
                ready = False

            index = _scalar(
                cur,
                "select 1 from pg_indexes where tablename = 'companies' "
                "and indexname = 'companies_name_normalized_trgm_idx'",
            )
            if index is None:
                print(f"{BAD} trigram index missing - name lookups scan the whole table")
                ready = False
            else:
                print(f"{OK} trigram index present")

            statuses = _rows(
                cur,
                "select coalesce(status, '(null)'), count(*) from companies "
                "group by 1 order by 2 desc limit 5",
            )
            print(f"{INFO} top statuses: {', '.join(f'{row[0]}={row[1]}' for row in statuses)}")
    finally:
        conn.close()

    if ready:
        print(f"{OK} registry ready - the `company` check can answer")
        return 0
    print(f"{BAD} registry NOT ready - the `company` check will stay not_checked")
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
