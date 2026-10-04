"""Repository-hygiene guards: failures here are invisible until they bite.

The frontend's source directory is called ``lib/``, and the Python block in
``.gitignore`` carries a ``lib/`` rule meant for *build artefacts*. Git applies
that rule at every depth, so ``frontend/lib/`` was silently excluded from every
commit: the app could not build from a fresh clone and nothing said why.

These tests deliberately assert the **ignore rules**, using hypothetical paths
rather than real ones. That keeps the backend suite independent of what the
frontend contains and of who is building it - a teammate restructuring
``frontend/`` must never be able to fail a backend test.
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

#: Hypothetical paths - ``git check-ignore`` matches patterns and does not care
#: whether the file exists, which is exactly what keeps these tests decoupled.
FRONTEND_SOURCES = (
    "frontend/lib/any-module.ts",
    "frontend/lib/any-component.tsx",
    "frontend/lib/nested/any-module.ts",
)

#: Build artefacts that must stay out of the repository.
FRONTEND_ARTEFACTS = (
    "frontend/node_modules/next/package.json",
    "frontend/.next/BUILD_ID",
)

#: The Python rule that started all this must keep working. A bare ``lib/`` path -
#: which *only* the ``lib/`` rule matches, so this isolates the rule under test.
PYTHON_BUILD_LIB = "lib/some_build_output.py"


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


requires_git = pytest.mark.skipif(
    shutil.which("git") is None or not (REPO_ROOT / ".git").exists(),
    reason="needs a git checkout",
)


def test_gitignore_keeps_the_frontend_lib_negation() -> None:
    """The negation is the only reason a frontend ``lib/`` module is committable."""
    lines = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "!frontend/lib/" in lines
    assert "!frontend/lib/**" in lines


def _is_gitignored(path: str) -> bool:
    """Return ``True`` when the ignore rules exclude ``path``.

    ``--no-index`` asks purely about the rules, so the answer does not change once
    a path is tracked.
    """
    return _git("check-ignore", "--no-index", "-q", path).returncode == 0


@requires_git
@pytest.mark.parametrize("path", FRONTEND_SOURCES)
def test_frontend_lib_sources_are_committable(path: str) -> None:
    """No ignore rule may swallow a frontend source module.

    This is the regression that went unnoticed: every file under ``frontend/lib/``
    was ignored, so the app shipped without its types, api, i18n, mocks, store and
    ``cn`` modules.
    """
    assert not _is_gitignored(path), f"{path} is git-ignored and would never be committed"


@requires_git
def test_python_build_lib_is_still_ignored() -> None:
    """The negation must not weaken the rule it exists to work around."""
    assert _is_gitignored(PYTHON_BUILD_LIB), f"{PYTHON_BUILD_LIB} should still be ignored"


@requires_git
@pytest.mark.parametrize("path", FRONTEND_ARTEFACTS)
def test_frontend_build_artefacts_stay_ignored(path: str) -> None:
    """The dependency tree and build output must never be committed."""
    assert _is_gitignored(path), f"{path} is not git-ignored"
