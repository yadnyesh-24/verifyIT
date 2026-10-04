"""Test setup: point pytesseract at the Tesseract binary on Windows.

Lets the team's ``.env`` override the path, but defaults to the
UB-Mannheim installer location so the suite runs out of the box.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Default Windows install path for the UB-Mannheim build.
_DEFAULT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def _find_tesseract() -> str | None:
    env_cmd = os.environ.get("TESSERACT_CMD")
    if env_cmd and Path(env_cmd).exists():
        return env_cmd
    if Path(_DEFAULT).exists():
        return _DEFAULT
    # Last resort: rely on PATH (returns None if not found, let pytesseract fail).
    return None


cmd = _find_tesseract()
if cmd:
    os.environ.setdefault("TESSERACT_CMD", cmd)
    # Make sure the directory is on PATH for the test subprocess.
    tdir = str(Path(cmd).parent)
    if tdir.lower() not in os.environ.get("PATH", "").lower().split(os.pathsep):
        os.environ["PATH"] = tdir + os.pathsep + os.environ.get("PATH", "")