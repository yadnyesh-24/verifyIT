"""Repository-hygiene guards: failures here are invisible until they bite.

The frontend's source directory is called ``lib/``, and the Python block in
``.gitignore`` carries a ``lib/`` rule meant for *build artefacts*. Git applies
that rule at every depth, so ``frontend/lib/`` was silently excluded from every
commit: the app could not build from a fresh clone and nothing said why. These
tests keep the negation in place.
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

#: The frontend modules that must be committable.
FRONTEND_LIB_MODULES = (
    "api.ts",
    "i18n.ts",
    "mocks.ts",
    "scan-store.tsx",
    "types.ts",
    "utils.ts",
)


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
    """The negation is the only reason the modules are committable - keep it."""
    lines = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "!frontend/lib/" in lines
    assert "!frontend/lib/**" in lines


@requires_git
@pytest.mark.parametrize("name", FRONTEND_LIB_MODULES)
def test_frontend_lib_module_is_not_gitignored(name: str) -> None:
    """No ignore rule may swallow a frontend source module.

    ``--no-index`` asks purely about the ignore rules, so the result does not
    change once the file is tracked.
    """
    path = f"frontend/lib/{name}"
    result = _git("check-ignore", "--no-index", "-q", path)
    assert result.returncode == 1, (
        f"{path} is git-ignored and would never be committed "
        f"(git check-ignore exited {result.returncode})"
    )


@requires_git
def test_frontend_lib_modules_all_exist() -> None:
    """A negation is useless if the modules are not there."""
    missing = [
        name
        for name in FRONTEND_LIB_MODULES
        if not (REPO_ROOT / "frontend" / "lib" / name).is_file()
    ]
    assert missing == []


@requires_git
def test_frontend_build_artefacts_stay_ignored() -> None:
    """The frontend's dependency tree and build output must never be committed."""
    for path in ("frontend/node_modules/next/package.json", "frontend/.next/BUILD_ID"):
        result = _git("check-ignore", "--no-index", "-q", path)
        assert result.returncode == 0, f"{path} is not git-ignored"
