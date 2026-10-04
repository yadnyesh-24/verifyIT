"""Configuration guards for the Supabase toolchain's connection helper.

``backend/app/db.py`` is a *separate* database door from the API's
``backend/db.py``: it points at Supabase and is used by the pincode / state import
scripts. It used to call ``load_dotenv(backend/.env, override=True)``, which wrote
Supabase's ``DATABASE_URL`` into the whole process - and would therefore silently
repoint the API's registry connection at Supabase for the rest of the run.

These tests pin the precedence that replaced it and prove nothing is written back
into ``os.environ``. They are pure: no connection is ever opened.
"""

from __future__ import annotations

import ast
import os
import pathlib
import sys

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app import db as supabase_db  # noqa: E402  (after the sys.path setup)

SUPABASE_DSN = (
    "postgresql://postgres.projectref:secret@aws-0-region.pooler.supabase.com:5432/postgres"
)
LOCAL_DSN = "postgresql://127.0.0.1:5432/verifyit"


@pytest.fixture(autouse=True)
def no_ambient_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start every test with no ``DATABASE_URL``, so each states its own precedence."""
    monkeypatch.delenv("DATABASE_URL", raising=False)


@pytest.fixture()
def env_file(tmp_path: pathlib.Path) -> pathlib.Path:
    """A stand-in for ``backend/.env`` holding a Supabase URL."""
    path = tmp_path / "backend.env"
    path.write_text(f"DATABASE_URL={SUPABASE_DSN}\n", encoding="utf-8")
    return path


def test_environment_variable_wins_over_the_env_file(
    env_file: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An explicitly exported ``DATABASE_URL`` must never be silently replaced."""
    monkeypatch.setenv("DATABASE_URL", LOCAL_DSN)
    assert supabase_db.resolve_dsn(env_file) == LOCAL_DSN


def test_env_file_is_used_when_the_environment_is_silent(env_file: pathlib.Path) -> None:
    assert supabase_db.resolve_dsn(env_file) == SUPABASE_DSN


def test_missing_env_file_resolves_to_none(tmp_path: pathlib.Path) -> None:
    assert supabase_db.resolve_dsn(tmp_path / "absent.env") is None


def test_blank_env_file_value_is_treated_as_unset(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "blank.env"
    path.write_text("DATABASE_URL=\n", encoding="utf-8")
    assert supabase_db.resolve_dsn(path) is None


def test_resolving_never_writes_into_the_process_environment(
    env_file: pathlib.Path,
) -> None:
    """The whole point of the fix.

    ``backend/db.py`` resolves the API's registry URL from the environment. If this
    module wrote Supabase's URL there, the API would quietly start reading the
    Supabase database instead of the local snapshot - a switch nobody asked for and
    nothing would report.
    """
    assert "DATABASE_URL" not in os.environ
    supabase_db.resolve_dsn(env_file)
    assert "DATABASE_URL" not in os.environ


def test_helper_parses_the_file_instead_of_loading_it() -> None:
    """Source guard: ``load_dotenv`` mutates ``os.environ``; ``dotenv_values`` does not.

    Parsed rather than grepped, so the module's own docstring - which *describes*
    the old ``load_dotenv`` bug - cannot make this test pass by accident.
    """
    tree = ast.parse((REPO_ROOT / "backend" / "app" / "db.py").read_text(encoding="utf-8"))

    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "dotenv":
            imported.update(alias.name for alias in node.names)
    assert imported == {"dotenv_values"}

    called = {
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    assert "load_dotenv" not in called


def test_get_conn_fails_fast_without_any_configuration(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No DSN anywhere -> a clear error, and no connection attempt."""
    monkeypatch.setattr(supabase_db, "_ENV_PATH", tmp_path / "absent.env")
    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        with supabase_db.get_conn():
            pass  # pragma: no cover - the context manager must not be entered
