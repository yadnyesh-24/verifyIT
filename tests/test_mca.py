"""Tests for the MCA registry layer (``backend.mca``) and the company check.

Three groups:

* **Pure** - ``normalize_name`` plus the importer's header/date helpers. No I/O.
* **Database** - the matcher against an isolated ``TEMP TABLE companies`` created
  inside the test session. The rows are *synthetic fixtures* (their CINs start
  with ``TESTFIXTURE``): they shadow the real table only for that connection,
  are never written to the persistent table and are never returned by the API.
  Skipped when the local registry database is unreachable.
* **Policy** - ``providers.check_company`` mapping a register row to the frozen
  check contract, driven by a stubbed matcher so no registry data is invented.
"""

import importlib.util
import json
import pathlib
from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend import db, mca, providers
from backend.main import app

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "sql" / "001_companies.sql"


def _load_importer():
    """Import ``scripts/import_mca.py`` by path (``scripts/`` is not a package)."""
    path = REPO_ROOT / "scripts" / "import_mca.py"
    spec = importlib.util.spec_from_file_location("import_mca", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


importer = _load_importer()


# --- Pure: name normalisation -------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Nestle India Limited", "NESTLE INDIA"),
        ("Nestle India Ltd.", "NESTLE INDIA"),
        ("  NESTLE   INDIA   PVT  LTD  ", "NESTLE INDIA"),
        ("Acme & Co. Pvt. Ltd.", "ACME"),
        ("Café Foods Private Limited", "CAFE FOODS"),
        ("M/s. Gupta Traders & Sons", "M S GUPTA TRADERS AND SONS"),
        ("India Limited Foods", "INDIA FOODS"),  # INDIA is part of the name, kept
        ("", ""),
        ("   ", ""),
        ("Pvt Ltd", ""),  # only legal-form tokens -> no name information
    ],
)
def test_normalize_name(raw: str, expected: str) -> None:
    """Equivalent spellings collapse to one matching key; meaning is preserved."""
    assert mca.normalize_name(raw) == expected


def test_normalize_name_threshold_is_documented() -> None:
    """The published threshold must stay inside the 0-1 similarity range."""
    assert 0.0 < mca.NAME_MATCH_THRESHOLD < 1.0


def test_trigram_floor_prunes_without_hiding_matches() -> None:
    """The SQL similarity floor must cut the index scan, never a real match.

    ``pg_trgm``'s 0.30 default makes the GIN index hand back ~150k candidates
    for a two-word name on the full snapshot - seconds per lookup. The floor in
    ``backend.db`` lifts that, so it has to stay above the default and strictly
    below ``NAME_MATCH_THRESHOLD``, otherwise a name the matcher would have
    accepted would never reach it.
    """
    floor = float(db.SESSION_SETTINGS["pg_trgm.similarity_threshold"])
    assert 0.30 < floor < mca.NAME_MATCH_THRESHOLD


def test_registry_search_path_can_reach_pg_trgm_in_any_schema() -> None:
    """``pg_trgm`` is in ``public`` locally and in ``extensions`` on Supabase.

    The registry connection has to be able to call ``similarity()`` / ``%`` on
    either, otherwise the company check silently degrades to ``not_checked``
    because ``db.fetch_all`` swallows the "function does not exist" error.
    """
    search_path = db.SESSION_SETTINGS["search_path"]
    schemas = [part.strip() for part in search_path.split(",")]
    assert "public" in schemas  # the companies table lives here on both setups
    assert "extensions" in schemas  # where Supabase installs pg_trgm


def test_registry_connection_is_local_unless_asked_otherwise() -> None:
    """With no ``DATABASE_URL`` the API must never reach a cloud database.

    The Supabase database is the pincode/state ingestion toolchain's, reached only
    through ``backend/app/db.py``. The API's default has to stay on loopback so a
    missing ``.env`` can never silently point the registry at the cloud.
    """
    assert db.DEFAULT_DATABASE_URL.startswith("postgresql://127.0.0.1:5432/")
    assert "sslmode" not in db.DEFAULT_DATABASE_URL


def test_api_never_uses_the_supabase_toolchain_connection() -> None:
    """Guard the seam between the two database doors.

    ``backend/db.py`` is the registry door the API uses; ``backend/app/db.py`` is
    the Supabase toolchain (pincode/state imports) and mandates ``sslmode=require``
    plus its own ``backend/.env``. If the request path ever picked it up, the API
    would switch databases depending on which ``.env`` happened to exist.
    """
    for name in ("main.py", "mca.py", "providers.py", "db.py"):
        source = (REPO_ROOT / "backend" / name).read_text(encoding="utf-8")
        assert "app.db" not in source, f"backend/{name} reaches the Supabase toolchain"
        assert "get_conn" not in source, f"backend/{name} uses the toolchain connection"


# --- Pure: importer header/date helpers ---------------------------------------


def test_resolve_columns_maps_data_gov_in_style_headers() -> None:
    """data.gov.in / MCA headers resolve regardless of case or punctuation."""
    header = [
        "CIN",
        "Company Name",
        "Company_Status",
        "Class of Company",
        "Date of Registration",
        "Registered State",
        "Pin Code",
    ]
    mapping, unmapped = importer.resolve_columns(header)
    assert mapping["cin"] == "CIN"
    assert mapping["name"] == "Company Name"
    assert mapping["status"] == "Company_Status"
    assert mapping["company_class"] == "Class of Company"
    assert mapping["date_of_registration"] == "Date of Registration"
    assert mapping["state"] == "Registered State"
    assert mapping["pincode"] == "Pin Code"
    assert unmapped == []


def test_resolve_columns_reports_unmapped_headers() -> None:
    """Unknown columns are reported, never silently mis-claimed."""
    mapping, unmapped = importer.resolve_columns(["CIN", "Company Name", "Mystery Column"])
    assert set(mapping) == {"cin", "name"}
    assert unmapped == ["Mystery Column"]


def test_resolve_columns_requires_cin_and_name() -> None:
    """An export without a CIN or a name is unusable."""
    with pytest.raises(ValueError):
        importer.resolve_columns(["Company Name", "Company Status"])
    with pytest.raises(ValueError):
        importer.resolve_columns(["CIN", "Company Status"])


def test_resolve_columns_maps_the_mca_bulk_export_headers() -> None:
    """The MCA bulk download spells the CIN column out in full.

    Its headers must resolve too, otherwise the importer refuses the whole
    export with "the CIN could not be located".
    """
    header = [
        "corporate_identification_number",
        "company_name",
        "company_status",
        "company_class",
        "company_category",
        "company_sub_category",
        "date_of_registration",
        "registered_state",
        "registrar_of_companies",
        "email_addr",
        "registered_office_address",
    ]
    mapping, unmapped = importer.resolve_columns(header)
    assert unmapped == []
    assert mapping["cin"] == "corporate_identification_number"
    assert mapping["name"] == "company_name"
    assert mapping["status"] == "company_status"
    assert mapping["roc"] == "registrar_of_companies"
    assert mapping["email"] == "email_addr"
    assert mapping["address"] == "registered_office_address"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("31/03/2026", date(2026, 3, 31)),
        ("2026-03-31", date(2026, 3, 31)),
        ("31-03-2026", date(2026, 3, 31)),
        ("01-Apr-2010", date(2010, 4, 1)),
        ("", None),
        ("not a date", None),
        ("31/13/2026", None),
    ],
)
def test_parse_date(raw: str, expected: date | None) -> None:
    """Known MCA date spellings parse; anything else is ``None`` (never guessed)."""
    assert importer.parse_date(raw) == expected


# --- Importer end to end without a database (dry run) -------------------------

_CSV = (
    "CIN,Company Name,Company Status,Date of Registration,Registered State\n"
    "TESTFIXTURE-CIN-0001,TEST FIXTURE FOODS PRIVATE LIMITED,Active,31/03/2026,MAHARASHTRA\n"
    "TESTFIXTURE-CIN-0002,TEST FIXTURE MILLS LIMITED,Strike Off,01-Apr-2010,GUJARAT\n"
    ",TEST FIXTURE NO CIN LIMITED,Active,,\n"
    "TESTFIXTURE-CIN-0004,,Active,,\n"
)


def _write_csv(tmp_path: pathlib.Path) -> pathlib.Path:
    path = tmp_path / "company_master_data.csv"
    path.write_text(_CSV, encoding="utf-8")
    return path


def test_dry_run_parses_without_touching_the_database(tmp_path: pathlib.Path) -> None:
    """A dry run maps the header, counts skips and writes nothing."""
    report = importer.import_export(
        _write_csv(tmp_path), source_date=date(2026, 3, 31), dry_run=True
    )
    assert report["dry_run"] is True
    assert report["rows_read"] == 4
    assert report["skipped_no_cin"] == 1
    assert report["skipped_no_name"] == 1
    assert report["rows_written"] == 0
    assert report["rows_collapsed"] == 0
    assert report["columns"]["name"] == "Company Name"
    assert report["samples"][0]["name_normalized"] == "TEST FIXTURE FOODS"
    assert report["samples"][0]["date_of_registration"] == date(2026, 3, 31)
    assert report["samples"][0]["cin"] == "TESTFIXTURE-CIN-0001"


def test_dry_run_honours_limit(tmp_path: pathlib.Path) -> None:
    """``--limit`` stops reading, so a huge export can be sampled cheaply."""
    report = importer.import_export(_write_csv(tmp_path), limit=2, dry_run=True)
    assert report["rows_read"] == 2


def test_dry_run_rejects_a_missing_file(tmp_path: pathlib.Path) -> None:
    """A missing export is a usage error (exit code 2), not a crash."""
    assert importer.main(["--file", str(tmp_path / "nope.csv"), "--dry-run"]) == 2


def test_constitution_schema_is_idempotent() -> None:
    """``sql/001_companies.sql`` must be safe to re-apply and must keep trigram."""
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in sql
    assert "CREATE TABLE IF NOT EXISTS companies" in sql
    assert "gin_trgm_ops" in sql
    assert "name_normalized" in sql


# --- Database: the matcher against an isolated TEMP TABLE ---------------------

#: Synthetic fixtures. The CINs deliberately start with "TESTFIXTURE" so they can
#: never collide with a real 21-character CIN, and the rows only ever exist in a
#: session-local temporary table - the persistent table is never written to.
_FIXTURES = (
    (
        "TESTFIXTURE-CIN-0001",
        "TEST FIXTURE FOODS PRIVATE LIMITED",
        "TEST FIXTURE FOODS",
        "Active",
    ),
    ("TESTFIXTURE-CIN-0002", "TEST FIXTURE MILLS LIMITED", "TEST FIXTURE MILLS", "Strike Off"),
    (
        "TESTFIXTURE-CIN-0003",
        "TEST FIXTURE AGRO INDUSTRIES LIMITED",
        "TEST FIXTURE AGRO INDUSTRIES",
        "Active",
    ),
)


@pytest.fixture(scope="module")
def conn():
    """Yield a connection whose ``companies`` table holds only the fixtures."""
    if not db.is_available():
        pytest.skip("local registry database not reachable (see MCA_SETUP.md)")

    db.apply_sql_file(SCHEMA_PATH)  # idempotent; guarantees public.companies exists

    with db.connection() as connection:
        with connection.cursor() as cur:
            cur.execute(
                "CREATE TEMP TABLE companies "
                "(LIKE public.companies INCLUDING DEFAULTS INCLUDING CONSTRAINTS)"
            )
            cur.executemany(
                "INSERT INTO companies (cin, name, name_normalized, status) "
                "VALUES (%s, %s, %s, %s)",
                _FIXTURES,
            )
        connection.commit()
        yield connection


def test_find_by_cin_is_exact_and_whitespace_tolerant(conn) -> None:
    row = mca.find_by_cin("  testfixture-cin-0001  ", conn=conn)
    assert row is not None
    assert row["name"] == "TEST FIXTURE FOODS PRIVATE LIMITED"
    assert row["status"] == "Active"
    assert row["similarity"] == 1.0


def test_find_by_cin_unknown_returns_none(conn) -> None:
    assert mca.find_by_cin("TESTFIXTURE-CIN-9999", conn=conn) is None
    assert mca.find_by_cin(None, conn=conn) is None
    assert mca.find_by_cin("   ", conn=conn) is None


def test_find_by_cin_without_a_name_has_no_comparison(conn) -> None:
    """No printed name -> nothing to compare, and the row says so explicitly."""
    row = mca.find_by_cin("TESTFIXTURE-CIN-0001", conn=conn)
    assert row is not None
    assert row["name_similarity"] is None


def test_find_by_cin_compares_the_printed_name_in_the_same_statement(conn) -> None:
    """The name comparison ships with the CIN lookup, so it cannot fail alone.

    Real database, real ``pg_trgm``: this is the metric ``check_company`` relies on
    to refuse a CIN pass when the printed maker name is a different company.
    """
    same = mca.find_by_cin(
        "TESTFIXTURE-CIN-0001", name="Test Fixture Foods Pvt. Ltd.", conn=conn
    )
    assert same is not None
    assert same["name_similarity"] == 1.0  # legal-form tokens are normalised away

    other = mca.find_by_cin(
        "TESTFIXTURE-CIN-0001", name="Completely Unrelated Chemicals", conn=conn
    )
    assert other is not None
    assert other["name_similarity"] < providers.CIN_NAME_MATCH_THRESHOLD


def test_match_company_carries_name_similarity_for_a_cin_hit(conn) -> None:
    """A CIN hit hands the caller the comparison it needs, not just the row."""
    row = mca.match_company(
        cin="TESTFIXTURE-CIN-0001", name="Test Fixture Foods Ltd", conn=conn
    )
    assert row is not None
    assert row["matched_on"] == "cin"
    assert row["name_similarity"] == 1.0


def test_check_company_refuses_a_pass_when_the_real_similarity_is_low(
    conn, monkeypatch
) -> None:
    """Whole path, real ``pg_trgm``: the CIN is right but the printed name is not.

    Only the connection is injected, so ``check_company`` -> ``match_company`` ->
    ``find_by_cin`` -> ``similarity()`` all run for real. The mocked tests in
    ``tests/test_providers.py`` assert the policy; this one shows the policy is
    reachable with the actual database.
    """
    real_match_company = mca.match_company

    def _match_company_with_conn(*, name=None, cin=None):
        return real_match_company(name=name, cin=cin, conn=conn)

    monkeypatch.setattr(providers.mca, "match_company", _match_company_with_conn)

    conflicting = providers.check_company(
        manufacturer_name="Completely Unrelated Chemicals",
        cin="TESTFIXTURE-CIN-0001",
    )
    assert conflicting["status"] == "warn"
    flag = conflicting["flags"][0]
    assert flag["code"] == "MCA_NAME_MISMATCH"
    assert flag["evidence"]["registry_name"] == "TEST FIXTURE FOODS PRIVATE LIMITED"
    assert flag["evidence"]["manufacturer"] == "Completely Unrelated Chemicals"
    assert flag["evidence"]["name_similarity"] < providers.CIN_NAME_MATCH_THRESHOLD

    # The same CIN with the register's own name still passes - the new check is
    # not a blanket downgrade of every CIN hit.
    agreeing = providers.check_company(
        manufacturer_name="Test Fixture Foods Pvt. Ltd.",
        cin="TESTFIXTURE-CIN-0001",
    )
    assert agreeing["status"] == "pass"
    assert agreeing["flags"] == []


def test_search_by_name_ignores_legal_suffixes(conn) -> None:
    rows = mca.search_by_name("Test Fixture Foods Pvt. Ltd.", conn=conn)
    assert rows[0]["cin"] == "TESTFIXTURE-CIN-0001"
    assert rows[0]["similarity"] == 1.0


def test_search_by_name_respects_limit(conn) -> None:
    assert len(mca.search_by_name("Test Fixture", limit=2, conn=conn)) == 2


def test_match_company_prefers_the_cin(conn) -> None:
    row = mca.match_company(
        name="Something Entirely Different",
        cin="TESTFIXTURE-CIN-0002",
        conn=conn,
    )
    assert row is not None
    assert row["matched_on"] == "cin"
    assert row["cin"] == "TESTFIXTURE-CIN-0002"


def test_match_company_by_name_only(conn) -> None:
    row = mca.match_company(name="Test Fixture Mills Ltd", conn=conn)
    assert row is not None
    assert row["matched_on"] == "name"
    assert row["cin"] == "TESTFIXTURE-CIN-0002"
    assert row["similarity"] >= mca.NAME_MATCH_THRESHOLD


def test_match_company_unrelated_name_is_none(conn) -> None:
    """No confident match -> ``None`` (a miss is never a failure)."""
    assert mca.match_company(name="Completely Unrelated Chemicals", conn=conn) is None


def test_match_company_result_is_json_safe(conn) -> None:
    """Dates come back as text so a match can go straight into flag evidence."""
    row = mca.match_company(name="Test Fixture Mills Ltd", conn=conn)
    assert isinstance(json.dumps(row), str)


def test_registry_stats_reports_the_snapshot(conn) -> None:
    stats = mca.registry_stats(conn=conn)
    assert stats["connected"] is True
    assert stats["companies"] == len(_FIXTURES)


# --- Policy: providers.check_company mapping ---------------------------------


def _stub_match(monkeypatch: pytest.MonkeyPatch, result: dict | None) -> None:
    """Replace the matcher so the mapping is tested without registry data."""
    monkeypatch.setattr(providers.mca, "match_company", lambda **_kwargs: result)


def _match(
    *,
    cin: str = "TESTFIXTURE-CIN-0001",
    name: str = "TEST FIXTURE FOODS PRIVATE LIMITED",
    status: str | None = "Active",
    similarity: float = 1.0,
    matched_on: str = "cin",
    name_similarity: float | None = None,
) -> dict:
    """Build a matcher result with the shape ``backend.mca`` produces.

    ``name_similarity`` mirrors the extra column ``mca.find_by_cin`` computes when a
    printed name is supplied: the ``pg_trgm`` similarity between the normalised
    printed name and the register row's own name. ``None`` means the lookup had no
    name to compare against.
    """
    return {
        "cin": cin,
        "name": name,
        "status": status,
        "similarity": similarity,
        "matched_on": matched_on,
        "name_similarity": name_similarity,
    }


def test_check_company_without_a_match_stays_not_checked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No snapshot hit -> the honest placeholder, and no flag."""
    _stub_match(monkeypatch, None)
    check = providers.check_company(manufacturer_name="Anything", cin="X")
    assert check == {"id": "company", "status": "not_checked", "flags": []}


def test_check_company_without_any_fields_stays_not_checked() -> None:
    """Nothing on the label -> nothing is claimed."""
    assert providers.check_company()["status"] == providers.STATUS_NOT_CHECKED


def test_check_company_cin_hit_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_match(monkeypatch, _match())
    check = providers.check_company(cin="TESTFIXTURE-CIN-0001")
    assert check["status"] == "pass"
    assert check["flags"] == []


def test_check_company_accepts_the_bulk_export_active_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The MCA bulk export writes ``ACTV`` where the portal writes ``Active``.

    Missing this would downgrade every live company to a high-severity "not
    Active" warning - a false accusation, and the opposite of the point.
    """
    _stub_match(monkeypatch, _match(status="ACTV"))
    check = providers.check_company(cin="TESTFIXTURE-CIN-0001")
    assert check["status"] == "pass"
    assert check["flags"] == []


def test_check_company_bulk_export_strike_off_code_still_warns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codes that are not Active must keep warning - the fix is not a blanket pass."""
    _stub_match(monkeypatch, _match(status="STOF"))
    check = providers.check_company(cin="TESTFIXTURE-CIN-0002")
    assert check["status"] == "warn"
    assert check["flags"][0]["code"] == "MCA_COMPANY_NOT_ACTIVE"


@pytest.mark.parametrize("status", ["Active", "ACTIVE", "active", "ACTV", "  actv  "])
def test_is_active_status_accepts_both_register_spellings(status: str) -> None:
    assert providers._is_active_status(status)


@pytest.mark.parametrize("status", ["Strike Off", "STOF", "AMAL", "ULQD", "Dissolved"])
def test_is_active_status_rejects_every_other_status(status: str) -> None:
    assert not providers._is_active_status(status)


def test_check_company_inactive_cin_warns(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_match(monkeypatch, _match(status="Strike Off"))
    check = providers.check_company(cin="TESTFIXTURE-CIN-0002")
    assert check["status"] == "warn"
    flag = check["flags"][0]
    assert flag["code"] == "MCA_COMPANY_NOT_ACTIVE"
    assert flag["severity"] == "high"
    assert flag["en"] and flag["hi"]  # both languages present
    assert flag["evidence"]["status"] == "Strike Off"
    assert flag["evidence"]["matched_on"] == "cin"


def test_check_company_missing_status_is_not_a_confirmed_pass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: a CIN hit with no recorded status must never pass.

    The CIN proves the register *contains* the company; it says nothing about
    whether that company is still live. A missing status is therefore a warning
    for the user to confirm, not a confirmed active-company pass.
    """
    _stub_match(monkeypatch, _match(status=None))
    check = providers.check_company(cin="TESTFIXTURE-CIN-0001")
    assert check["status"] == "warn"
    flag = check["flags"][0]
    assert flag["code"] == "MCA_COMPANY_STATUS_UNKNOWN"
    assert flag["severity"] == "medium"
    assert flag["en"] and flag["hi"]  # both languages present
    assert flag["evidence"]["matched_on"] == "cin"
    assert flag["evidence"]["status"] is None


@pytest.mark.parametrize("blank", ["", "   ", "\t"])
def test_check_company_blank_status_is_not_a_confirmed_pass(
    monkeypatch: pytest.MonkeyPatch, blank: str
) -> None:
    """A whitespace-only status is the same "no information" as a null one."""
    _stub_match(monkeypatch, _match(status=blank))
    check = providers.check_company(cin="TESTFIXTURE-CIN-0001")
    assert check["status"] == "warn"
    assert check["flags"][0]["code"] == "MCA_COMPANY_STATUS_UNKNOWN"


def test_check_company_name_only_match_on_an_active_record_warns_low(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A fuzzy name hit on an Active record is a weak signal: warn, ask for the CIN."""
    _stub_match(
        monkeypatch,
        _match(
            name="TEST FIXTURE MILLS LIMITED",
            status="Active",
            similarity=0.91,
            matched_on="name",
        ),
    )
    check = providers.check_company(manufacturer_name="Test Fixture Mills Ltd")
    assert check["status"] == "warn"
    flag = check["flags"][0]
    assert flag["code"] == "MCA_NAME_ONLY_MATCH"
    assert flag["severity"] == "low"
    assert flag["evidence"]["similarity"] == 0.91


def test_check_company_name_only_match_on_a_struck_off_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: a name-only hit on a struck-off record used to be ``low``.

    Both doubts have to be reported, because either one alone understates the
    situation: the identity is unconfirmed *and* the record is not Active.
    """
    _stub_match(
        monkeypatch,
        _match(
            name="TEST FIXTURE MILLS LIMITED",
            status="Strike Off",
            similarity=0.91,
            matched_on="name",
        ),
    )
    check = providers.check_company(manufacturer_name="Test Fixture Mills Ltd")
    assert check["status"] == "warn"
    flag = check["flags"][0]
    assert flag["code"] == "MCA_NAME_ONLY_MATCH_NOT_ACTIVE"
    assert flag["severity"] == "medium"
    assert flag["evidence"]["status"] == "Strike Off"
    assert flag["evidence"]["matched_on"] == "name"
    assert flag["evidence"]["similarity"] == 0.91
    # The message must carry both facts, not just one.
    assert "by name only" in flag["en"]
    assert "not Active" in flag["en"]
    assert "Strike Off" in flag["en"]
    assert flag["hi"]


def test_check_company_name_only_match_without_a_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A missing status is *unknown*, never "not Active".

    The snapshot not recording a status is a gap in the export, not a statement
    that the company is inactive - and the name-only match means the identity is
    unconfirmed too. Both doubts have to be visible.
    """
    _stub_match(monkeypatch, _match(status=None, similarity=0.9, matched_on="name"))
    check = providers.check_company(manufacturer_name="Test Fixture Mills Ltd")
    assert check["status"] == "warn"
    flag = check["flags"][0]
    assert flag["code"] == "MCA_NAME_ONLY_MATCH_STATUS_UNKNOWN"
    assert flag["severity"] == "medium"
    lowered = flag["en"].lower()
    # It must not assert inactivity the export does not state ...
    assert "not active" not in lowered
    assert "inactive" not in lowered
    # ... while still naming the unconfirmed name-only identity as the reason to check.
    assert "by name only" in lowered
    assert "confirm the cin" in lowered
    assert flag["evidence"]["status"] is None
    assert flag["evidence"]["matched_on"] == "name"
    assert flag["hi"]  # both languages present


def test_name_only_status_distinguishes_explicit_from_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An explicitly non-active record and a status-less one are different statements."""
    _stub_match(monkeypatch, _match(status="Strike Off", similarity=0.9, matched_on="name"))
    explicit = providers.check_company(manufacturer_name="Test Fixture Mills Ltd")["flags"][0]

    _stub_match(monkeypatch, _match(status=None, similarity=0.9, matched_on="name"))
    unknown = providers.check_company(manufacturer_name="Test Fixture Mills Ltd")["flags"][0]

    assert explicit["code"] == "MCA_NAME_ONLY_MATCH_NOT_ACTIVE"
    assert unknown["code"] == "MCA_NAME_ONLY_MATCH_STATUS_UNKNOWN"
    assert "not Active" in explicit["en"]
    assert "not active" not in unknown["en"].lower()


def test_name_only_struck_off_no_longer_scores_eighty_at_low_risk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The reported bug, end to end: 80 / low_risk for a struck-off name match."""
    _stub_match(
        monkeypatch,
        _match(status="Strike Off", similarity=0.91, matched_on="name"),
    )
    result = providers.build_verification(manufacturer_name="Test Fixture Mills Ltd")
    assert result["checks_ran"] == 1
    assert result["score"] == 50  # the 40-point company check keeps half its credit
    assert result["verdict"] == providers.VERDICT_MEDIUM_RISK


def test_missing_status_no_longer_scores_a_hundred_at_low_risk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The second half of the bug: a status-less CIN hit used to score 100."""
    _stub_match(monkeypatch, _match(status=None))
    result = providers.build_verification(cin="TESTFIXTURE-CIN-0001")
    assert result["score"] == 50
    assert result["verdict"] == providers.VERDICT_MEDIUM_RISK


@pytest.mark.parametrize(
    ("status", "matched_on"),
    [("Active", "cin"), ("Strike Off", "cin"), (None, "name")],
)
def test_check_company_never_fails(
    monkeypatch: pytest.MonkeyPatch, status: str | None, matched_on: str
) -> None:
    """No outcome is a failure: the snapshot cannot prove a company is fake."""
    _stub_match(
        monkeypatch,
        _match(
            status=status,
            matched_on=matched_on,
            similarity=1.0 if matched_on == "cin" else 0.8,
        ),
    )
    assert providers.check_company(cin="X")["status"] in {"pass", "warn", "not_checked"}


def test_verify_company_pass_flows_through_the_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The company check serialises exactly like the frozen contract."""
    _stub_match(monkeypatch, _match())
    data = TestClient(app).post("/api/verify", json={"cin": "TESTFIXTURE-CIN-0001"}).json()
    company = next(c for c in data["checks"] if c["id"] == "company")
    assert company == {"id": "company", "status": "pass", "flags": []}
    # The licence check is still not_checked (no FSSAI), and label_law runs
    # on the body we sent — it has only ``cin``, so every other required
    # declaration is missing, producing a ``fail`` with high-severity flags.
    assert [c["id"] for c in data["checks"]] == ["company", "licence", "label_law"]
    assert data["checks_ran"] == 2
    # Score is computed from the *checks that ran* (company + label_law),
    # normalised by their combined weight. company=pass (40), label_law=fail
    # (0), so 40/65 = 61.5 -> 62.
    assert 50 <= data["score"] <= 70
    assert data["verdict"] == "high_risk"


# --- CIN + printed manufacturer name consistency ------------------------------
#
# MOCKED: the matcher is stubbed, so these assert *policy* - what the check does
# with a CIN hit whose printed name disagrees - not the real register's contents.


def test_cin_with_a_matching_printed_name_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    """The ordinary legal-form variation reconciles, so the CIN pass stands."""
    _stub_match(monkeypatch, _match(name_similarity=1.0))
    check = providers.check_company(
        manufacturer_name="Test Fixture Foods Pvt. Ltd.",
        cin="TESTFIXTURE-CIN-0001",
    )
    assert check["status"] == "pass"
    assert check["flags"] == []


def test_legal_suffix_variation_never_reaches_the_similarity_test(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``normalize_name`` drops PVT/LTD/LIMITED, so the comparison is an exact match.

    The stubbed similarity is deliberately 0.0: reconciliation must come from
    normalisation alone, so a suffix variation can never be flagged just because a
    trigram score came out low.
    """
    _stub_match(monkeypatch, _match(name_similarity=0.0))
    check = providers.check_company(
        manufacturer_name="Test Fixture Foods Limited",
        cin="TESTFIXTURE-CIN-0001",
    )
    assert check["status"] == "pass"
    assert check["flags"] == []


def test_cin_with_a_conflicting_printed_name_does_not_pass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A real CIN must not carry a different company's printed name to a pass."""
    _stub_match(monkeypatch, _match(name_similarity=0.11))
    check = providers.check_company(
        manufacturer_name="Completely Unrelated Chemicals",
        cin="TESTFIXTURE-CIN-0001",
    )
    assert check["status"] == "warn"
    flag = check["flags"][0]
    assert flag["code"] == "MCA_NAME_MISMATCH"
    assert flag["severity"] == "medium"
    assert flag["en"] and flag["hi"]
    # Evidence carries BOTH names so the user can compare them.
    assert flag["evidence"]["manufacturer"] == "Completely Unrelated Chemicals"
    assert flag["evidence"]["registry_name"] == "TEST FIXTURE FOODS PRIVATE LIMITED"
    assert flag["evidence"]["cin"] == "TESTFIXTURE-CIN-0001"
    assert flag["evidence"]["name_similarity"] == 0.11
    assert flag["evidence"]["matched_on"] == "cin"
    # It asks for confirmation; it does not accuse anyone of anything.
    lowered = flag["en"].lower()
    assert "fraud" not in lowered and "fake" not in lowered
    assert "confirm on the mca portal" in lowered


def test_cin_without_a_printed_name_is_unaffected(monkeypatch: pytest.MonkeyPatch) -> None:
    """Nothing to compare -> the CIN alone still settles identity."""
    _stub_match(monkeypatch, _match(name_similarity=None))
    check = providers.check_company(cin="TESTFIXTURE-CIN-0001")
    assert check["status"] == "pass"
    assert check["flags"] == []


@pytest.mark.parametrize("blank", ["", "   ", "\t"])
def test_cin_with_a_blank_printed_name_is_unaffected(
    monkeypatch: pytest.MonkeyPatch, blank: str
) -> None:
    """A blank form field is not a conflicting name."""
    _stub_match(monkeypatch, _match(name_similarity=0.05))
    check = providers.check_company(
        manufacturer_name=blank, cin="TESTFIXTURE-CIN-0001"
    )
    assert check["status"] == "pass"


def test_unfamiliar_abbreviation_requires_confirmation_not_a_false_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An abbreviation scores below the threshold -> warn, never `fail`."""
    _stub_match(
        monkeypatch,
        _match(
            name="TEST FIXTURE AGRO INDUSTRIES LIMITED",
            name_similarity=providers.CIN_NAME_MATCH_THRESHOLD - 0.01,
        ),
    )
    check = providers.check_company(
        manufacturer_name="T.F. Agro Inds", cin="TESTFIXTURE-CIN-0003"
    )
    assert check["status"] == "warn"
    assert check["flags"][0]["code"] == "MCA_NAME_MISMATCH"


def test_name_similarity_at_the_threshold_reconciles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The threshold is inclusive, and it is the same one the matcher uses."""
    assert providers.CIN_NAME_MATCH_THRESHOLD == mca.NAME_MATCH_THRESHOLD
    _stub_match(
        monkeypatch, _match(name_similarity=providers.CIN_NAME_MATCH_THRESHOLD)
    )
    check = providers.check_company(
        manufacturer_name="Test Fixture Foooods Ltd", cin="TESTFIXTURE-CIN-0001"
    )
    assert check["status"] == "pass"


def test_cin_inactive_and_conflicting_name_reports_both_flags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The name and the status are independent findings, so both are reported."""
    _stub_match(monkeypatch, _match(status="Strike Off", name_similarity=0.1))
    check = providers.check_company(
        manufacturer_name="Someone Else Ltd", cin="TESTFIXTURE-CIN-0001"
    )
    assert check["status"] == "warn"
    assert [f["code"] for f in check["flags"]] == [
        "MCA_NAME_MISMATCH",
        "MCA_COMPANY_NOT_ACTIVE",
    ]


def test_conflicting_name_no_longer_scores_a_hundred_at_low_risk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End to end: an active CIN with the wrong printed name used to score 100."""
    _stub_match(monkeypatch, _match(name_similarity=0.1))
    result = providers.build_verification(
        manufacturer_name="Completely Unrelated Chemicals",
        cin="TESTFIXTURE-CIN-0001",
    )
    assert result["checks_ran"] == 1
    assert result["score"] == 50  # the 40-point company check keeps half its credit
    assert result["verdict"] == providers.VERDICT_MEDIUM_RISK
