"""Import data/raw/all_india_pincode_directory_2025.csv into Supabase.

What it does, top to bottom:

1. Truncates both ``pincode_offices`` and ``pincodes`` (idempotent reruns).
2. Streams the CSV in 50,000-row chunks (8 GB laptop, low memory pressure).
3. Cleans each row:
     * state_norm = normalize_state(statename) (None if unmappable)
     * pincode must be exactly 6 digits and start with 1-9 (counted as dropped
       otherwise)
     * latitude / longitude "NA", blank, or outside India's bounding box
       (lat 6-38, lon 68-98) become NULL
4. COPYs the cleaned rows into ``pincode_offices`` via psycopg's
   ``cursor.copy`` (fast, ~50x faster than per-row INSERTs).
5. Builds the ``pincodes`` rollup with a single ``INSERT ... SELECT ...
   GROUP BY`` so Postgres does the aggregation in SQL, not Python.
6. Prints a summary (rows read, rows loaded, rows dropped, distinct
   pincodes, pincodes with NULL state, elapsed seconds).

The whole script runs inside one transaction; if anything fails the database
is left untouched.
"""
from __future__ import annotations

import io
import logging
import re
import sys
import time
from pathlib import Path
from typing import Iterable

import pandas as pd

# Make ``app`` importable when run directly from the repo root (pytest.ini
# does the same thing for the test runner via ``pythonpath``).
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.db import get_conn  # noqa: E402
from app.normalize import normalize_state  # noqa: E402

logger = logging.getLogger("import_pincodes")

# Chunk size is tuned for an 8 GB laptop: 50k rows * ~12 columns of strings
# fits comfortably under 200 MB resident.
CHUNK_SIZE = 50_000

# CSV columns the India Post directory ships with.
CSV_COLUMNS = [
    "circlename",
    "regionname",
    "divisionname",
    "officename",
    "pincode",
    "officetype",
    "delivery",
    "district",
    "statename",
    "latitude",
    "longitude",
]

# Columns we actually load into pincode_offices (plus state_norm).
TARGET_COLUMNS = [
    "officename",
    "pincode",
    "officetype",
    "delivery",
    "district",
    "statename",
    "state_norm",
    "latitude",
    "longitude",
]

# India's bounding box (generous on the edges so we don't clip legitimate
# coordinates in the Andamans, Lakshadweep or the northern mountains).
_LAT_MIN, _LAT_MAX = 6.0, 38.0
_LON_MIN, _LON_MAX = 68.0, 98.0

# 6 digits, first digit 1-9 (excludes codes like "012345" which are not
# Indian pincodes).
_PINCODE_RE = re.compile(r"^[1-9]\d{5}$")

# Latitude / longitude come in as strings, often "NA" or blank.
_NA_TOKENS = {"", "NA", "N/A", "NONE", "NULL"}
def _clean_coord(raw: object) -> float | None:
    """Parse a coordinate string to ``float`` or ``None`` if it's unusable."""
    if raw is None:
        return None
    text = str(raw).strip()
    if text.upper() in _NA_TOKENS:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return value


def _clean_row(row: dict) -> dict | None:
    """Clean one source row. Returns ``None`` if it should be dropped."""
    # Pincode must be exactly 6 digits, first digit 1-9.
    raw_pin = row.get("pincode")
    pin_str = "" if raw_pin is None else str(raw_pin).strip()
    if not _PINCODE_RE.fullmatch(pin_str):
        return None

    # Coordinates: NULL when missing or out of India's bounding box.
    lat = _clean_coord(row.get("latitude"))
    if lat is not None and not (_LAT_MIN <= lat <= _LAT_MAX):
        lat = None
    lon = _clean_coord(row.get("longitude"))
    if lon is not None and not (_LON_MIN <= lon <= _LON_MAX):
        lon = None

    state_raw = row.get("statename")
    return {
        "officename": row.get("officename"),
        "pincode": pin_str,
        "officetype": row.get("officetype"),
        "delivery": row.get("delivery"),
        "district": row.get("district"),
        "statename": state_raw,
        "state_norm": normalize_state(state_raw),
        "latitude": lat,
        "longitude": lon,
    }


def _build_copy_buffer(rows: Iterable[dict]) -> tuple[io.StringIO, int]:
    """Serialise cleaned rows as a TSV string for ``cursor.copy``.

    psycopg's ``copy`` accepts a file-like object opened in text mode and
    reads TSV (tab-separated, newline-terminated, ``\\N`` for NULL by
    default). We build the buffer in-memory so we never touch the filesystem
    for staging data.
    """
    buf = io.StringIO()
    count = 0
    for row in rows:
        buf.write(
            "\t".join(
                "\\N" if row[col] is None
                else str(row[col]).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ")
                for col in TARGET_COLUMNS
            )
        )
        buf.write("\n")
        count += 1
    buf.seek(0)
    return buf, count


def _copy_chunk(cur, rows: list[dict]) -> int:
    """COPY one cleaned chunk into ``pincode_offices``; return rows loaded."""
    buf, count = _build_copy_buffer(rows)
    columns_sql = ", ".join(TARGET_COLUMNS)
    copy_stmt = f"COPY pincode_offices ({columns_sql}) FROM STDIN"
    with cur.copy(copy_stmt) as copy:
        copy.write(buf.getvalue())
    return count


def _build_pincodes_sql() -> str:
    """Return the ``INSERT ... SELECT ... GROUP BY`` that materialises ``pincodes``.

    * state_norm / district -> ``MODE() WITHIN GROUP (ORDER BY ...)``: the
      value that occurs most often for this pincode. Ties are broken
      alphabetically so the result is deterministic.
    * lat / lon -> ``AVG`` over the rows with non-null coordinates (the
      loader already coerced out-of-bounds values to NULL).
    * office_count -> ``COUNT(*)``.
    """
    return """
        INSERT INTO pincodes
            (pincode, state_norm, district, lat, lon, office_count)
        SELECT
            pincode,
            MODE() WITHIN GROUP (ORDER BY state_norm) AS state_norm,
            MODE() WITHIN GROUP (ORDER BY district)   AS district,
            AVG(latitude)                             AS lat,
            AVG(longitude)                            AS lon,
            COUNT(*)                                  AS office_count
        FROM pincode_offices
        GROUP BY pincode
    """
def run() -> int:
    csv_path = _BACKEND.parent / "data" / "raw" / "all_india_pincode_directory_2025.csv"
    if not csv_path.exists():
        print(f"CSV not found at {csv_path}", file=sys.stderr)
        return 1

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    rows_read = 0
    rows_dropped = 0
    rows_loaded = 0
    started = time.perf_counter()

    logger.info("starting import from %s", csv_path)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Wipe both tables so the script is idempotent. RESTART
            #    IDENTITY keeps the bigserial tidy across reruns.
            cur.execute("TRUNCATE TABLE pincode_offices, pincodes RESTART IDENTITY")

            # 2. Stream the CSV in chunks; clean each row; COPY into
            #    pincode_offices.
            for chunk_idx, chunk in enumerate(
                pd.read_csv(
                    csv_path,
                    chunksize=CHUNK_SIZE,
                    dtype=str,                # keep everything as text -- we clean ourselves
                    na_filter=False,           # "NA" is a real latitude value here, treat it as text
                    keep_default_na=False,
                    usecols=CSV_COLUMNS,
                )
            ):
                cleaned: list[dict] = []
                for raw_row in chunk.to_dict(orient="records"):
                    rows_read += 1
                    cleaned_row = _clean_row(raw_row)
                    if cleaned_row is None:
                        rows_dropped += 1
                        continue
                    cleaned.append(cleaned_row)
                if cleaned:
                    rows_loaded += _copy_chunk(cur, cleaned)
                logger.info(
                    "chunk %d: read=%d loaded=%d dropped=%d",
                    chunk_idx, len(chunk), len(cleaned), len(chunk) - len(cleaned),
                )

            # 3. Roll the offices up to one row per pincode in SQL.
            cur.execute(_build_pincodes_sql())

            # 4. Stats for the summary.
            cur.execute("SELECT COUNT(*) FROM pincodes")
            distinct_pincodes = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM pincodes WHERE state_norm IS NULL")
            null_state_pincodes = cur.fetchone()[0]

        conn.commit()

    elapsed = time.perf_counter() - started

    # Summary printed on stdout (easy to grep / pipe).
    print(f"rows_read         : {rows_read}")
    print(f"rows_loaded       : {rows_loaded}")
    print(f"rows_dropped      : {rows_dropped}")
    print(f"distinct_pincodes : {distinct_pincodes}")
    print(f"null_state        : {null_state_pincodes}")
    print(f"elapsed_seconds   : {elapsed:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())