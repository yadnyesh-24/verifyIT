"""Tests for ``scripts/check_registry.py`` - the registry snapshot doctor.

``scripts/`` is not a package, so the module is loaded by path, the same way
``tests/test_mca.py`` loads ``import_mca.py``.

Every test here is pure or points at a dead port, so the suite still passes with
no registry database running.
"""

import importlib.util
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

#: Supabase's direct host: IPv6-only, so it only fails on an IPv4 network.
DIRECT_SUPABASE_URL = "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres"

#: Supabase's transaction pooler: no prepared statements, no TEMP tables.
POOLER_TRANSACTION_URL = (
    "postgresql://postgres.abcdefgh:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
)

#: A port nothing listens on, to prove the failure path without any database.
DEAD_URL = "postgresql://127.0.0.1:1/verifyit"


def _load_check_registry():
    """Import ``scripts/check_registry.py`` by path (``scripts/`` is not a package)."""
    path = REPO_ROOT / "scripts" / "check_registry.py"
    spec = importlib.util.spec_from_file_location("check_registry", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


doctor = _load_check_registry()


# --- mask_password: never print a credential ---------------------------------


def test_mask_password_hides_the_password_but_keeps_the_rest():
    masked = doctor.mask_password(
        "postgresql://postgres.abcdefgh:sup3r-s3cret"
        "@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    )
    assert "sup3r-s3cret" not in masked
    assert masked == (
        "postgresql://postgres.abcdefgh:***"
        "@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    )


def test_mask_password_leaves_a_credential_free_url_untouched():
    assert doctor.mask_password("postgresql://127.0.0.1:5432/verifyit") == (
        "postgresql://127.0.0.1:5432/verifyit"
    )


# --- _print_hints: name the mistake the driver will not explain here ---------


def test_hints_flag_the_ipv6_only_direct_host(capsys):
    doctor._print_hints(DIRECT_SUPABASE_URL, "connection failed")
    out = capsys.readouterr().out
    assert "IPv6" in out
    assert "pooler" in out


def test_hints_flag_the_transaction_pooler(capsys):
    doctor._print_hints(POOLER_TRANSACTION_URL, "connection failed")
    out = capsys.readouterr().out
    assert "6543" in out and "5432" in out


def test_hints_flag_a_pooler_tenant_mismatch(capsys):
    doctor._print_hints(
        POOLER_TRANSACTION_URL, "FATAL: (ENOTFOUND) tenant/user postgres.nope not found"
    )
    assert "postgres.<project-ref>" in capsys.readouterr().out


def test_hints_flag_a_paused_project(capsys):
    doctor._print_hints(POOLER_TRANSACTION_URL, "connection timed out")
    assert "paused" in capsys.readouterr().out


def test_hints_stay_quiet_for_an_unrelated_error(capsys):
    doctor._print_hints("postgresql://127.0.0.1:5432/verifyit", "syntax error at or near")
    assert capsys.readouterr().out == ""


# --- main: exit codes --------------------------------------------------------


def test_main_exits_2_when_the_database_cannot_be_reached(monkeypatch, capsys):
    # monkeypatch restores DATABASE_URL afterwards, so the other test modules
    # still see the real registry configuration.
    monkeypatch.setenv("DATABASE_URL", DEAD_URL)
    assert doctor.main(["--timeout", "2"]) == 2
    out = capsys.readouterr().out
    assert "cannot connect" in out
    assert "pw" not in out and DEAD_URL in out


def test_main_points_at_the_override_instead_of_the_environment(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:5432/verifyit")
    assert doctor.main(["--database-url", DEAD_URL, "--timeout", "2"]) == 2
    assert DEAD_URL in capsys.readouterr().out
