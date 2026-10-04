"""MCA *Company Master Data* lookups against the local registry snapshot.

Deterministic, offline helpers that compare the manufacturer name / CIN printed
on a label with a locally imported snapshot of the MCA Company Master Data
register (schema: ``sql/001_companies.sql``; importer: ``scripts/import_mca.py``;
setup: ``MCA_SETUP.md``).

Honest-by-construction rules:

* **Absence is not evidence.** A name that does not match the snapshot is *not*
  reported as a failure - the snapshot is a fixed export and may lag.
* **CIN beats name.** A CIN is a unique statutory identifier, so an exact CIN hit
  is a real registry record; a name is only matched fuzzily (``pg_trgm``) and is
  therefore a weaker signal that must be confirmed.
* **No network I/O and no invented records.** Every value returned here was
  imported verbatim from the government export.

The functions accept an optional ``conn`` so tests can run against an isolated
temporary table; production callers rely on ``backend.db``.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from backend import db

#: Minimum trigram similarity for a name to be considered a match at all.
#: Tuned so "Nestle India Ltd" still hits "Nestle India Limited" after
#: normalisation, without matching unrelated companies. Recorded in the flag
#: evidence so the threshold can be revisited with real data.
NAME_MATCH_THRESHOLD = 0.62

#: Company columns returned by every query. Dates are cast to text so the values
#: stay JSON-serialisable when they end up in a flag's ``evidence``.
_COLUMNS = (
    "cin, name, status, company_class, company_category, roc, "
    "registration_number, date_of_registration::text AS date_of_registration, "
    "state, district, pincode, email"
)

#: Legal-form tokens carrying no identity information. Dropped during
#: normalisation so "ACME PVT LTD" and "ACME LIMITED" match each other. Tokens
#: with meaning (INDIA, AGRO, FOODS, ...) are deliberately kept.
_LEGAL_FORM_TOKENS = frozenset(
    {
        "PVT",
        "PRIVATE",
        "LTD",
        "LIMITED",
        "LLP",
        "OPC",
        "PLC",
        "INC",
        "INCORPORATED",
        "CORP",
        "CORPORATION",
        "COMPANY",
        "CO",
    }
)

#: Glue words left dangling once punctuation is removed; stripped from the ends.
_GLUE_TOKENS = frozenset({"AND", "OF", "THE"})


def normalize_name(name: str) -> str:
    """Return the matching key for a company name.

    Upper-cases, transliterates accents, turns ``&`` into ``AND``, removes all
    punctuation and drops legal-form tokens (``PVT``, ``LTD``, ``PRIVATE``, ...)
    so equivalent spellings collapse to one key. Returns ``""`` for input that
    carries no name information.
    """
    text = unicodedata.normalize("NFKD", name)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.upper().replace("&", " AND ")
    text = re.sub(r"[^A-Z0-9]+", " ", text)

    tokens = [token for token in text.split() if token not in _LEGAL_FORM_TOKENS]
    while tokens and tokens[0] in _GLUE_TOKENS:
        tokens.pop(0)
    while tokens and tokens[-1] in _GLUE_TOKENS:
        tokens.pop()
    return " ".join(tokens)


def _rows(sql: str, params: dict[str, Any], conn: Any | None) -> list[dict[str, Any]]:
    """Run a query, returning ``[]`` when the registry has nothing to say.

    With an explicit ``conn`` (tests) errors propagate; otherwise a missing or
    unreachable database yields an empty result, which keeps the API's
    ``not_checked`` placeholder intact.
    """
    if conn is not None:
        from psycopg.rows import dict_row

        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            if cur.description is None:
                return []
            return list(cur.fetchall())

    rows = db.fetch_all(sql, params)
    return rows if rows is not None else []


def find_by_cin(
    cin: str | None,
    *,
    name: str | None = None,
    conn: Any | None = None,
) -> dict[str, Any] | None:
    """Return the register row whose CIN matches exactly, or ``None``.

    The CIN is compared upper-cased with surrounding whitespace removed (a label
    often prints it with spaces); nothing else is guessed.

    When ``name`` is supplied the row also carries ``name_similarity``: the
    ``pg_trgm`` similarity between the *normalised* supplied name and the row's
    stored ``name_normalized``. Normalising both sides is what makes an ordinary
    legal-suffix variation collapse to the same key ("Acme Foods Pvt Ltd" and
    "Acme Foods Limited" both become ``ACME FOODS``).

    It is computed in the **same statement** as the lookup, deliberately: the
    caller is then never handed a CIN match it cannot compare the printed name
    against, and an extra round trip cannot fail on its own and quietly turn a
    conflicting name into a clean pass.
    """
    value = (cin or "").strip().upper()
    if not value:
        return None

    needle = normalize_name(name or "")
    params: dict[str, Any] = {"cin": value}
    if needle:
        params["needle"] = needle
        compared = (
            "round(similarity(name_normalized, %(needle)s)::numeric, 4)::float8 "
            "AS name_similarity"
        )
    else:
        compared = "NULL::float8 AS name_similarity"

    rows = _rows(
        f"SELECT {_COLUMNS}, 1.0::float8 AS similarity, {compared} "
        "FROM companies WHERE cin = %(cin)s LIMIT 1",
        params,
        conn,
    )
    return rows[0] if rows else None


def search_by_name(
    name: str | None,
    *,
    limit: int = 5,
    conn: Any | None = None,
) -> list[dict[str, Any]]:
    """Return the closest register rows for ``name`` (best first).

    Uses the ``pg_trgm`` similarity operator so the
    ``companies_name_normalized_trgm_idx`` GIN index is used. Rows are returned
    regardless of the threshold so callers can inspect near misses;
    ``match_company`` applies the threshold.
    """
    needle = normalize_name(name or "")
    if not needle:
        return []

    rows = _rows(
        f"SELECT {_COLUMNS}, similarity(name_normalized, %(needle)s) AS similarity "
        "FROM companies WHERE name_normalized %% %(needle)s "
        "ORDER BY similarity DESC, name ASC LIMIT %(limit)s",
        {"needle": needle, "limit": int(limit)},
        conn,
    )
    for row in rows:
        row["similarity"] = round(float(row["similarity"]), 4)
    return rows


def match_company(
    *,
    name: str | None = None,
    cin: str | None = None,
    conn: Any | None = None,
) -> dict[str, Any] | None:
    """Return the best register match for a label, or ``None``.

    A CIN is tried first and, when found, the row is returned with
    ``matched_on == "cin"``. Because the supplied ``name`` is passed along, that
    row also carries ``name_similarity`` - the resemblance between the printed
    maker name and the register's own name - so callers can check that the two
    actually agree instead of trusting the CIN alone.

    Otherwise the name is matched fuzzily and returned with ``matched_on ==
    "name"`` only when the similarity reaches ``NAME_MATCH_THRESHOLD``. ``None``
    means "no confident match" - which, per the rules above, is not a statement
    about whether the company exists.
    """
    by_cin = find_by_cin(cin, name=name, conn=conn)
    if by_cin is not None:
        by_cin["matched_on"] = "cin"
        return by_cin

    candidates = search_by_name(name, limit=1, conn=conn)
    if not candidates:
        return None

    best = candidates[0]
    if best["similarity"] < NAME_MATCH_THRESHOLD:
        return None

    best["matched_on"] = "name"
    return best


def registry_stats(*, conn: Any | None = None) -> dict[str, Any]:
    """Return ``{"connected", "companies", "latest_source_date"}`` for the snapshot.

    Diagnostics only - deliberately not exposed over HTTP, so the frozen API
    contract stays untouched. ``connected: False`` also covers "the table has not
    been created yet".
    """
    rows = _rows(
        "SELECT count(*)::int AS companies, max(source_date)::text AS latest_source_date "
        "FROM companies",
        {},
        conn,
    )
    if not rows:
        return {"connected": False, "companies": None, "latest_source_date": None}

    stats = dict(rows[0])
    stats["connected"] = True
    return stats
