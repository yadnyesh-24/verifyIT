#!/usr/bin/env python3
"""Import an MCA *Company Master Data* export into the local registry snapshot.

Usage
-----
    # 1. inspect an export without touching the database
    ./.venv/bin/python scripts/import_mca.py --file data/mca/company_master_data.csv --dry-run

    # 2. load it (applies sql/001_companies.sql first)
    ./.venv/bin/python scripts/import_mca.py --file data/mca/company_master_data.csv \\
        --source-date 2026-03-31

    # the MCA monthly bulk download is a ZIP - that works too
    ./.venv/bin/python scripts/import_mca.py --file data/mca/MCA_Company_Master.zip

The script is **header-driven**: column names are matched case-insensitively
against ``COLUMN_ALIASES`` (punctuation/whitespace insensitive) so the MCA bulk
export, the data.gov.in CSV and the monthly ZIP all work without edits. Only
``cin`` and a company name are required; every other column is optional and
unmapped headers are reported.

Nothing is invented or repaired:

* rows without a CIN or without a name are skipped and counted;
* duplicate CINs inside one export are collapsed (first row wins);
* unparseable dates are stored as ``NULL`` rather than guessed;
* re-importing a newer monthly export refreshes rows in place (upsert), so the
  snapshot can be advanced without losing the schema.

Exit codes: ``0`` ok, ``2`` bad usage / missing file / unusable export.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

# Allow ``python scripts/import_mca.py`` from the repository root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import db, mca  # noqa: E402  (import after sys.path setup)

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "sql" / "001_companies.sql"

#: Logical field -> accepted header spellings. Matching is exact after
#: normalisation ("Company Name", "company_name" and "COMPANY NAME" are the same
#: key), which keeps unrelated columns from being mis-claimed.
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    # The MCA bulk export spells the CIN column out in full while the portal and
    # data.gov.in use a short form. All of them must resolve, otherwise
    # ``resolve_columns`` cannot find the CIN and refuses the whole export.
    "cin": (
        "cin",
        "company cin",
        "cin number",
        "companycin",
        "cin of company",
        "cin of the company",
        "corporate identification number",
        "company identification number",
    ),
    "name": ("company name", "company_name", "companyname", "name of company", "name"),
    "status": ("company status", "company_status", "status", "company current status"),
    "company_class": ("company class", "company_class", "class of company", "class_of_company"),
    "company_category": ("company category", "company_category", "category of company"),
    "company_sub_category": (
        "company sub category",
        "company_sub_category",
        "sub category of company",
        "company_subcategory",
    ),
    "roc": ("roc", "roc code", "roc_code", "registrar of companies", "roc name"),
    "registration_number": (
        "registration number",
        "registration_number",
        "reg no",
        "registration no",
    ),
    "date_of_registration": (
        "date of registration",
        "date_of_registration",
        "date of incorporation",
        "date_of_incorporation",
        "registration date",
    ),
    "state": ("registered state", "registered_state", "state", "registered state code"),
    "district": ("district", "registered district", "registered_district"),
    "pincode": ("pincode", "pin code", "pin_code", "postal code", "registered pincode"),
    "email": ("email", "email id", "email_id", "email address", "email addr"),
    "address": (
        "registered office address",
        "registered_office_address",
        "address",
        "office address",
    ),
}

#: Columns written to the staging table / ``companies`` table, in order.
STAGE_COLUMNS: tuple[str, ...] = (
    "cin",
    "name",
    "name_normalized",
    "status",
    "company_class",
    "company_category",
    "company_sub_category",
    "roc",
    "registration_number",
    "date_of_registration",
    "state",
    "district",
    "pincode",
    "email",
    "address",
    "source_date",
)

#: Date spellings seen in MCA / data.gov.in exports.
_DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y", "%d %b %Y", "%d/%m/%y")


def normalize_header(header: str) -> str:
    """Normalise a CSV header for alias matching (BOM-safe, punctuation-free)."""
    text = header.lstrip("\ufeff").strip().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def resolve_columns(header: list[str]) -> tuple[dict[str, str], list[str]]:
    """Map logical fields to the actual headers found in ``header``.

    Returns ``(mapping, unmapped_headers)``. Raises ``ValueError`` when the CIN or
    the company name cannot be located, since the export would be unusable.
    """
    by_normalized = {normalize_header(name): name for name in header if name}
    mapping: dict[str, str] = {}
    claimed: set[str] = set()

    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            actual = by_normalized.get(alias)
            if actual is not None and actual not in claimed:
                mapping[field] = actual
                claimed.add(actual)
                break

    missing = [field for field in ("cin", "name") if field not in mapping]
    if missing:
        raise ValueError(
            "could not locate required column(s) "
            + ", ".join(missing)
            + f" in header: {header}"
        )

    unmapped = [name for name in header if name and name not in claimed]
    return mapping, unmapped


def parse_date(value: str | None) -> date | None:
    """Parse a date from an MCA export, or return ``None`` (never guess)."""
    text = (value or "").strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


# --- Reading the export ------------------------------------------------------


def _detect_encoding(sample: bytes) -> str:
    """Return the first codec that decodes ``sample`` (MCA exports vary)."""
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            sample.decode(encoding)
            return encoding
        except UnicodeDecodeError:
            continue
    return "latin-1"


def open_export(path: Path) -> tuple[Any, str]:
    """Open a ``.csv`` / ``.txt`` / ``.zip`` export and return ``(handle, label)``.

    A ZIP (the MCA monthly bulk download) is searched for its largest ``.csv``
    member. The caller closes the returned handle.
    """
    if not path.is_file():
        raise ValueError(f"file not found: {path}")

    if zipfile.is_zipfile(path):
        archive = zipfile.ZipFile(path)
        members = [m for m in archive.namelist() if m.lower().endswith((".csv", ".txt"))]
        if not members:
            archive.close()
            raise ValueError(f"no .csv member inside {path}")
        member = max(members, key=lambda name: archive.getinfo(name).file_size)
        return archive.open(member), f"{path}::{member}"

    return path.open("rb"), str(path)


def iter_stage_rows(
    handle: Any,
    columns: dict[str, str],
    source_date: date | None,
    stats: dict[str, int],
    *,
    limit: int | None = None,
) -> Iterator[tuple[Any, ...]]:
    """Yield rows shaped like ``STAGE_COLUMNS`` from an open export handle.

    Counters in ``stats`` are updated as rows are read so the caller can report
    exactly how much was skipped and why. Reading is lazy: the whole export is
    never held in memory.
    """

    def cell(row: dict[str, str], field: str) -> str | None:
        header = columns.get(field)
        if header is None:
            return None
        value = (row.get(header) or "").strip()
        return value or None

    import io

    encoding = _detect_encoding(handle.read(65536))
    handle.seek(0)
    # Works for a plain file handle and for a ZipExtFile alike.
    text = io.TextIOWrapper(handle, encoding=encoding, errors="replace", newline="")

    stats["encoding"] = encoding  # type: ignore[assignment]

    reader = csv.DictReader(text)
    header = [name for name in (reader.fieldnames or []) if name is not None]
    mapping, unmapped = resolve_columns(header)
    columns.update(mapping)
    stats["columns_mapped"] = len(mapping)  # type: ignore[assignment]
    stats["headers"] = len(header)  # type: ignore[assignment]
    stats["unmapped_headers"] = len(unmapped)  # type: ignore[assignment]

    for row in reader:
        stats["rows_read"] += 1
        if limit is not None and stats["rows_read"] > limit:
            stats["rows_read"] -= 1
            break

        cin = (cell(row, "cin") or "").upper().replace(" ", "")
        name = cell(row, "name")
        if not cin:
            stats["skipped_no_cin"] += 1
            continue
        if not name:
            stats["skipped_no_name"] += 1
            continue

        yield (
            cin,
            name,
            mca.normalize_name(name) or name.upper(),
            cell(row, "status"),
            cell(row, "company_class"),
            cell(row, "company_category"),
            cell(row, "company_sub_category"),
            cell(row, "roc"),
            cell(row, "registration_number"),
            parse_date(cell(row, "date_of_registration")),
            cell(row, "state"),
            cell(row, "district"),
            cell(row, "pincode"),
            cell(row, "email"),
            cell(row, "address"),
            source_date,
        )


# --- Writing to PostgreSQL ---------------------------------------------------

#: Staging table receives the raw export via COPY, so the upsert can be a single
#: set-based statement (millions of rows stay fast and memory stays flat).
_STAGE_DDL = """
CREATE TEMP TABLE mca_stage (
    cin                  text,
    name                 text,
    name_normalized      text,
    status               text,
    company_class        text,
    company_category     text,
    company_sub_category text,
    roc                  text,
    registration_number  text,
    date_of_registration date,
    state                text,
    district             text,
    pincode              text,
    email                text,
    address              text,
    source_date          date
) ON COMMIT DROP
"""

_COPY_SQL = f"COPY mca_stage ({', '.join(STAGE_COLUMNS)}) FROM STDIN"

_UPSERT_SQL = f"""
INSERT INTO companies ({", ".join(STAGE_COLUMNS)})
SELECT DISTINCT ON (cin) {", ".join(STAGE_COLUMNS)}
FROM mca_stage
WHERE cin <> '' AND name <> ''
ORDER BY cin, ctid
ON CONFLICT (cin) DO UPDATE SET
    name                 = EXCLUDED.name,
    name_normalized      = EXCLUDED.name_normalized,
    status               = EXCLUDED.status,
    company_class        = EXCLUDED.company_class,
    company_category     = EXCLUDED.company_category,
    company_sub_category = EXCLUDED.company_sub_category,
    roc                  = EXCLUDED.roc,
    registration_number  = EXCLUDED.registration_number,
    date_of_registration = EXCLUDED.date_of_registration,
    state                = EXCLUDED.state,
    district             = EXCLUDED.district,
    pincode              = EXCLUDED.pincode,
    email                = EXCLUDED.email,
    address              = EXCLUDED.address,
    source_date          = EXCLUDED.source_date,
    imported_at          = now()
"""


def import_export(
    path: Path,
    *,
    source_date: date | None = None,
    limit: int | None = None,
    truncate: bool = False,
    create_schema: bool = True,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Import an MCA export and return a report of what happened.

    ``dry_run=True`` never opens the database: it only parses the header and
    counts rows, which is the safe way to check an unfamiliar export.
    """
    started = time.monotonic()
    stats: dict[str, int] = {
        "rows_read": 0,
        "skipped_no_cin": 0,
        "skipped_no_name": 0,
        "rows_written": 0,
        "rows_collapsed": 0,
        "headers": 0,
        "columns_mapped": 0,
        "unmapped_headers": 0,
    }
    columns: dict[str, str] = {}
    samples: list[dict[str, Any]] = []

    if create_schema and not dry_run:
        db.apply_sql_file(SCHEMA_PATH)

    handle, label = open_export(path)
    try:
        if dry_run:
            rows = iter_stage_rows(handle, columns, source_date, stats, limit=limit)
            for row in rows:
                if len(samples) < 3:
                    samples.append(dict(zip(STAGE_COLUMNS, row)))
        else:
            with db.connection() as conn:
                with conn.cursor() as cur:
                    if truncate:
                        cur.execute("TRUNCATE companies")
                    cur.execute(_STAGE_DDL)
                    with cur.copy(_COPY_SQL) as copy:
                        for row in iter_stage_rows(
                            handle, columns, source_date, stats, limit=limit
                        ):
                            copy.write_row(row)
                    cur.execute(_UPSERT_SQL)
                    stats["rows_written"] = max(cur.rowcount, 0)
                    # Counted before the commit: the staging table is ON COMMIT DROP.
                    cur.execute("SELECT count(*) FROM mca_stage")
                    staged = int(cur.fetchone()[0])  # type: ignore[index]
                # One commit for the whole import keeps it atomic.
                conn.commit()
            stats["rows_collapsed"] = max(staged - stats["rows_written"], 0)
    finally:
        handle.close()

    report: dict[str, Any] = {
        "file": label,
        "dry_run": dry_run,
        "source_date": source_date.isoformat() if source_date else None,
        "truncated": truncate,
        "encoding": stats.get("encoding"),
        "headers": stats["headers"],
        "columns_mapped": stats["columns_mapped"],
        "unmapped_headers": stats["unmapped_headers"],
        "rows_read": stats["rows_read"],
        "skipped_no_cin": stats["skipped_no_cin"],
        "skipped_no_name": stats["skipped_no_name"],
        "rows_written": stats["rows_written"],
        "rows_collapsed": stats["rows_collapsed"],
        "columns": dict(columns),
        "elapsed_seconds": round(time.monotonic() - started, 2),
    }
    if dry_run:
        report["samples"] = samples
    return report


# --- CLI ---------------------------------------------------------------------


def _iso_date(value: str) -> date:
    """``argparse`` type accepting ``YYYY-MM-DD``."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"expected YYYY-MM-DD, got {value!r}") from exc


def print_report(report: dict[str, Any]) -> None:
    """Print a human-readable import report."""
    print(f"file                 : {report['file']}")
    print(f"mode                 : {'DRY RUN (no writes)' if report['dry_run'] else 'import'}")
    print(f"encoding             : {report['encoding']}")
    print(
        f"header columns       : {report['headers']} "
        f"({report['columns_mapped']} mapped, {report['unmapped_headers']} unmapped)"
    )
    for field, header in sorted(report["columns"].items()):
        print(f"    {field:<20} <- {header}")
    print(f"rows read            : {report['rows_read']}")
    print(f"    skipped (no CIN) : {report['skipped_no_cin']}")
    print(f"    skipped (no name): {report['skipped_no_name']}")
    print(f"rows written         : {report['rows_written']}")
    print(f"duplicate CINs merged: {report['rows_collapsed']}")
    print(f"source date          : {report['source_date']}")
    print(f"truncated first      : {report['truncated']}")
    print(f"elapsed              : {report['elapsed_seconds']}s")

    if report["dry_run"] and report["samples"]:
        print("\nfirst rows (dry run):")
        for sample in report["samples"]:
            preview = {
                key: sample[key]
                for key in ("cin", "name", "name_normalized", "status", "date_of_registration")
            }
            print(f"    {preview}")


def main(argv: list[str] | None = None) -> int:
    """Parse arguments, run the import and print the report."""
    parser = argparse.ArgumentParser(
        prog="import_mca.py",
        description=(
            "Import an MCA 'Company Master Data' export (CSV or ZIP) into the "
            "local Verify It registry snapshot."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--file", required=True, type=Path, help="CSV or ZIP export to import.")
    parser.add_argument(
        "--source-date",
        type=_iso_date,
        default=None,
        help="Snapshot date of the export (YYYY-MM-DD). Default: today.",
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Import at most N rows (smoke test)."
    )
    parser.add_argument(
        "--truncate", action="store_true", help="Delete existing rows first (full replace)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report only; never open the database.",
    )
    parser.add_argument(
        "--no-create-schema",
        action="store_true",
        help="Do not apply sql/001_companies.sql before importing.",
    )
    parser.add_argument(
        "--database-url", default=None, help="Override DATABASE_URL for this run."
    )
    args = parser.parse_args(argv)

    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    try:
        report = import_export(
            args.file,
            source_date=args.source_date or date.today(),
            limit=args.limit,
            truncate=args.truncate,
            create_schema=not args.no_create_schema,
            dry_run=args.dry_run,
        )
    except (ValueError, db.DatabaseUnavailable) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print_report(report)

    if not args.dry_run:
        print(f"\nregistry snapshot    : {mca.registry_stats()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
